import { Preferences } from "@capacitor/preferences"
import { clearLineSelf } from "./lineLink"
import { initializeApp, type FirebaseApp } from "firebase/app"
import {
  getAuth,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  deleteUser,
  signInWithPopup,
  type Auth,
  type ConfirmationResult,
} from "firebase/auth"
import type { Profile } from "../data/mock"

const UID_KEY = "auth.uid"
const PROVIDER_KEY = "auth.provider"
const TOKEN_KEY = "auth.idToken"
const PHONE_KEY = "auth.phone"
const NAME_KEY = "auth.displayName"
const ONBOARD_KEY = "onboarding.done"
const LOCAL_OTP_KEY = "auth.localOtp"

export type AuthProviderKind = "google" | "phone" | "line"

export type AuthSession = {
  uid: string
  provider: AuthProviderKind
  idToken: string | null
  phone: string | null
  displayName: string | null
}

const LINE_CHANNEL_ID = (import.meta.env.VITE_LINE_LOGIN_CHANNEL_ID ?? "").trim()
const LINE_REDIRECT_URI = (
  import.meta.env.VITE_LINE_LOGIN_REDIRECT_URI ??
  `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}/auth/line/callback`
).trim()
const LINE_STATE_KEY = "auth.lineState"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
}

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
  )
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let phoneConfirmation: ConfirmationResult | null = null
let recaptcha: RecaptchaVerifier | null = null

function ensureFirebase() {
  if (!isFirebaseConfigured()) return null
  if (!app) {
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
  }
  return auth
}

async function writeSession(session: AuthSession) {
  await Preferences.set({ key: UID_KEY, value: session.uid })
  await Preferences.set({ key: PROVIDER_KEY, value: session.provider })
  await Preferences.set({ key: TOKEN_KEY, value: session.idToken ?? "" })
  await Preferences.set({ key: PHONE_KEY, value: session.phone ?? "" })
  await Preferences.set({ key: NAME_KEY, value: session.displayName ?? "" })
}

export async function getSession(): Promise<AuthSession | null> {
  const uid = (await Preferences.get({ key: UID_KEY })).value
  if (!uid) return null
  const provider = ((await Preferences.get({ key: PROVIDER_KEY })).value ||
    "phone") as AuthProviderKind
  const idToken = (await Preferences.get({ key: TOKEN_KEY })).value || null
  const phone = (await Preferences.get({ key: PHONE_KEY })).value || null
  const displayName = (await Preferences.get({ key: NAME_KEY })).value || null
  return { uid, provider, idToken, phone, displayName }
}

export async function getIdToken(): Promise<string | null> {
  const session = await getSession()
  return session?.idToken ?? null
}

export async function signOut() {
  await Preferences.remove({ key: UID_KEY })
  await Preferences.remove({ key: PROVIDER_KEY })
  await Preferences.remove({ key: TOKEN_KEY })
  await Preferences.remove({ key: PHONE_KEY })
  await Preferences.remove({ key: NAME_KEY })
  phoneConfirmation = null
  const firebaseAuth = ensureFirebase()
  if (firebaseAuth?.currentUser) {
    await firebaseAuth.signOut()
  }
}

export async function isOnboardingDone() {
  return (await Preferences.get({ key: ONBOARD_KEY })).value === "1"
}

export async function markOnboardingDone() {
  await Preferences.set({ key: ONBOARD_KEY, value: "1" })
}

export async function clearOnboarding() {
  await Preferences.remove({ key: ONBOARD_KEY })
}

export async function deleteLocalAccount() {
  const firebaseAuth = ensureFirebase()
  const current = firebaseAuth?.currentUser
  if (current) {
    try {
      await deleteUser(current)
    } catch {
    }
  }
  await signOut()
  await clearOnboarding()
  await clearLineSelf()
}

export function isProfileComplete(profile: Profile) {
  return Boolean(profile.name?.trim() && profile.heightCm && profile.weightKg)
}

function normalizePhone(raw: string) {
  const trimmed = raw.trim().replace(/[\s-]/g, "")
  if (trimmed.startsWith("+")) return trimmed
  if (trimmed.startsWith("09") && trimmed.length === 10) {
    return `+886${trimmed.slice(1)}`
  }
  if (trimmed.startsWith("886")) return `+${trimmed}`
  return trimmed
}

function randomOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function ensureRecaptchaHost() {
  let host = document.getElementById("suila-recaptcha")
  if (!host) {
    host = document.createElement("div")
    host.id = "suila-recaptcha"
    host.style.display = "none"
    document.body.appendChild(host)
  }
  return host.id
}

export async function signInWithGoogle(): Promise<AuthSession> {
  const firebaseAuth = ensureFirebase()
  if (firebaseAuth) {
    const provider = new GoogleAuthProvider()
    const result = await signInWithPopup(firebaseAuth, provider)
    const idToken = await result.user.getIdToken()
    const session: AuthSession = {
      uid: result.user.uid,
      provider: "google",
      idToken,
      phone: result.user.phoneNumber,
      displayName: result.user.displayName,
    }
    await writeSession(session)
    return session
  }

  const session: AuthSession = {
    uid: `google-local-${Date.now()}`,
    provider: "google",
    idToken: `local-${Date.now()}`,
    phone: null,
    displayName: "水啦用戶",
  }
  await writeSession(session)
  return session
}

export function isLineLoginConfigured() {
  return Boolean(LINE_CHANNEL_ID && LINE_REDIRECT_URI.startsWith("http"))
}

export async function signInWithLine(): Promise<AuthSession> {
  if (!isLineLoginConfigured()) {
    const session: AuthSession = {
      uid: `line-local-${Date.now()}`,
      provider: "line",
      idToken: `local-line-${Date.now()}`,
      phone: null,
      displayName: "LINE 用戶",
    }
    await writeSession(session)
    await Preferences.set({
      key: "line.self",
      value: JSON.stringify({ id: session.uid, name: session.displayName }),
    })
    return session
  }

  const { Browser } = await import("@capacitor/browser")
  const { App } = await import("@capacitor/app")
  const state = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await Preferences.set({ key: LINE_STATE_KEY, value: state })

  const authUrl =
    "https://access.line.me/oauth2/v2.1/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: LINE_CHANNEL_ID,
      redirect_uri: LINE_REDIRECT_URI,
      state,
      scope: "profile openid",
      bot_prompt: "aggressive",
    }).toString()

  return await new Promise<AuthSession>((resolve, reject) => {
    let settled = false
    let sub: { remove: () => Promise<void> } | null = null

    const finish = async (error?: Error, session?: AuthSession) => {
      if (settled) return
      settled = true
      try {
        await Browser.close()
      } catch {
      }
      try {
        await sub?.remove()
      } catch {
      }
      if (error || !session) reject(error ?? new Error("line_failed"))
      else resolve(session)
    }

    void App.addListener("appUrlOpen", async (event) => {
      try {
        if (!event.url.startsWith("com.suila.app://line-login")) return
        const query = new URL(event.url.replace("com.suila.app://", "https://app/")).searchParams
        if (query.get("error")) {
          await finish(new Error("line_denied"))
          return
        }
        const code = query.get("code") || ""
        const returnedState = query.get("state") || ""
        const expected = (await Preferences.get({ key: LINE_STATE_KEY })).value || ""
        await Preferences.remove({ key: LINE_STATE_KEY })
        if (!code || !returnedState || returnedState !== expected) {
          await finish(new Error("line_state"))
          return
        }
        const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")
        const response = await fetch(`${apiBase}/auth/line`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, redirectUri: LINE_REDIRECT_URI }),
        })
        if (!response.ok) throw new Error("line_failed")
        const data = (await response.json()) as {
          uid: string
          displayName: string
          accessToken: string
        }
        const session: AuthSession = {
          uid: data.uid,
          provider: "line",
          idToken: data.accessToken,
          phone: null,
          displayName: data.displayName || "LINE 用戶",
        }
        await writeSession(session)
        await Preferences.set({
          key: "line.self",
          value: JSON.stringify({ id: session.uid, name: session.displayName || "" }),
        })
        await finish(undefined, session)
      } catch (err) {
        await finish(err instanceof Error ? err : new Error("line_failed"))
      }
    }).then((handle) => {
      sub = handle
    })

    void Browser.open({ url: authUrl }).catch((err) => {
      void finish(err instanceof Error ? err : new Error("line_failed"))
    })
  })
}

export async function sendPhoneCode(
  phoneRaw: string,
): Promise<{ phone: string; demoCode?: string }> {
  const phone = normalizePhone(phoneRaw)
  if (!/^\+\d{8,15}$/.test(phone)) {
    throw new Error("invalid_phone")
  }

  const firebaseAuth = ensureFirebase()
  if (firebaseAuth) {
    if (recaptcha) {
      try {
        recaptcha.clear()
      } catch {
      }
      recaptcha = null
    }
    recaptcha = new RecaptchaVerifier(firebaseAuth, ensureRecaptchaHost(), {
      size: "invisible",
    })
    phoneConfirmation = await signInWithPhoneNumber(firebaseAuth, phone, recaptcha)
    await Preferences.set({ key: PHONE_KEY, value: phone })
    return { phone }
  }

  const code = randomOtp()
  await Preferences.set({ key: LOCAL_OTP_KEY, value: `${phone}|${code}` })
  await Preferences.set({ key: PHONE_KEY, value: phone })
  return { phone, demoCode: code }
}

export async function confirmPhoneCode(codeRaw: string): Promise<AuthSession> {
  const code = codeRaw.trim()
  if (!/^\d{6}$/.test(code)) throw new Error("invalid_code")

  const firebaseAuth = ensureFirebase()
  if (firebaseAuth && phoneConfirmation) {
    const result = await phoneConfirmation.confirm(code)
    const idToken = await result.user.getIdToken()
    const session: AuthSession = {
      uid: result.user.uid,
      provider: "phone",
      idToken,
      phone: result.user.phoneNumber,
      displayName: result.user.displayName || result.user.phoneNumber,
    }
    await writeSession(session)
    phoneConfirmation = null
    return session
  }

  const stored = (await Preferences.get({ key: LOCAL_OTP_KEY })).value || ""
  const [phone, expected] = stored.split("|")
  if (!phone || expected !== code) throw new Error("bad_code")
  await Preferences.remove({ key: LOCAL_OTP_KEY })
  const session: AuthSession = {
    uid: `phone-local-${phone}`,
    provider: "phone",
    idToken: `local-${phone}-${Date.now()}`,
    phone,
    displayName: phone,
  }
  await writeSession(session)
  return session
}
