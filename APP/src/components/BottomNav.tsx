import type { HTMLAttributes } from "react"
import { useT } from "../i18n"
import { NavigationIcon, type NavigationIconType } from "./Icons"

export type NavKey = "water" | "band" | "family" | "my"

const freeItems: { key: NavKey; icon: NavigationIconType }[] = [
  { key: "water", icon: "water" },
  { key: "family", icon: "social" },
  { key: "my", icon: "profile" },
]

const proItems: { key: NavKey; icon: NavigationIconType }[] = [
  { key: "water", icon: "water" },
  { key: "band", icon: "band" },
  { key: "family", icon: "social" },
  { key: "my", icon: "profile" },
]

export function navItems(isPro: boolean) {
  return isPro ? proItems : freeItems
}

export function pageCount(isPro: boolean) {
  return navItems(isPro).length
}

export function familyPage(isPro: boolean) {
  return navItems(isPro).findIndex((item) => item.key === "family")
}


export function remapPage(page: number, wasPro: boolean, nowPro: boolean) {
  if (wasPro === nowPro) return page
  const from = navItems(wasPro)
  const to = navItems(nowPro)
  const key = from[Math.max(0, Math.min(from.length - 1, page))]?.key ?? "water"
  const next = to.findIndex((item) => item.key === key)
  return next >= 0 ? next : 0
}

export function BottomNav({
  currentPage,
  isPro,
  newMessageCount,
  slideHandlers,
  onSelect,
}: {
  currentPage: number
  isPro: boolean
  newMessageCount: number
  
  slideHandlers: HTMLAttributes<HTMLElement>
  onSelect: (page: number) => void
}) {
  const t = useT()
  const items = navItems(isPro)
  return (
    <nav
      className={`bottom-navigation ${isPro ? "is-pro" : ""}`.trim()}
      aria-label={t.nav.aria}
      {...slideHandlers}
    >
      <span className="nav-indicator" aria-hidden="true" />
      {items.map((item, index) => (
        <button
          className={currentPage === index ? "is-active" : ""}
          type="button"
          key={item.key}
          onClick={() => onSelect(index)}
          aria-current={currentPage === index ? "page" : undefined}
        >
          <NavigationIcon type={item.icon} />
          <span>{t.nav[item.key]}</span>
          {item.key === "family" && newMessageCount > 0 && (
            <>
              <b className="nav-badge" aria-hidden="true">
                {newMessageCount}
              </b>
              <span className="sr-only">
                {t.nav.newMessages(newMessageCount)}
              </span>
            </>
          )}
        </button>
      ))}
    </nav>
  )
}
