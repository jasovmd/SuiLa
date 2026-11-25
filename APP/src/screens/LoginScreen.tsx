import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react"
import { LiquidFillLoader } from "../components/LiquidFillLoader"
import { useT } from "../i18n"
import {
  confirmPhoneCode,
  sendPhoneCode,
  signInWithGoogle,
  signInWithLine,
} from "../lib/auth"

type Step = "choose" | "phone" | "otp"

function fitAuthViewport(node: HTMLElement | null) {
  if (!node) return
  const viewport = window.visualViewport
  const height = viewport?.height ?? window.innerHeight
  const width = viewport?.width ?? window.innerWidth
  node.style.setProperty("--auth-h", `${Math.round(height)}px`)
  node.style.setProperty("--auth-w", `${Math.round(width)}px`)
}

function useAuthViewport(screen: RefObject<HTMLElement | null>, revision: string) {
  useLayoutEffect(() => {
    fitAuthViewport(screen.current)
  }, [screen, revision])

  useEffect(() => {
    const apply = () => fitAuthViewport(screen.current)
    apply()
    window.visualViewport?.addEventListener("resize", apply)
    window.visualViewport?.addEventListener("scroll", apply)
    window.addEventListener("resize", apply)
    return () => {
      window.visualViewport?.removeEventListener("resize", apply)
      window.visualViewport?.removeEventListener("scroll", apply)
      window.removeEventListener("resize", apply)
    }
  }, [screen])
}

const orbWave =
  "M-120 52 Q-90 30 -60 52 T0 52 T60 52 T120 52 T180 52 T240 52 V170 H-120 Z"

function AuthOrb() {
  const id = useId().replace(/:/g, "")
  return (
    <div className="auth-orb" aria-hidden="true">
      <svg className="auth-orb-svg" viewBox="0 0 120 120">
        <defs>
          <clipPath id={`auth-clip-${id}`}>
            <circle cx="60" cy="60" r="50" />
          </clipPath>
          <linearGradient id={`auth-water-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d9fbff" />
            <stop offset="0.42" stopColor="#3eb6ff" />
            <stop offset="1" stopColor="#1454d0" />
          </linearGradient>
          <linearGradient id={`auth-sheen-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle className="auth-orb-halo" cx="60" cy="60" r="54" />
        <g clipPath={`url(#auth-clip-${id})`}>
          <circle cx="60" cy="60" r="50" fill={`url(#auth-water-${id})`} />
          <g className="auth-orb-wave-back">
            <g className="auth-orb-wave">
              <path d={orbWave} fill="#ffffff" opacity="0.28" />
            </g>
          </g>
          <g className="auth-orb-wave">
            <path d={orbWave} fill="#e9fbff" opacity="0.42" />
          </g>
          <circle className="auth-orb-bubble is-a" cx="46" cy="96" r="3.2" />
          <circle className="auth-orb-bubble is-b" cx="70" cy="100" r="2.1" />
          <circle className="auth-orb-bubble is-c" cx="57" cy="98" r="2.6" />
          <ellipse
            className="auth-orb-shine"
            cx="44"
            cy="40"
            rx="16"
            ry="9"
            fill={`url(#auth-sheen-${id})`}
          />
        </g>
        <circle className="auth-orb-edge" cx="60" cy="60" r="50" />
      </svg>
    </div>
  )
}

function CodeDigits({ value }: { value: string }) {
  return (
    <div className="auth-digits" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} className={value[index] ? "is-on" : ""}>
          {value[index] ?? ""}
        </span>
      ))}
    </div>
  )
}

export function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const t = useT()
  const [step, setStep] = useState<Step>("choose")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [hint, setHint] = useState("")
  const screenRef = useRef<HTMLElement>(null)
  useAuthViewport(screenRef, busy ? "busy" : step)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError("")
    try {
      await action()
    } catch (err) {
      const message = err instanceof Error ? err.message : "error"
      if (message === "invalid_phone") setError(t.auth.invalidPhone)
      else if (message === "invalid_code" || message === "bad_code")
        setError(t.auth.invalidCode)
      else setError(t.auth.failed)
    } finally {
      setBusy(false)
    }
  }

  if (busy) {
    return (
      <section className="auth-screen" aria-label={t.auth.title} ref={screenRef}>
        <div className="auth-glow" aria-hidden="true" />
        <div className="auth-busy">
          <LiquidFillLoader
            brand={t.brand.name}
            sub={t.brand.latin}
            label={t.auth.working}
          />
        </div>
      </section>
    )
  }

  return (
    <section className="auth-screen" aria-label={t.auth.title} ref={screenRef}>
      <div className="auth-glow" aria-hidden="true" />
      <div className="auth-wave-band" aria-hidden="true" />

      <div className={`auth-stage is-${step}`}>
        {step === "choose" && (
          <div className="auth-hero">
            <AuthOrb />
            <h1 className="auth-brand">
              <span>{t.brand.name}</span>
              <small>{t.brand.latin}</small>
            </h1>
            <p className="auth-lead">{t.auth.lead}</p>
          </div>
        )}

        {step !== "choose" && (
          <button
            className="auth-back"
            type="button"
            onClick={() => {
              setError("")
              if (step === "otp") {
                setStep("phone")
                setCode("")
                return
              }
              setStep("choose")
              setHint("")
            }}
          >
            {t.common.back}
          </button>
        )}

        {step !== "choose" && (
          <div className="auth-hero" key={step}>
            <AuthOrb />
            <h1 className="auth-brand auth-brand-step">
              <span>{step === "phone" ? t.auth.phone : t.auth.codeLabel}</span>
            </h1>
            <p className="auth-lead">
              {step === "phone" ? t.auth.phoneLead : t.auth.codeLead}
            </p>
          </div>
        )}

        {step === "phone" && (
          <div className="auth-phone auth-card">
            <label>
              {t.auth.phoneLabel}
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={t.auth.phonePlaceholder}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button
              className="auth-btn auth-btn-primary"
              type="button"
              disabled={!phone.trim()}
              onClick={() =>
                run(async () => {
                  const result = await sendPhoneCode(phone)
                  setHint(
                    result.demoCode
                      ? t.auth.demoCode(result.demoCode)
                      : t.auth.codeSent,
                  )
                  setStep("otp")
                })
              }
            >
              {t.auth.sendCode}
            </button>
          </div>
        )}

        {step === "otp" && (
          <div className="auth-phone auth-card">
            <label>
              {t.auth.codeLabel}
              <span className="auth-digit-field">
                <CodeDigits value={code} />
                <input
                  className="auth-digit-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  aria-label={t.auth.codeLabel}
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
              </span>
            </label>
            {hint && <p className="auth-hint">{hint}</p>}
            {error && <p className="auth-error">{error}</p>}
            <button
              className="auth-btn auth-btn-primary"
              type="button"
              disabled={code.length !== 6}
              onClick={() =>
                run(async () => {
                  await confirmPhoneCode(code)
                  onSignedIn()
                })
              }
            >
              {t.auth.verify}
            </button>
          </div>
        )}

        {step === "choose" && (
          <div className="auth-actions">
            <button
              className="auth-btn auth-btn-line"
              type="button"
              onClick={() =>
                run(async () => {
                  await signInWithLine()
                  onSignedIn()
                })
              }
            >
              <span className="auth-btn-icon" aria-hidden="true">
                L
              </span>
              {t.auth.line}
            </button>
            <button
              className="auth-btn auth-btn-google"
              type="button"
              onClick={() =>
                run(async () => {
                  await signInWithGoogle()
                  onSignedIn()
                })
              }
            >
              <span className="auth-btn-icon" aria-hidden="true">
                G
              </span>
              {t.auth.google}
            </button>
            <button
              className="auth-btn auth-btn-phone"
              type="button"
              onClick={() => {
                setStep("phone")
                setError("")
                setHint("")
              }}
            >
              <span className="auth-btn-icon" aria-hidden="true">
                #
              </span>
              {t.auth.phone}
            </button>
          </div>
        )}

        {step === "choose" && error && <p className="auth-error">{error}</p>}
      </div>
    </section>
  )
}
