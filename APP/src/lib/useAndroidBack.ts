import { useEffect } from "react"
import { App } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"

/**
 * Handles system back / left-edge gesture:
 * overlay → previous tab → minimize on native (never kill the activity).
 * Also traps browser history so WebView edge-swipe doesn't exit the app.
 */
export function useAndroidBack(handlers: {
  hasOverlay: boolean
  onCloseOverlay: () => void
  page: number
  onPageBack: () => void
}) {
  const { hasOverlay, onCloseOverlay, page, onPageBack } = handlers

  useEffect(() => {
    const handleBack = () => {
      if (hasOverlay) {
        onCloseOverlay()
        return true
      }
      if (page > 0) {
        onPageBack()
        return true
      }
      return false
    }

    // Keep a history entry so edge-swipe back is intercepted instead of leaving.
    const pushGuard = () => {
      try {
        window.history.pushState({ suilaGuard: 1 }, "")
      } catch {
        // ignore
      }
    }
    pushGuard()
    const onPopState = () => {
      const consumed = handleBack()
      pushGuard()
      if (!consumed && Capacitor.isNativePlatform()) {
        void App.minimizeApp()
      }
    }
    window.addEventListener("popstate", onPopState)

    let handle: { remove: () => Promise<void> } | undefined
    if (Capacitor.isNativePlatform()) {
      App.addListener("backButton", () => {
        if (handleBack()) return
        void App.minimizeApp()
      }).then((listener) => {
        handle = listener
      })
    }

    return () => {
      window.removeEventListener("popstate", onPopState)
      void handle?.remove()
    }
  }, [hasOverlay, onCloseOverlay, page, onPageBack])
}
