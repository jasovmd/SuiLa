import { Preferences } from "@capacitor/preferences"
import { useSyncExternalStore } from "react"
import { en } from "./en"
import { nanTW } from "./nan-TW"
import { zhTW } from "./zh-TW"

export type Translations = typeof zhTW
export type Language = "zh-TW" | "en" | "nan-TW"

export const languages: Language[] = ["zh-TW", "nan-TW", "en"]
const files: Record<Language, Translations> = {
  "zh-TW": zhTW,
  "nan-TW": nanTW,
  en,
}

export const defaultNames = languages.map(
  (language) => files[language].profile.defaultName,
)

const UI_KEY = "suila.uiLanguage"
const LEGACY_KEY = "suila-language"

let current: Language = "zh-TW"
const listeners = new Set<() => void>()

function isLanguage(value: string | null | undefined): value is Language {
  return value === "en" || value === "nan-TW" || value === "zh-TW"
}

const applyToDocument = () => {
  document.documentElement.lang = files[current].meta.htmlLang
  document.title = files[current].meta.documentTitle
}

function notify() {
  applyToDocument()
  listeners.forEach((listener) => listener())
}

export async function initUiLanguage() {
  const saved = (await Preferences.get({ key: UI_KEY })).value
  if (isLanguage(saved)) {
    current = saved
  } else {
    try {
      const legacy = localStorage.getItem(LEGACY_KEY)
      if (isLanguage(legacy)) current = legacy
    } catch {
      // ignore
    }
  }
  notify()
}

export async function setLanguage(language: Language) {
  current = language
  await Preferences.set({ key: UI_KEY, value: language })
  try {
    localStorage.setItem(LEGACY_KEY, language)
  } catch {
    // ignore
  }
  notify()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, () => current)
}

export function useT(): Translations {
  return files[useLanguage()]
}

export function getUiLanguage(): Language {
  return current
}
