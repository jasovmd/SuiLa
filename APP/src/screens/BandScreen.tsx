import { useState } from "react"
import { Card } from "../components/Card"
import { BandIcon } from "../components/Icons"
import { useT } from "../i18n"

type Phase = "idle" | "scanning" | "linked"

export function BandScreen() {
  const t = useT()
  const [phase, setPhase] = useState<Phase>("idle")

  const connect = () => {
    if (phase !== "idle") return
    setPhase("scanning")
    window.setTimeout(() => setPhase("linked"), 1400)
  }

  const disconnect = () => setPhase("idle")

  return (
    <section className="swipe-page band-page" aria-label={t.band.title}>
      <div className="hero-blue tab-band">
        <p className="band-title">{t.nav.band}</p>
        <p className="band-sub">{t.band.heroBody}</p>
      </div>

      <Card className="band-panel">
        <div className="band-panel-icon" aria-hidden="true">
          <BandIcon />
        </div>
        <strong className="band-panel-name">{t.band.deviceName}</strong>
        <p className="band-panel-status">
          {phase === "linked"
            ? t.band.linked
            : phase === "scanning"
              ? t.band.scanning
              : t.band.idle}
        </p>
        {phase === "linked" ? (
          <button className="outline-button is-wide" type="button" onClick={disconnect}>
            {t.band.disconnect}
          </button>
        ) : (
          <button
            className="outline-button is-wide"
            type="button"
            disabled={phase === "scanning"}
            onClick={connect}
          >
            {phase === "scanning" ? t.band.scanning : t.band.connect}
          </button>
        )}
      </Card>

      <p className="band-note">{t.band.note}</p>
    </section>
  )
}
