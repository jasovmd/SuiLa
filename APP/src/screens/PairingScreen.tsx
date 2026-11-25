import { useEffect, useRef, useState } from "react"
import { api } from "../api"
import { Card } from "../components/Card"
import { FloatingButton } from "../components/FloatingButton"
import { CheckCircleIcon, WarningIcon } from "../components/Icons"
import { ScreenHeader } from "../components/ScreenHeader"
import { useT } from "../i18n"
import {
  connectBase,
  endProvision,
  scanBases,
  scanWifi,
  sendWifi,
  type FoundBase,
  type WifiChoice,
} from "../lib/bleProvision"

type Phase =
  | "steps"
  | "searching"
  | "pick"
  | "wifi"
  | "password"
  | "joining"
  | "found"
  | "missing"
  | "failed"

export function PairingScreen({
  onPaired,
  onClose,
}: {
  onPaired: () => void
  onClose: () => void
}) {
  const t = useT()
  const [phase, setPhase] = useState<Phase>("steps")
  const [bases, setBases] = useState<FoundBase[]>([])
  const [chosen, setChosen] = useState<FoundBase | null>(null)
  const [networks, setNetworks] = useState<WifiChoice[]>([])
  const [ssid, setSsid] = useState("")
  const [password, setPassword] = useState("")
  const [detail, setDetail] = useState("")
  const [keyboard, setKeyboard] = useState(0)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => {
    void endProvision()
  }, [])

  useEffect(() => {
    if (phase !== "password") {
      setKeyboard(0)
      return
    }
    const input = passwordRef.current
    const focusTimer = window.setTimeout(() => input?.focus(), 60)
    const lift = () => {
      const view = window.visualViewport
      if (!view) return
      const covered = Math.max(0, window.innerHeight - view.height - view.offsetTop)
      setKeyboard(covered)
      input?.scrollIntoView({ block: "center" })
    }
    lift()
    window.visualViewport?.addEventListener("resize", lift)
    window.visualViewport?.addEventListener("scroll", lift)
    return () => {
      window.clearTimeout(focusTimer)
      window.visualViewport?.removeEventListener("resize", lift)
      window.visualViewport?.removeEventListener("scroll", lift)
    }
  }, [phase])

  const search = async () => {
    setPhase("searching")
    setBases([])
    setChosen(null)
    try {
      const [nearby, cloud] = await Promise.all([
        scanBases(),
        api.getDevice().catch(() => null),
      ])
      if (cloud?.connected) {
        setDetail(cloud.name || t.device.baseName)
        setPhase("found")
        return
      }
      if (nearby.length === 0) {
        setPhase("missing")
        return
      }
      setBases(nearby)
      setPhase("pick")
    } catch {
      setDetail(t.pairing.bleOff)
      setPhase("failed")
    }
  }

  const openBase = async (base: FoundBase) => {
    setChosen(base)
    setPhase("joining")
    setDetail(t.pairing.connecting)
    try {
      await connectBase(base)
      const list = await scanWifi()
      setNetworks(list)
      setSsid("")
      setPassword("")
      setPhase(list.length === 0 ? "failed" : "wifi")
      if (list.length === 0) setDetail(t.pairing.noWifi)
    } catch {
      setDetail(t.pairing.connectFail)
      setPhase("failed")
    }
  }

  const joinWifi = async () => {
    if (!ssid.trim()) return
    setPhase("joining")
    setDetail(t.pairing.joining)
    try {
      await sendWifi(ssid.trim(), password)
      const started = Date.now()
      let online = false
      while (Date.now() - started < 20000) {
        const device = await api.getDevice().catch(() => null)
        if (device?.connected) {
          online = true
          setDetail(device.name || chosen?.name || t.device.baseName)
          break
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000))
      }
      await endProvision()
      if (!online) {
        setDetail(chosen?.name || t.device.baseName)
      }
      setPhase("found")
    } catch {
      setDetail(t.pairing.wifiFailed)
      setPhase("failed")
    }
  }

  return (
    <section
      className="settings-screen"
      aria-label={t.pairing.title}
      style={keyboard > 0 ? { height: `calc(100dvh - ${keyboard}px)` } : undefined}
    >
      <ScreenHeader title={t.pairing.title} onBack={onClose} />

      <div className="settings-content">
        {phase === "steps" && (
          <Card>
            <p className="card-label">{t.pairing.stepsLabel}</p>
            <ol className="pair-steps">
              {t.pairing.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Card>
        )}

        <div aria-live="polite">
          {phase === "searching" && (
            <Card>
              <p className="pair-status">{t.pairing.searching}</p>
            </Card>
          )}
          {phase === "pick" && (
            <Card>
              <p className="card-label">{t.pairing.foundTitle}</p>
              <div className="pair-list">
                {bases.map((base) => (
                  <button
                    key={base.id}
                    className="outline-button is-wide"
                    type="button"
                    onClick={() => void openBase(base)}
                  >
                    {base.name}
                  </button>
                ))}
              </div>
            </Card>
          )}
          {phase === "wifi" && (
            <Card>
              <p className="card-label">{t.pairing.wifiTitle}</p>
              <p className="field-hint">{t.pairing.wifiHint}</p>
              <div className="pair-list">
                {networks.map((network) => (
                  <button
                    key={network.ssid}
                    className="pair-wifi"
                    type="button"
                    onClick={() => {
                      setSsid(network.ssid)
                      setPassword("")
                      setPhase("password")
                    }}
                  >
                    {network.ssid}
                  </button>
                ))}
              </div>
            </Card>
          )}
          {phase === "password" && (
            <Card>
              <p className="card-label">{t.pairing.chosenLabel}</p>
              <p className="pair-chosen">{ssid}</p>
              <label className="pair-password">
                <span>{t.pairing.password}</span>
                <input
                  ref={passwordRef}
                  type="text"
                  value={password}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button className="pair-change" type="button" onClick={() => setPhase("wifi")}>
                {t.pairing.changeWifi}
              </button>
            </Card>
          )}
          {phase === "joining" && (
            <Card>
              <p className="pair-status">{detail}</p>
            </Card>
          )}
          {phase === "found" && (
            <Card>
              <p className="pair-status is-ok">
                <CheckCircleIcon />
                {t.pairing.foundTitle}
              </p>
              <p className="pair-status">{detail}</p>
            </Card>
          )}
          {(phase === "missing" || phase === "failed") && (
            <Card>
              <p className="pair-status is-warn">
                <WarningIcon />
                {phase === "missing" ? t.pairing.missing : detail}
              </p>
            </Card>
          )}
        </div>
      </div>

      {phase === "steps" && (
        <FloatingButton onClick={() => void search()}>{t.pairing.start}</FloatingButton>
      )}
      {phase === "password" && (
        <FloatingButton onClick={() => void joinWifi()}>{t.pairing.join}</FloatingButton>
      )}
      {phase === "found" && (
        <FloatingButton onClick={onPaired}>{t.pairing.confirm}</FloatingButton>
      )}
      {(phase === "missing" || phase === "failed") && (
        <FloatingButton onClick={() => void search()}>{t.pairing.retry}</FloatingButton>
      )}
    </section>
  )
}
