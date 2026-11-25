import { Capacitor } from "@capacitor/core"
import { LocalNotifications } from "@capacitor/local-notifications"
import { Preferences } from "@capacitor/preferences"
import type { NightMute } from "../data/mock"

const PROGRESS_KEY = "suila.push.progressDay"
const FIXED_ID_BASE = 4100
const PROGRESS_ID = 4190

export function inQuietHours(hhmm: string, night: NightMute): boolean {
  if (!night.enabled) return false
  const { start, end } = night
  if (!start || !end || start === end) return false
  if (start < end) return start <= hhmm && hhmm < end
  return hhmm >= start || hhmm < end
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function hhmmOf(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseSlot(slot: string): { hour: number; minute: number } | null {
  if (slot.length !== 5 || slot[2] !== ":") return null
  const hour = Number(slot.slice(0, 2))
  const minute = Number(slot.slice(3))
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

function fixedId(dayOffset: number, hour: number, minute: number): number {
  return FIXED_ID_BASE + dayOffset * 24 * 60 + hour * 60 + minute
}

function nextAt(dayOffset: number, hour: number, minute: number, from = new Date()): Date {
  const at = new Date(from)
  at.setDate(at.getDate() + dayOffset)
  at.setHours(hour, minute, 0, 0)
  return at
}

async function ensurePermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    let status = await LocalNotifications.checkPermissions()
    if (status.display !== "granted") {
      status = await LocalNotifications.requestPermissions()
    }
    return status.display === "granted"
  } catch {
    return false
  }
}

/** Schedule fixed reminder times for today + tomorrow (skips night mute). */
export async function syncReminderNotifications(options: {
  times: string[]
  night: NightMute
  title: string
  body: string
}): Promise<void> {
  if (!(await ensurePermission())) return

  const pending = await LocalNotifications.getPending()
  const cancelIds = pending.notifications
    .map((item) => item.id)
    .filter((id) => id >= FIXED_ID_BASE && id < PROGRESS_ID)
  if (cancelIds.length) {
    await LocalNotifications.cancel({ notifications: cancelIds.map((id) => ({ id })) })
  }

  const now = new Date()
  const notifications: {
    id: number
    title: string
    body: string
    schedule: { at: Date; allowWhileIdle: true }
  }[] = []

  for (const dayOffset of [0, 1]) {
    for (const slot of options.times) {
      const parsed = parseSlot(slot)
      if (!parsed) continue
      if (inQuietHours(slot, options.night)) continue
      const at = nextAt(dayOffset, parsed.hour, parsed.minute, now)
      if (at.getTime() <= now.getTime() + 5_000) continue
      notifications.push({
        id: fixedId(dayOffset, parsed.hour, parsed.minute),
        title: options.title,
        body: options.body,
        schedule: { at, allowWhileIdle: true },
      })
    }
  }

  if (notifications.length) {
    await LocalNotifications.schedule({ notifications })
  }
}

/** One progress nudge per day when afternoon intake is behind pace. */
export async function maybeProgressNotification(options: {
  totalMl: number
  goalMl: number
  night: NightMute
  title: string
  body: (total: number, goal: number) => string
}): Promise<void> {
  if (!(await ensurePermission())) return
  const now = new Date()
  if (inQuietHours(hhmmOf(now), options.night)) return
  if (now.getHours() < 12) return
  if (options.goalMl <= 0) return

  const elapsed = Math.min(14, Math.max(0, now.getHours() - 8))
  const expected = options.goalMl * (elapsed / 14)
  if (options.totalMl + 1 >= expected * 0.8) return

  const today = dayKey(now)
  const seen = (await Preferences.get({ key: PROGRESS_KEY })).value
  if (seen === today) return
  await Preferences.set({ key: PROGRESS_KEY, value: today })

  await LocalNotifications.schedule({
    notifications: [
      {
        id: PROGRESS_ID,
        title: options.title,
        body: options.body(options.totalMl, options.goalMl),
        schedule: { at: new Date(Date.now() + 1_500), allowWhileIdle: true },
      },
    ],
  })
}
