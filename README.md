# 水啦 SuiLa

```
SuiLa/
  APP/       # Capacitor 手機 APP（Android + iOS）
  LINE/      # LINE Bot
  ESP/       # ESP32 韌體
  backend/   # FastAPI（Cloud Run）
  APK/       # 安裝檔輸出
```

## 後端

```bat
cd SuiLa\backend
run.bat
```

Cloud Run（在 `SuiLa/`）：

```bat
gcloud run deploy suila-api --source . --region asia-east1 --project suila-149ec --allow-unauthenticated --port 8080 --quiet
```

## APP

```bat
cd SuiLa\APP
npm install
.\scripts\build-apk.ps1
```

## 韌體

開啟 `ESP/suila/suila.ino`，設備 ID：`suila-esp32c3-01`。

## LINE

密鑰放 `LINE/.env`。Webhook：`https://<後端>/line/webhook`。
