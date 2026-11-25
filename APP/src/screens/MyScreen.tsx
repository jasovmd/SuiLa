import type { ReactNode } from "react"
import { Card } from "../components/Card"
import {
  BatteryIcon,
  BellIcon,
  ChartIcon,
  ChevronIcon,
  InfoIcon,
  MoonIcon,
  NavigationIcon,
  SettingsIcon,
} from "../components/Icons"
import { useT } from "../i18n"

const toneClass = {
  blue: "is-blue",
  coral: "is-coral",
  green: "is-green",
  amber: "is-amber",
}

function MenuRow({
  icon,
  tone,
  label,
  tag,
  onClick,
}: {
  icon: ReactNode
  tone: keyof typeof toneClass
  label: string
  tag?: string
  onClick: () => void
}) {
  return (
    <button className="menu-row" type="button" onClick={onClick}>
      <span className={`menu-icon ${toneClass[tone]}`} aria-hidden="true">
        {icon}
      </span>
      <strong>
        {label}
        {tag && <b className="pro-tag">{tag}</b>}
      </strong>
      <ChevronIcon />
    </button>
  )
}

export function MyScreen({
  ownerName,
  onOpenProfile,
  onOpenReminders,
  onOpenNightMute,
  onOpenDevice,
  onOpenHabits,
  onOpenAbout,
  onOpenSettings,
  onOpenPro,
  isPro,
}: {
  ownerName: string
  onOpenProfile: () => void
  onOpenReminders: () => void
  onOpenNightMute: () => void
  onOpenDevice: () => void
  onOpenHabits: () => void
  onOpenAbout: () => void
  onOpenSettings: () => void
  onOpenPro: () => void
  isPro: boolean
}) {
  const t = useT()

  return (
    <section className="swipe-page my-page" aria-label={t.my.aria}>
      <div className="hero-blue tab-band">
        <p className="band-title">{ownerName}</p>
        <p className="band-sub">{isPro ? t.pro.activeTitle : t.my.freePlan}</p>
      </div>

      <Card className="menu-group">
        <MenuRow
          icon={<NavigationIcon type="profile" />}
          tone="blue"
          label={t.my.profile}
          onClick={onOpenProfile}
        />
        <MenuRow icon={<BellIcon />} tone="coral" label={t.my.reminders} onClick={onOpenReminders} />
        <MenuRow icon={<MoonIcon />} tone="blue" label={t.my.nightMute} onClick={onOpenNightMute} />
        <MenuRow icon={<BatteryIcon />} tone="green" label={t.my.device} onClick={onOpenDevice} />
        <MenuRow
          icon={<ChartIcon />}
          tone="amber"
          label={t.my.habits}
          tag={isPro ? undefined : t.my.proTag}
          onClick={onOpenHabits}
        />
        <MenuRow icon={<InfoIcon />} tone="blue" label={t.my.about} onClick={onOpenAbout} />
        <MenuRow
          icon={<SettingsIcon />}
          tone="blue"
          label={t.my.settings}
          onClick={onOpenSettings}
        />
      </Card>

      {!isPro && (
        <button className="pro-upgrade-button" type="button" onClick={onOpenPro}>
          <span>{t.my.proTitle}</span>
          <strong>{t.my.proSubtitle}</strong>
        </button>
      )}
    </section>
  )
}
