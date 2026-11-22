# 水啦 SuiLa

ESP32-C3（重量偵測＋BLE 配網）→ Wi‑Fi → FastAPI＋SQLite → Capacitor Android APP（`SuiLa77`）

```
SuiLa/
  backend/          # FastAPI 後端（Cloud Run）
  SuiLa-LINE/       # LINE Bot
  SuiLa-ESP/suila/  # ESP32 韌體
  SuiLa-APK/        # Capacitor APK 輸出
SuiLa77/            # 手機 APP（React + Capacitor）
  widget/           # 桌面小工具（Android + JS bridge）
```

---

## 一、後端

```bat
cd SuiLa\backend
run.bat
```

健康檢查：`http://127.0.0.1:8000/api/health`

Cloud Run 部署（在 `SuiLa/`）：

```bat
gcloud run deploy suila-api --source . --region asia-east1 --project suila-149ec --allow-unauthenticated --port 8080 --quiet
```

---

## 二、韌體（Arduino IDE）

1. 開發板：**ESP32C3 Dev Module**
2. **Partition Scheme → Huge APP (3MB No OTA/1MB SPIFFS)**
3. 安裝函式庫 **HX711**（bogde）
4. 開啟 `SuiLa-ESP/suila/suila.ino`
5. `config.h` 填 `BACKEND_HOST`；Wi‑Fi 由 APP 藍牙配網寫入
6. 序列埠 **115200**

設備 ID：`suila-esp32c3-01`  
心跳：`POST /api/heartbeat`（45 秒內視為已連線）

---

## 三、手機 APP（SuiLa77）

```bat
cd SuiLa77
npm install
npm run build -- --mode production
npx cap sync android
.\scripts\build-apk.ps1
```

APK 會複製到 `SuiLa\SuiLa-APK\suila-capacitor-debug.apk`。  
區網下載：執行 `SuiLa-APK\開啟下載.bat`。

桌面小工具程式在 `SuiLa77\widget\`；打開 APP 後會把今天喝水量寫到小工具。

---

## 四、LINE

1. 密鑰只放 `SuiLa-LINE/.env`（對照 `.env.example`）
2. Webhook：`https://<後端>/line/webhook`
3. APP 產生綁定碼 → 傳給官方帳號完成綁定
4. 兩位以上長輩時，語音會先問要傳給誰

---

## 五、本機測試

```bat
cd SuiLa\backend
pytest
```
