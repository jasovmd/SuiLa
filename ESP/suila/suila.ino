#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_mac.h>
#include <time.h>

#include "ble_provision.h"
#include "config.h"
#include "debug_port.h"
#include "event_queue.h"
#include "sensor.h"
#include "weight_logic.h"
#include "wifi_store.h"

WeightSensor sensor;
WeightLogic logic;
EventQueue queue;

enum class WifiPhase : uint8_t { Idle, Connecting, Connected, RetryWait };

WifiPhase wifiPhase = WifiPhase::Idle;
unsigned long wifiPhaseAt = 0;
bool timeOk = false;
bool wifiReady = false;
bool wifiConnectBusy = false;
unsigned long lastSampleMs = 0;
unsigned long lastWeightPrintMs = 0;
unsigned long lastHeartbeatMs = 0;
unsigned long lastUploadMs = 0;
uint32_t eventSeq = 0;
float lastGrams = 0.0f;
bool lastGramsOk = false;
bool liveWeight = true;
String serialLine;
String pendingSsid;
String pendingPass;
bool hasPendingCreds = false;

#if SUILA_USE_SIM
static const char *MODE_NAME = "sim";
#else
static const char *MODE_NAME = "real";
#endif

void reply(const String &msg) { CONSOLE.println(msg); }
void reply(const __FlashStringHelper *msg) { CONSOLE.println(msg); }

String isoNow() {
  time_t now = time(nullptr);
  if (now < 1700000000) {
    char buf[40];
    snprintf(buf, sizeof(buf), "1970-01-01T00:00:%02luZ", (millis() / 1000UL) % 60UL);
    return String(buf);
  }
  struct tm tmUtc;
  gmtime_r(&now, &tmUtc);
  char buf[40];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tmUtc);
  return String(buf);
}

void makeEventId(char *out, size_t n) {
  eventSeq += 1;
  snprintf(out, n, "%s-%lu-%lu", DEVICE_ID, static_cast<unsigned long>(millis()),
           static_cast<unsigned long>(eventSeq));
}

void startWifiConnect(const String &ssid, const String &pass, bool fromProvision) {
  wifiConnectBusy = true;
  wifiReady = false;
  wifiPhase = WifiPhase::Connecting;
  wifiPhaseAt = millis();
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(false);
  delay(50);
  WiFi.begin(ssid.c_str(), pass.c_str());
  if (fromProvision) {
    CONSOLE.println(F("WIFI connecting (from BLE, password hidden)"));
  } else {
    CONSOLE.println(F("WIFI connecting (saved)"));
  }
}

bool wifiIsBusy() { return wifiConnectBusy && wifiPhase == WifiPhase::Connecting; }

void onProvApply(const String &ssid, const String &pass) {
  pendingSsid = ssid;
  pendingPass = pass;
  hasPendingCreds = true;
  startWifiConnect(ssid, pass, true);
}

void onProvClear() {
  wifiClearCredentials();
  WiFi.disconnect(true);
  wifiReady = false;
  wifiPhase = WifiPhase::Idle;
  wifiConnectBusy = false;
  timeOk = false;
  CONSOLE.println(F("WIFI cleared"));
}

void wifiTick() {
  if (hasPendingCreds && wifiPhase == WifiPhase::Connecting) {
    if (WiFi.status() == WL_CONNECTED) {
      wifiSaveCredentials(pendingSsid, pendingPass);
      pendingPass = "";
      hasPendingCreds = false;
      wifiReady = true;
      wifiConnectBusy = false;
      wifiPhase = WifiPhase::Connected;
      bleProvNotifyWifiResult(true, WiFi.localIP().toString());
      CONSOLE.println(F("WIFI saved after success"));
      return;
    }
    if (millis() - wifiPhaseAt > WIFI_CONNECT_TIMEOUT_MS) {
      hasPendingCreds = false;
      pendingPass = "";
      wifiConnectBusy = false;
      wifiPhase = WifiPhase::RetryWait;
      wifiPhaseAt = millis();
      WiFi.disconnect(false);
      bleProvNotifyWifiResult(false, "timeout");
      CONSOLE.println(F("WIFI provision failed"));
      // 失敗不寫入；若原本有舊設定，稍後用舊設定重試
      if (wifiHasCredentials()) {
        wifiPhase = WifiPhase::RetryWait;
      } else {
        wifiPhase = WifiPhase::Idle;
      }
    }
    return;
  }

  if (!wifiHasCredentials()) {
    wifiReady = false;
    if (wifiPhase != WifiPhase::Idle && !hasPendingCreds) {
      wifiPhase = WifiPhase::Idle;
    }
    return;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiReady = true;
    wifiPhase = WifiPhase::Connected;
    wifiConnectBusy = false;
    return;
  }

  wifiReady = false;
  if (wifiPhase == WifiPhase::Connecting) {
    if (millis() - wifiPhaseAt > WIFI_CONNECT_TIMEOUT_MS) {
      wifiPhase = WifiPhase::RetryWait;
      wifiPhaseAt = millis();
      wifiConnectBusy = false;
      WiFi.disconnect(false);
      CONSOLE.println(F("WIFI retry scheduled"));
    }
    return;
  }

  if (wifiPhase == WifiPhase::RetryWait && millis() - wifiPhaseAt < WIFI_RETRY_GAP_MS) {
    return;
  }

  startWifiConnect(wifiGetSsid(), wifiGetPass(), false);
}

void syncTimeNonBlockingStart() {
  if (!wifiReady) {
    timeOk = false;
    return;
  }
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
}

void syncTimeCheck() {
  if (!wifiReady) {
    timeOk = false;
    return;
  }
  timeOk = time(nullptr) >= 1700000000;
}

String backendUrl(const char *path) {
  String url = BACKEND_HTTPS ? String("https://") : String("http://");
  url += BACKEND_HOST;
  if (!(BACKEND_HTTPS && BACKEND_PORT == 443) && !(!BACKEND_HTTPS && BACKEND_PORT == 80)) {
    url += ":";
    url += String(BACKEND_PORT);
  }
  url += path;
  return url;
}

bool beginHttp(HTTPClient &http, WiFiClientSecure &secure, const String &url) {
  http.setTimeout(8000);
  if (BACKEND_HTTPS) {
    secure.setInsecure();
    return http.begin(secure, url);
  }
  return http.begin(url);
}

bool postJson(const char *path, const String &body) {
  if (!wifiReady || WiFi.status() != WL_CONNECTED) {
    return false;
  }
  HTTPClient http;
  WiFiClientSecure secure;
  String url = backendUrl(path);
  if (!beginHttp(http, secure, url)) {
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  http.end();
  return code >= 200 && code < 300;
}

void pullSimCommand() {
#if SUILA_USE_SIM
  if (!wifiReady || WiFi.status() != WL_CONNECTED) {
    return;
  }
  HTTPClient http;
  WiFiClientSecure secure;
  String path = String("/api/devices/") + DEVICE_ID + "/command";
  String url = backendUrl(path.c_str());
  if (!beginHttp(http, secure, url)) {
    return;
  }
  int code = http.GET();
  if (code == 200) {
    String payload = http.getString();
    int idx = payload.indexOf("sim_grams");
    if (idx >= 0) {
      int colon = payload.indexOf(':', idx);
      if (colon > 0) {
        String num = payload.substring(colon + 1);
        num.replace("}", "");
        num.replace(",", "");
        num.trim();
        if (num != "null" && num.length() > 0) {
          float g = num.toFloat();
          sensor.setSimGrams(g);
          logic.syncBaseline(g);
          CONSOLE.print(F("SIM_CMD g="));
          CONSOLE.println(g, 1);
        }
      }
    }
  }
  http.end();
#endif
}

void sendHeartbeat() {
  String msg = logic.stateName();
  if (!sensor.sensorOk()) {
    msg = "sensor_error";
  } else if (!sensor.calibrated()) {
    msg = "need_calibration";
  } else if (!wifiHasCredentials()) {
    msg = "need_wifi_provision";
  }
  String body = "{";
  body += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  body += "\"measurement_mode\":\"" + String(MODE_NAME) + "\",";
  body += "\"sensor_ok\":" + String(sensor.sensorOk() ? "true" : "false") + ",";
  body += "\"baseline_ready\":" + String(logic.baselineReady() ? "true" : "false") + ",";
  body += "\"message\":\"" + msg + "\"";
  body += "}";
  postJson("/api/heartbeat", body);
  pullSimCommand();
}

void tryUploadOne() {
  PendingEvent item;
  if (!queue.peek(item)) {
    return;
  }
  String body = "{";
  body += "\"event_id\":\"" + String(item.event_id) + "\",";
  body += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  body += "\"measured_at\":\"" + String(item.measured_at) + "\",";
  body += "\"estimated_intake_ml\":" + String(item.intake_ml) + ",";
  body += "\"measurement_mode\":\"" + String(MODE_NAME) + "\",";
  body += "\"time_verified\":" + String(item.time_verified ? "true" : "false");
  body += "}";
  if (postJson("/api/intake", body)) {
    queue.pop();
    reply(F("UPLOAD_OK"));
  } else {
    reply(F("UPLOAD_FAIL"));
  }
}

void enqueueIntake(float ml) {
  char id[40];
  makeEventId(id, sizeof(id));
  String at = isoNow();
  bool verified = timeOk;
  if (!queue.enqueue(id, at.c_str(), static_cast<int>(ml + 0.5f), verified)) {
    reply(F("QUEUE_FULL"));
    return;
  }
  reply(String("INTAKE_QUEUED ml=") + String(ml, 0) + " verified=" + String(verified ? 1 : 0));
}

void printStatus(float grams) {
  String line = "STATUS mode=";
  line += MODE_NAME;
  line += " g=";
  line += String(grams, 1);
  line += " state=";
  line += logic.stateName();
  line += " wifi=";
  line += String(wifiReady ? 1 : 0);
  line += " configured=";
  line += String(wifiHasCredentials() ? 1 : 0);
  line += " ble=";
  line += String(bleProvConnected() ? 1 : 0);
  line += " q=";
  line += String(queue.size());
  reply(line);
}

void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) {
    return;
  }
  if (line.equalsIgnoreCase("STATUS")) {
    float g = 0;
    sensor.readGrams(g);
    printStatus(g);
    return;
  }
  if (line.equalsIgnoreCase("LIVE")) {
    liveWeight = !liveWeight;
    reply(liveWeight ? F("LIVE_ON") : F("LIVE_OFF"));
    return;
  }
  if (line.equalsIgnoreCase("TARE")) {
    reply(sensor.tare() ? F("TARE_OK") : F("TARE_FAIL"));
    return;
  }
  if (line.equalsIgnoreCase("BASELINE") || line.equalsIgnoreCase("REBUILD")) {
    logic.requestRebuild();
    reply(F("BASELINE_RESET"));
    return;
  }
  if (line.startsWith("CAL ")) {
    float known = line.substring(4).toFloat();
    if (sensor.calibrateWithKnownGrams(known)) {
      logic.markCalibrated();
      reply(String("CAL_OK scale=") + String(sensor.scale(), 6));
    } else {
      reply(F("CAL_FAIL"));
    }
    return;
  }
  if (line.equalsIgnoreCase("WIFI_CLEAR")) {
    onProvClear();
    reply(F("WIFI_CLEARED"));
    return;
  }
#if SUILA_USE_SIM
  if (line.startsWith("SIM ")) {
    sensor.setSimGrams(line.substring(4).toFloat());
    reply(F("SIM_SET"));
    return;
  }
#endif
  reply(F("CMD: STATUS|LIVE|TARE|CAL g|BASELINE|WIFI_CLEAR|SIM g"));
}

String bleAdvertiseName() {
  uint8_t mac[6] = {0};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char buf[24];
  snprintf(buf, sizeof(buf), "%s-%02X%02X", BLE_NAME_PREFIX, mac[4], mac[5]);
  return String(buf);
}

void setup() {
  CONSOLE.begin(115200);
  delay(400);
  CONSOLE.println();
  CONSOLE.println(F("水啦 SuiLa firmware"));
  CONSOLE.print(F("mode="));
  CONSOLE.println(MODE_NAME);

  wifiStoreBegin();
  queue.begin();

  bleProvSetHandlers(onProvApply, onProvClear, wifiIsBusy);
  bleProvBegin(bleAdvertiseName().c_str());

  if (!sensor.begin()) {
    logic.setSensorError(true);
    CONSOLE.println(F("SENSOR_ERROR"));
  } else if (!sensor.calibrated()) {
    logic.resetForCalibrationMissing();
    CONSOLE.println(F("NEED_CALIBRATION"));
  } else {
    logic.markCalibrated();
  }

  if (wifiHasCredentials()) {
    startWifiConnect(wifiGetSsid(), wifiGetPass(), false);
  } else {
    CONSOLE.println(F("BLE provision mode (no Wi-Fi saved)"));
  }

  lastHeartbeatMs = millis();
  lastSampleMs = millis();
  lastUploadMs = millis();
}

void loop() {
  while (CONSOLE.available()) {
    char c = static_cast<char>(CONSOLE.read());
    if (c == '\n' || c == '\r') {
      handleCommand(serialLine);
      serialLine = "";
    } else if (serialLine.length() < 120) {
      serialLine += c;
    }
  }

  bleProvLoop();
  wifiTick();
  syncTimeCheck();

  unsigned long now = millis();

  if (now - lastSampleMs >= SAMPLE_MS) {
    lastSampleMs = now;
    float grams = 0.0f;
    bool ok = sensor.readGrams(grams);
    lastGrams = grams;
    lastGramsOk = ok;
    if (!sensor.calibrated() && ok) {
      logic.resetForCalibrationMissing();
    } else {
      WeightEvent ev = logic.update(grams, ok && sensor.calibrated());
      if (ev.type == WeightEventType::Intake) {
        enqueueIntake(ev.intakeMl);
      } else if (ev.type == WeightEventType::BaselineSet) {
        reply(String("BASELINE_SET ") + String(ev.grams, 1));
      } else if (ev.type == WeightEventType::Refill) {
        reply(String("REFILL ") + String(ev.grams, 1));
      } else if (ev.type == WeightEventType::NeedRebuild) {
        reply(F("NEED_REBUILD"));
      } else if (ev.type == WeightEventType::SensorError) {
        reply(F("SENSOR_ERROR"));
      }
    }
  }

  if (liveWeight && now - lastWeightPrintMs >= WEIGHT_PRINT_MS) {
    lastWeightPrintMs = now;
    if (lastGramsOk) {
      reply(String("WEIGHT g=") + String(lastGrams, 1) + " state=" + logic.stateName());
    } else {
      reply(F("WEIGHT ERR"));
    }
  }

  if (now - lastUploadMs >= UPLOAD_RETRY_MS) {
    lastUploadMs = now;
    tryUploadOne();
  }

  if (now - lastHeartbeatMs >= HEARTBEAT_MS) {
    lastHeartbeatMs = now;
    if (wifiReady && !timeOk) {
      syncTimeNonBlockingStart();
    }
    sendHeartbeat();
  }
}
