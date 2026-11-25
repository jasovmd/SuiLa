// The one place the app talks to the backend. Screens never fetch by themselves.
//
// With VITE_API_URL set (see .env.example), every call goes to the teammate's
// backend over HTTP; BACKEND.md lists each call. Without it, the same calls
// are answered from the sample data in src/data/mock.ts, so the demo works
// with no backend at all.

import {
  deviceStatus,
  drinkRecords,
  familyInviteLink,
  familyMembers,
  initialIsPro,
  initialLineConnected,
  initialNightMute,
  initialProfile,
  initialReminderSettings,
  voiceMessages,
  type DeviceStatus,
  type DrinkRecord,
  type FamilyMember,
  type NightMute,
  type PremiumPlan,
  type Profile,
  type ReminderSettings,
  type VoiceMessage,
} from "../data/mock"
// familyMembers is used by the mock API copy.
import { zhTW } from "../i18n/zh-TW"
import { getSession } from "../lib/auth"
import { loadLineSelf, saveLineSelf } from "../lib/lineLink"

/** Everything the app needs when it starts. */
export type AppData = {
  records: DrinkRecord[]
  device: DeviceStatus
  reminders: ReminderSettings
  nightMute: NightMute
  profile: Profile
  lineConnected: boolean
  members: FamilyMember[]
  messages: VoiceMessage[]
  isPro: boolean
  /** Analysis text written by the backend (and its AI); null when it has none. */
  advice: string | null
}

export type SuilaApi = {
  loadAll(): Promise<AppData>
  addRecord(amountMl: number): Promise<DrinkRecord>
  updateRecord(id: string, amountMl: number): Promise<DrinkRecord>
  deleteRecord(id: string): Promise<void>
  saveReminders(settings: ReminderSettings): Promise<ReminderSettings>
  saveNightMute(nightMute: NightMute): Promise<NightMute>
  saveProfile(profile: Profile): Promise<Profile>
  pairDevice(): Promise<DeviceStatus>
  getDevice(): Promise<DeviceStatus>
  /** Starts linking LINE. Prefer showing `code` in-app; poll /family until connected. */
  linkLine(): Promise<{ url: string | null; connected: boolean; code?: string | null }>
  getFamily(): Promise<{ lineConnected: boolean; members: FamilyMember[] }>
  createInvite(): Promise<string>
  /** Family join code. The same code is reused for up to 24 hours. */
  createFamilyCode(): Promise<{ code: string; expiresAt: string }>
  addMember(input: { name: string; relation: string }): Promise<FamilyMember>
  removeMember(id: string): Promise<void>
  getMessages(): Promise<VoiceMessage[]>
  translateMessage(id: string, lang: string): Promise<{ audioUrl: string; text: string }>
  markPlayed(id: string): Promise<void>
  subscribe(plan: PremiumPlan): Promise<{ isPro: boolean }>
  /** Optional: remember the signed-in uid on the backend. */
  registerSession?(session: {
    uid: string
    provider: string
    idToken: string | null
    phone: string | null
    name?: string
  }): Promise<void>
  deleteAccount(): Promise<void>
}

// ---------------------------------------------------------------- real backend

const baseUrl: string = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")

async function authHeaders(
  withJsonBody: boolean,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
  if (withJsonBody) headers["Content-Type"] = "application/json"
  const session = await getSession()
  if (session?.idToken) headers.Authorization = `Bearer ${session.idToken}`
  if (session?.uid) headers["X-Suila-Uid"] = session.uid
  return headers
}

async function rememberLine(family: { lineConnected: boolean; members: FamilyMember[] }) {
  if (!family.lineConnected) return family
  const self = family.members.find((member) => member.relation === "本人" && member.id)
  if (self) await saveLineSelf(self)
  return family
}

/** If the server forgot the binding, put back the LINE user this phone already linked. */
async function restoreLine(family: { lineConnected: boolean; members: FamilyMember[] }) {
  if (family.lineConnected) return rememberLine(family)
  const saved = await loadLineSelf()
  if (!saved) return family
  try {
    const restored = await call<{ lineConnected: boolean; members: FamilyMember[] }>(
      "POST",
      "/family/line-restore",
      { lineUserId: saved.id, displayName: saved.name },
    )
    return rememberLine(restored)
  } catch {
    return family
  }
}

/** One HTTP call. Any non-2xx answer becomes an error the screen can report. */
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(baseUrl + path, {
    method,
    credentials: "omit",
    headers: await authHeaders(body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status}`)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const httpApi: SuilaApi = {
  async loadAll() {
    const [records, device, reminders, nightMute, profile, family, messages, subscription, analysis] =
      await Promise.all([
        call<DrinkRecord[]>("GET", "/records"),
        call<DeviceStatus>("GET", "/device"),
        call<ReminderSettings>("GET", "/settings/reminders"),
        call<NightMute>("GET", "/settings/night-mute"),
        call<Profile>("GET", "/profile"),
        call<{ lineConnected: boolean; members: FamilyMember[] }>("GET", "/family").then(restoreLine),
        call<VoiceMessage[]>("GET", "/messages"),
        call<{ isPro: boolean }>("GET", "/subscription"),
        call<{ advice: string | null }>("GET", "/analysis"),
      ])
    return {
      records,
      device,
      reminders,
      nightMute,
      profile,
      lineConnected: family.lineConnected,
      members: family.members,
      messages: messages.map((message) => ({
        ...message,
        audioUrl: message.audioUrl?.startsWith("http")
          ? message.audioUrl
          : message.audioUrl
            ? `${baseUrl}${message.audioUrl}`
            : undefined,
      })),
      isPro: subscription.isPro,
      advice: analysis.advice,
    }
  },
  addRecord: (amountMl) => call("POST", "/records", { amountMl }),
  updateRecord: (id, amountMl) => call("PATCH", `/records/${encodeURIComponent(id)}`, { amountMl }),
  deleteRecord: (id) => call("DELETE", `/records/${encodeURIComponent(id)}`),
  saveReminders: (settings) => call("PUT", "/settings/reminders", settings),
  saveNightMute: (nightMute) => call("PUT", "/settings/night-mute", nightMute),
  saveProfile: (profile) => call("PUT", "/profile", profile),
  registerSession: (session) =>
    call("POST", "/auth/session", {
      uid: session.uid,
      provider: session.provider,
      phone: session.phone,
      name: session.name ?? "",
    }),
  pairDevice: () => call("POST", "/device/pair"),
  getDevice: () => call("GET", "/device"),
  linkLine: () => call("POST", "/family/line-link"),
  getFamily: () =>
    call<{ lineConnected: boolean; members: FamilyMember[] }>("GET", "/family").then(restoreLine),
  createInvite: async () => (await call<{ url: string }>("POST", "/family/invite")).url,
  createFamilyCode: () =>
    call<{ code: string; expiresAt: string }>("POST", "/family/invite"),
  addMember: (input) => call("POST", "/family/members", input),
  removeMember: (id) => call("DELETE", `/family/members/${encodeURIComponent(id)}`),
  async getMessages() {
    const messages = await call<VoiceMessage[]>("GET", "/messages")
    return messages.map((message) => ({
      ...message,
      audioUrl: message.audioUrl?.startsWith("http")
        ? message.audioUrl
        : message.audioUrl
          ? `${baseUrl}${message.audioUrl}`
          : undefined,
    }))
  },
  async translateMessage(id, lang) {
    const result = await call<{ audioUrl: string; text: string }>(
      "POST",
      `/messages/${encodeURIComponent(id)}/translate`,
      { lang },
    )
    const audioUrl = result.audioUrl?.startsWith("http")
      ? result.audioUrl
      : `${baseUrl}${result.audioUrl}`
    return { audioUrl, text: result.text }
  },
  markPlayed: (id) => call("POST", `/messages/${encodeURIComponent(id)}/played`),
  subscribe: (plan) => call("POST", "/subscription", { plan }),
  deleteAccount: () => call("DELETE", "/auth/account"),
}

// ------------------------------------------------------------- sample answers

const pause = () => new Promise((resolve) => setTimeout(resolve, 150))

// The sample backend keeps its own copy, so saving behaves like a real server.
const sample = {
  records: drinkRecords,
  messages: voiceMessages,
  members: [...familyMembers],
  profile: initialProfile(zhTW.profile.defaultName),
}

const mockApi: SuilaApi = {
  async loadAll() {
    await pause()
    return {
      records: sample.records,
      device: deviceStatus,
      reminders: initialReminderSettings,
      nightMute: initialNightMute,
      profile: sample.profile,
      lineConnected: initialLineConnected,
      members: sample.members,
      messages: sample.messages,
      isPro: initialIsPro,
      advice: null,
    }
  },
  async addRecord(amountMl) {
    await pause()
    const record = { id: `r${Date.now()}`, time: new Date().toISOString(), amountMl }
    sample.records = [record, ...sample.records]
    return record
  },
  async updateRecord(id, amountMl) {
    await pause()
    sample.records = sample.records.map((record) =>
      record.id === id ? { ...record, amountMl } : record,
    )
    const updated = sample.records.find((record) => record.id === id)
    if (!updated) throw new Error(`No record ${id}`)
    return updated
  },
  async deleteRecord(id) {
    await pause()
    sample.records = sample.records.filter((record) => record.id !== id)
  },
  saveReminders: async (settings) => (await pause(), settings),
  saveNightMute: async (nightMute) => (await pause(), nightMute),
  saveProfile: async (profile) => {
    await pause()
    sample.profile = profile
    return profile
  },
  registerSession: async () => {
    await pause()
  },
  pairDevice: async () => (await pause(), { ...deviceStatus, paired: true, connected: true }),
  getDevice: async () => (await pause(), { ...deviceStatus }),
  linkLine: async () => (await pause(), { url: null, connected: false, code: "123456" }),
  getFamily: async () =>
    (await pause(), {
      lineConnected: initialLineConnected,
      members: sample.members,
    }),
  createInvite: async () => (await pause(), familyInviteLink),
  createFamilyCode: async () =>
    (await pause(), {
      code: "654321",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
  async addMember(input) {
    await pause()
    const colors = ["coral", "blue", "green"] as const
    const member = {
      id: `local-${Date.now()}`,
      name: input.name,
      relation: input.relation,
      color: colors[sample.members.length % colors.length],
    }
    sample.members = [...sample.members, member]
    return member
  },
  async removeMember(id) {
    await pause()
    sample.members = sample.members.filter((member) => member.id !== id)
  },
  getMessages: async () => (await pause(), sample.messages),
  translateMessage: async (_id, lang) =>
    (await pause(), { audioUrl: "", text: `Translated (${lang})` }),
  async markPlayed(id) {
    await pause()
    sample.messages = sample.messages.map((message) =>
      message.id === id ? { ...message, played: true } : message,
    )
  },
  subscribe: async () => (await pause(), { isPro: true }),
  async deleteAccount() {
    await pause()
    sample.profile = initialProfile("")
    sample.members = []
  },
}

/** True when the app runs on sample data (no backend address set). */
export const usingSampleData = baseUrl === ""

export const api: SuilaApi = usingSampleData ? mockApi : httpApi
