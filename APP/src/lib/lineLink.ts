import { Preferences } from "@capacitor/preferences"

const KEY = "line.self"

export type SavedLine = { id: string; name: string }

/** Remember the LINE account that finished binding, so the next launch can restore it. */
export async function saveLineSelf(member: { id: string; name?: string }) {
  const id = member.id.trim()
  if (!id || id.startsWith("m-") || id.startsWith("local-")) return
  const saved: SavedLine = { id, name: (member.name || "").trim() }
  await Preferences.set({ key: KEY, value: JSON.stringify(saved) })
}

export async function loadLineSelf(): Promise<SavedLine | null> {
  const raw = (await Preferences.get({ key: KEY })).value
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as SavedLine
    if (!parsed?.id) return null
    return { id: parsed.id, name: parsed.name || "" }
  } catch {
    return null
  }
}

export async function clearLineSelf() {
  await Preferences.remove({ key: KEY })
}
