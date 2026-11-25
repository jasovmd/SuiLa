import { useEffect } from "react"
import { App } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"


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

    
    const pushGuard = () => {
      try {
        window.history.pushState({ suilaGuard: 1 }, "")
      } catch {
        
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
