#pragma once

// 雲端後端（Cloud Run）。Wi-Fi 帳密改由 APP 藍牙配網，不寫死於此。
static const char *BACKEND_HOST = "suila-api-249203610798.asia-east1.run.app";
static const uint16_t BACKEND_PORT = 443;
static const bool BACKEND_HTTPS = true;

static const char *DEVICE_ID = "suila-esp32c3-01";

// 藍牙廣播前綴；實際名稱為 SuiLa-XXXX（MAC 後四碼）
static const char *BLE_NAME_PREFIX = "SuiLa";

// 配網共用密鑰（須與 APP 一致；勿把 Wi-Fi 密碼寫進日誌）
static const char *PROV_SECRET = "SuiLaProv2026";

// true = 模擬重量；false = 真實 HX711
#ifndef SUILA_USE_SIM
#define SUILA_USE_SIM false
#endif

// ESP32-C3：DT → GPIO4，SCK → GPIO5。VCC 接 3V3，GND 接 GND。
static const int HX711_DOUT_PIN = 4;
static const int HX711_SCK_PIN = 5;

static const float NOISE_G = 3.0f;
static const float LIFT_DROP_G = 40.0f;
static const float EMPTY_MAX_G = 100.0f;
static const float MIN_INTAKE_G = 5.0f;
static const float MAX_INTAKE_G = 500.0f;
static const float UNREASONABLE_G = 800.0f;
static const int STABLE_NEED = 8;
static const unsigned long SAMPLE_MS = 200;
static const unsigned long WEIGHT_PRINT_MS = 1000;
static const unsigned long HEARTBEAT_MS = 15000;
static const unsigned long UPLOAD_RETRY_MS = 3000;
static const unsigned long NTP_TIMEOUT_MS = 10000;
static const unsigned long WIFI_CONNECT_TIMEOUT_MS = 25000;
static const unsigned long WIFI_RETRY_GAP_MS = 8000;
