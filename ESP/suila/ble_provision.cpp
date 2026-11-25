#include "ble_provision.h"

#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <WiFi.h>
#include <esp_random.h>
#include <mbedtls/aes.h>
#include <mbedtls/sha256.h>

#include "config.h"
#include "debug_port.h"

static const char *SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
static const char *CHAR_RX_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E";
static const char *CHAR_TX_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";

static BLECharacteristic *txChar = nullptr;
static bool connected = false;
static bool authorized = false;
static bool helloSent = false;
static unsigned long connectedAt = 0;
static String rxLine;
static String pendingLine;
static bool hasPending = false;
static uint8_t sessionKey[16];
static uint8_t nonce[16];
static String sessionDeviceId;
static ProvWifiApplyFn onApply = nullptr;
static ProvWifiClearFn onClear = nullptr;
static ProvWifiBusyFn isBusy = nullptr;

static String toHex(const uint8_t *data, size_t len) {
  static const char *hex = "0123456789abcdef";
  String out;
  out.reserve(len * 2);
  for (size_t i = 0; i < len; i++) {
    out += hex[(data[i] >> 4) & 0x0F];
    out += hex[data[i] & 0x0F];
  }
  return out;
}

static bool fromHex(const String &hex, uint8_t *out, size_t outLen) {
  if (hex.length() != static_cast<int>(outLen * 2)) {
    return false;
  }
  auto nibble = [](char c) -> int {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
  };
  for (size_t i = 0; i < outLen; i++) {
    int hi = nibble(hex[i * 2]);
    int lo = nibble(hex[i * 2 + 1]);
    if (hi < 0 || lo < 0) {
      return false;
    }
    out[i] = static_cast<uint8_t>((hi << 4) | lo);
  }
  return true;
}

static void deriveSessionKey() {
  uint8_t hash[32];
  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  mbedtls_sha256_starts(&ctx, 0);
  mbedtls_sha256_update(&ctx, reinterpret_cast<const uint8_t *>(PROV_SECRET), strlen(PROV_SECRET));
  mbedtls_sha256_update(&ctx, reinterpret_cast<const uint8_t *>(sessionDeviceId.c_str()),
                        sessionDeviceId.length());
  mbedtls_sha256_update(&ctx, nonce, sizeof(nonce));
  mbedtls_sha256_finish(&ctx, hash);
  mbedtls_sha256_free(&ctx);
  memcpy(sessionKey, hash, 16);
}

static String expectedAuthToken() {
  uint8_t hash[32];
  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  mbedtls_sha256_starts(&ctx, 0);
  mbedtls_sha256_update(&ctx, reinterpret_cast<const uint8_t *>("AUTH"), 4);
  mbedtls_sha256_update(&ctx, sessionKey, 16);
  mbedtls_sha256_finish(&ctx, hash);
  mbedtls_sha256_free(&ctx);
  return toHex(hash, 8);
}

static void notify(const String &msg) {
  if (!connected || txChar == nullptr) {
    return;
  }
  String line = msg;
  if (!line.endsWith("\n")) {
    line += "\n";
  }
  // 不記錄敏感內容
  CONSOLE.print(F("BLE_TX "));
  if (line.startsWith("LIST") || line.startsWith("HELLO") || line.startsWith("WIFI_OK") ||
      line.startsWith("WIFI_FAIL") || line.startsWith("CLEARED") || line.startsWith("ERR") ||
      line.startsWith("AUTH_OK")) {
    CONSOLE.print(line);
  } else {
    CONSOLE.println(F("(hidden)"));
  }
  const int chunk = 180;
  for (int i = 0; i < static_cast<int>(line.length()); i += chunk) {
    String part = line.substring(i, min(i + chunk, static_cast<int>(line.length())));
    txChar->setValue(reinterpret_cast<uint8_t *>(const_cast<char *>(part.c_str())), part.length());
    txChar->notify();
    delay(8);
  }
}

static void sendHello() {
  notify(String("HELLO|v1|") + sessionDeviceId + "|" + toHex(nonce, sizeof(nonce)));
  helloSent = true;
}

static void refreshSession() {
  authorized = false;
  helloSent = false;
  sessionDeviceId = DEVICE_ID;
  esp_fill_random(nonce, sizeof(nonce));
  deriveSessionKey();
}

static bool decryptCreds(const String &ivHex, const String &cipherHex, String &ssid, String &pass) {
  uint8_t iv[16];
  if (!fromHex(ivHex, iv, 16)) {
    return false;
  }
  if (cipherHex.length() < 32 || (cipherHex.length() % 32) != 0) {
    return false;
  }
  size_t cipherLen = cipherHex.length() / 2;
  if (cipherLen > 256) {
    return false;
  }
  uint8_t cipher[256];
  uint8_t plain[256];
  if (!fromHex(cipherHex, cipher, cipherLen)) {
    return false;
  }
  mbedtls_aes_context aes;
  mbedtls_aes_init(&aes);
  if (mbedtls_aes_setkey_dec(&aes, sessionKey, 128) != 0) {
    mbedtls_aes_free(&aes);
    return false;
  }
  if (mbedtls_aes_crypt_cbc(&aes, MBEDTLS_AES_DECRYPT, cipherLen, iv, cipher, plain) != 0) {
    mbedtls_aes_free(&aes);
    return false;
  }
  mbedtls_aes_free(&aes);
  // PKCS7
  uint8_t pad = plain[cipherLen - 1];
  if (pad == 0 || pad > 16 || pad > cipherLen) {
    return false;
  }
  for (uint8_t i = 0; i < pad; i++) {
    if (plain[cipherLen - 1 - i] != pad) {
      return false;
    }
  }
  size_t plainLen = cipherLen - pad;
  String text;
  text.reserve(plainLen);
  for (size_t i = 0; i < plainLen; i++) {
    text += static_cast<char>(plain[i]);
  }
  int nl = text.indexOf('\n');
  if (nl <= 0) {
    return false;
  }
  ssid = text.substring(0, nl);
  pass = text.substring(nl + 1);
  ssid.trim();
  return ssid.length() > 0;
}

static void handleScan() {
  if (isBusy && isBusy()) {
    notify(F("ERR|wifi_busy"));
    return;
  }
  WiFi.mode(WIFI_STA);
  int n = WiFi.scanNetworks(/*async=*/false, /*hidden=*/false);
  String out = "LIST|";
  out += String(n < 0 ? 0 : n);
  int used = 0;
  for (int i = 0; i < n && used < 20; i++) {
    String name = WiFi.SSID(i);
    if (name.length() == 0) {
      continue;
    }
    name.replace("|", "/");
    name.replace("\t", " ");
    out += "|";
    out += name;
    out += "\t";
    out += String(WiFi.RSSI(i));
    used += 1;
  }
  WiFi.scanDelete();
  notify(out);
}

static void handleLine(String line) {
  line.trim();
  if (line.length() == 0) {
    return;
  }
  // APP 訂閱通知後會送 HELLO，再回握手（避免連線當下通知還沒收）
  if (line.equalsIgnoreCase("HELLO")) {
    sendHello();
    return;
  }
  if (line.startsWith("AUTH|")) {
    String token = line.substring(5);
    token.trim();
    if (token.equalsIgnoreCase(expectedAuthToken())) {
      authorized = true;
      notify(F("AUTH_OK"));
    } else {
      authorized = false;
      notify(F("ERR|auth_fail"));
    }
    return;
  }
  if (!authorized) {
    notify(F("ERR|need_auth"));
    return;
  }
  if (line.equalsIgnoreCase("SCAN")) {
    handleScan();
    return;
  }
  if (line.equalsIgnoreCase("CLEAR")) {
    if (onClear) {
      onClear();
    }
    notify(F("CLEARED"));
    return;
  }
  if (line.startsWith("CREDS|")) {
    int p1 = line.indexOf('|');
    int p2 = line.indexOf('|', p1 + 1);
    if (p1 < 0 || p2 < 0) {
      notify(F("ERR|creds_format"));
      return;
    }
    String ivHex = line.substring(p1 + 1, p2);
    String cipherHex = line.substring(p2 + 1);
    String ssid;
    String pass;
    if (!decryptCreds(ivHex, cipherHex, ssid, pass)) {
      notify(F("WIFI_FAIL|decrypt"));
      return;
    }
    CONSOLE.println(F("BLE_CREDS received (password hidden)"));
    if (onApply) {
      onApply(ssid, pass);
    }
    return;
  }
  notify(F("ERR|unknown"));
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) override {
    connected = true;
    connectedAt = millis();
    refreshSession();
  }
  void onDisconnect(BLEServer *pServer) override {
    connected = false;
    authorized = false;
    helloSent = false;
    pServer->getAdvertising()->start();
  }
};

class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    String value = characteristic->getValue();
    if (value.length() == 0) {
      return;
    }
    for (size_t i = 0; i < value.length(); i++) {
      char c = value[i];
      if (c == '\n' || c == '\r') {
        if (rxLine.length() > 0 && !hasPending) {
          pendingLine = rxLine;
          hasPending = true;
        }
        rxLine = "";
      } else if (rxLine.length() < 400) {
        rxLine += c;
      }
    }
  }
};

void bleProvSetHandlers(ProvWifiApplyFn apply, ProvWifiClearFn clear, ProvWifiBusyFn busy) {
  onApply = apply;
  onClear = clear;
  isBusy = busy;
}

void bleProvBegin(const char *advertiseName) {
  BLEDevice::init(advertiseName);
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService *service = server->createService(SERVICE_UUID);
  txChar = service->createCharacteristic(CHAR_TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());
  BLECharacteristic *rxChar = service->createCharacteristic(
      CHAR_RX_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rxChar->setCallbacks(new RxCallbacks());
  service->start();
  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  adv->start();
  CONSOLE.print(F("BLE provision name="));
  CONSOLE.println(advertiseName);
}

void bleProvLoop() {
  if (connected && !helloSent && connectedAt > 0 && millis() - connectedAt > 800) {
    sendHello();
  }
  if (!hasPending) {
    return;
  }
  String line = pendingLine;
  hasPending = false;
  handleLine(line);
}

bool bleProvConnected() { return connected; }

void bleProvNotifyWifiResult(bool ok, const String &detail) {
  if (ok) {
    notify(String("WIFI_OK|") + detail);
  } else {
    notify(String("WIFI_FAIL|") + detail);
  }
}
