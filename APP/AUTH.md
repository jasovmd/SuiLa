# 水啦 APP 登入

可選 LINE、Google、手機註冊。

## LINE Login

1. LINE Developers → LINE Login channel  
2. Callback：`https://suila-api-249203610798.asia-east1.run.app/auth/line/callback`  
3. `SuiLa/LINE/.env`：`LINE_LOGIN_CHANNEL_ID`、`LINE_LOGIN_CHANNEL_SECRET`  
4. `SuiLa/APP/.env.production`：`VITE_LINE_LOGIN_CHANNEL_ID`、`VITE_LINE_LOGIN_REDIRECT_URI`

## 語音翻譯

Cloud Run 需設 `OPENAI_API_KEY`。家人語音可播原音或依「語音語言」翻譯。

## 語言設定

- 介面語言：畫面文字（預設繁中）  
- 語音語言：提醒／翻譯語音（預設英文）  
兩者分開儲存於 Capacitor Preferences。
