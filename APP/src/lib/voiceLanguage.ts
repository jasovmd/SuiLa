import { Preferences } from "@capacitor/preferences"
import { useSyncExternalStore } from "react"
import type { Language } from "../i18n"

const KEY = "suila.voiceLanguage"
const listeners = new Set<() => void>()

export const voiceLanguages: Language[] = ["zh-TW", "nan-TW", "en"]

let current: Language = "en"

function isLanguage(value: string | null | undefined): value is Language {
  return value === "zh-TW" || value === "nan-TW" || value === "en"
}

function notify() {
  listeners.forEach((listener) => listener())
}

export async function initVoiceLanguage() {
  const saved = (await Preferences.get({ key: KEY })).value
  if (isLanguage(saved)) current = saved
  else {
    try {
      const legacy = localStorage.getItem("suila-voice-language")
      if (isLanguage(legacy)) current = legacy
    } catch {
      
    }
  }
  notify()
}

export async function setVoiceLanguage(language: Language) {
  current = language
  await Preferences.set({ key: KEY, value: language })
  try {
    localStorage.setItem("suila-voice-language", language)
  } catch {
    
  }
  notify()
}

export function getVoiceLanguage(): Language {
  return current
}

export function voiceSpeechLang(language: Language = current): string {
  if (language === "en") return "en-US"
  if (language === "nan-TW") return "zh-TW"
  return "zh-TW"
}

export function useVoiceLanguage(): Language {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}


export function playReminderCue(text: string, language: Language = current) {
  if (!("speechSynthesis" in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = voiceSpeechLang(language)
  window.speechSynthesis.speak(utterance)
}
