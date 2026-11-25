import { useState } from "react"
import { ConfirmDialog } from "../components/ConfirmDialog"
import { FloatingButton } from "../components/FloatingButton"
import { MlSlider } from "../components/MlSlider"
import { ScreenHeader } from "../components/ScreenHeader"
import { WaterBottle } from "../components/WaterBottle"
import { drinkAmountLimits } from "../data/mock"
import { useT } from "../i18n"
import { useCountUp } from "../lib/useCountUp"

const defaultAmount = 200

export function AddWaterScreen({
  onAdd,
  onClose,
}: {
  onAdd: (amountMl: number) => void
  onClose: () => void
}) {
  const t = useT()
  const [amount, setAmount] = useState(defaultAmount)
  const [live, setLive] = useState(defaultAmount)
  const [dragging, setDragging] = useState(false)
  const [asking, setAsking] = useState(false)
  const [touched, setTouched] = useState(false)

  const rawDisplay = dragging ? live : amount
  const display = Number.isFinite(rawDisplay) ? rawDisplay : defaultAmount
  const span = drinkAmountLimits.max - drinkAmountLimits.min
  const cupLevel =
    Math.min(100, Math.max(0, ((display - drinkAmountLimits.min) / span) * 100))
  const readout = useCountUp(display, dragging ? 0 : 320)

  return (
    <section className="extra-water-screen is-techy" aria-label={t.addWater.title}>
      <ScreenHeader
        title={t.addWater.title}
        onBack={() => (touched ? setAsking(true) : onClose())}
      />

      <div className="extra-water-content">
        <div className="water-cup-area">
          <div role="img" aria-label={t.addWater.cupAria(Math.round(cupLevel))}>
            <WaterBottle level={cupLevel / 100} className="is-large" />
          </div>
          <p className="readout" aria-hidden="true">
            <strong>{readout}</strong>
            <span>{t.common.ml}</span>
          </p>
          <p aria-live="polite">{t.addWater.ready(display)}</p>
        </div>

        <div className="extra-water-form">
          <p className="form-label">{t.addWater.sliderLabel}</p>
          <MlSlider
            value={amount}
            min={drinkAmountLimits.min}
            max={drinkAmountLimits.max}
            step={drinkAmountLimits.step}
            ariaLabel={t.addWater.ready(display)}
            onLiveChange={(next) => {
              if (!Number.isFinite(next)) return
              setTouched(true)
              setDragging(true)
              setLive(next)
            }}
            onChange={(next) => {
              if (!Number.isFinite(next)) return
              setTouched(true)
              setLive(next)
              setAmount(next)
              setDragging(false)
            }}
          />
        </div>
      </div>

      <FloatingButton
        onClick={() => {
          const ml = Math.round(display)
          if (!Number.isFinite(ml) || ml <= 0) return
          onAdd(ml)
        }}
      >
        {t.addWater.add}
      </FloatingButton>
      {asking && (
        <ConfirmDialog
          message={t.addWater.unsaved}
          confirmLabel={t.common.leave}
          cancelLabel={t.common.stay}
          onConfirm={onClose}
          onCancel={() => setAsking(false)}
        />
      )}
    </section>
  )
}
