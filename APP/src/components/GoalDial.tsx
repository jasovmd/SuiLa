import { useEffect, useId, useState } from "react"
import { goalLimits } from "../data/mock"
import { useCountUp } from "../lib/useCountUp"
import { MlSlider } from "./MlSlider"

const wavePath =
  "M0 10 Q30 0 60 10 T120 10 T180 10 T240 10 V160 H0 Z"


export function GoalDial({
  value,
  formatLabel,
  onChange,
}: {
  value: number
  formatLabel: (ml: number) => string
  onChange: (ml: number) => void
}) {
  const [live, setLive] = useState(value)
  const [dragging, setDragging] = useState(false)
  const waterId = useId().replace(/:/g, "")

  useEffect(() => {
    if (!dragging) setLive(value)
  }, [value, dragging])

  const displayValue = dragging ? live : value
  const eased = useCountUp(displayValue, dragging ? 0 : 380)
  const display = dragging ? live : eased
  const span = goalLimits.max - goalLimits.min
  const ratio = Math.min(1, Math.max(0, (display - goalLimits.min) / span))
  const waterTop = 118 - ratio * 100

  return (
    <div className={`goal-dial ${dragging ? "is-dragging" : ""}`}>
      <div className="goal-water-circle" aria-hidden="true">
        <svg className="goal-water-svg" viewBox="0 0 120 120">
          <defs>
            <clipPath id={`goal-clip-${waterId}`}>
              <circle cx="60" cy="60" r="52" />
            </clipPath>
            <linearGradient id={`goal-water-${waterId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5fe6ff" />
              <stop offset="1" stopColor="#1f7dff" />
            </linearGradient>
          </defs>
          <circle className="goal-water-rim" cx="60" cy="60" r="52" />
          <g clipPath={`url(#goal-clip-${waterId})`}>
            <g
              className="goal-water-body"
              style={{ transform: `translate3d(0, ${waterTop}px, 0)` }}
            >
              <path className="wave wave-back" d={wavePath} />
              <path
                className="wave wave-front"
                d={wavePath}
                fill={`url(#goal-water-${waterId})`}
              />
            </g>
          </g>
          <circle className="goal-water-edge" cx="60" cy="60" r="52" />
        </svg>
        <div className="goal-water-readout">
          <strong>{display}</strong>
          <span>ml</span>
        </div>
      </div>

      <p className="goal-dial-readout" aria-live="polite">
        {formatLabel(display)}
      </p>

      <MlSlider
        value={value}
        min={goalLimits.min}
        max={goalLimits.max}
        step={goalLimits.step}
        ariaLabel={formatLabel(display)}
        onLiveChange={(next) => {
          setDragging(true)
          setLive(next)
        }}
        onChange={(next) => {
          setLive(next)
          setDragging(false)
          onChange(next)
        }}
      />
    </div>
  )
}
