# SuiLa 水啦 — phone app (frontend)

The phone app for the SuiLa smart water-bottle base. Built with React, Vite,
TypeScript, and Capacitor (Android APK). The text is in 繁體中文 and English.

This Capacitor app replaces the older Flutter UI in `SuiLa/SuiLa-APP` as the
main phone UI. The Flutter project is kept only as a BLE-provisioning
reference for later.

## Run it (browser)

Needs Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:8443. With no backend set, the app runs on its own
sample data. First launch shows login (Google / phone OTP) then profile
onboarding; see [AUTH.md](AUTH.md) for Firebase setup.

## Android APK

Needs Android Studio (for its JDK + SDK). Capacitor 8 wants Java 21+; the
Android Studio JBR is enough — you do **not** need a separate Oracle JDK.

```bash
npm install
npm run apk:debug
```

That builds the web UI, syncs Capacitor, assembles a debug APK, and copies it
to:

`SuiLa/SuiLa-APK/suila-capacitor-debug.apk`

Install that file on the phone (allow unknown sources). Production builds
(`npm run apk:debug`) embed
`VITE_API_URL=https://suila-api-249203610798.asia-east1.run.app` from
`.env.production`, so the APK talks to Cloud Run. Leave `.env.local` empty
for browser demo/mock.

Other commands:

- `npm run build:android` — Vite build + `cap sync` only
- `npm run open:android` — open the project in Android Studio

## Connect your backend

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_API_URL` to your backend's address, for example
   `VITE_API_URL=http://localhost:3000`.
3. Restart `npm run dev` (or rebuild the APK).

**[BACKEND.md](BACKEND.md) lists every call the app makes**, with what it
sends and what it expects back, plus the CORS and login-cookie setup the
backend must allow. All server calls live in one file, `src/api/index.ts`. If
your addresses or field names differ, only that file needs to change.

Note: the current Cloud Run API (`/api/home`, `/api/intake/...`) does not yet
match this frontend's routes (`/records`, `/device`, …). Leave `VITE_API_URL`
empty until that is aligned.

## Where things are

| Path | What it holds |
|---|---|
| `src/api/index.ts` | Every backend call, with the sample-data fallback |
| `src/data/mock.ts` | The sample data, shaped like real data |
| `src/screens/` | One file per screen |
| `src/components/` | Shared pieces (header, buttons, dialogs) |
| `src/i18n/` | All visible text, one file per language |
| `src/index.css` | All styles |
| `android/` | Capacitor Android project |
| `capacitor.config.ts` | App id `com.suila.app`, webDir `dist` |

## Other commands

- `npm run build` builds the site into `dist/`.
- `npm test` runs the small self-checks.

## More

- [CHANGES.md](CHANGES.md): what changed from the first Figma version and why,
  grouped by screen.
- [PRODUCT.md](PRODUCT.md): product facts and decisions.
- Hidden demo panel for presentations: tap 「水啦 SuiLa」 in the top bar five
  times quickly.
