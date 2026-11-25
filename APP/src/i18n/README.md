# 多語系（介面語言）

執行時架構不變：`zh-TW.ts` / `en.ts` / `nan-TW.ts`，由 `index.ts` 依使用者偏好切換。語音語言（提醒／翻譯）仍是另一套設定，互不影響。

## 自動翻譯（開發用）

以**繁體中文 `zh-TW.ts` 為唯一來源**。改完中文後執行：

```bash
npm run i18n:sync
```

工具會：

1. 比對 `src/i18n/.source-hash.json`，只處理**新增或修改**的字串／句型
2. 用 Gemini 翻成 English、閩南語
3. 寫回 `en.ts`、`nan-TW.ts`，並更新 hash

其他選項：

```bash
npm run i18n:sync -- --dry-run   # 只列出會動到的 key
npm run i18n:sync -- --force     # 強制重翻全部
```

需要環境變數 `GEMINI_API_KEY`（與後端相同即可）。

第一次執行會建立 baseline；若目標檔缺少某個 key，也會自動補上。
