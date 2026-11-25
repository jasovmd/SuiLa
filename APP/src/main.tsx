import React from "react"
import ReactDOM from "react-dom/client"
import { Capacitor } from "@capacitor/core"
import { StatusBar, Style } from "@capacitor/status-bar"
import App from "./App"
import { initUiLanguage } from "./i18n"
import { initVoiceLanguage } from "./lib/voiceLanguage"
import "@fontsource-variable/noto-sans-tc"
import "./index.css"

async function setupNativeChrome() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: "#123d72" })
  } catch {
    
  }
}

async function boot() {
  await Promise.all([initUiLanguage(), initVoiceLanguage(), setupNativeChrome()])
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

void boot()
