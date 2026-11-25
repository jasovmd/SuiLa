import { useEffect, useRef, useState, type PointerEvent } from "react"

function clampStep(raw: number, min: number, max: number, step: number) {
  if (!Number.isFinite(raw) || !Number.isFinite(step) || step <= 0) return min
  const stepped = Math.round(raw / step) * step
  if (!Number.isFinite(stepped)) return min
  return Math.min(max, Math.max(min, stepped))
}

/** Horizontal ml slider. Tracks the finger live; commits with onChange on release. */
export function MlSlider({
  value,
  min,
  max,
  step,
  ariaLabel,
  onChange,
  onLiveChange,
}: {
  value: number
  min: number
  max: number
  step: number
  ariaLabel: string
  onChange: (ml: number) => void
  onLiveChange?: (ml: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const liveRef = useRef(value)
  const [dragging, setDragging] = useState(false)
  const [live, setLive] = useState(value)

  useEffect(() => {
    if (!draggingRef.current) {
      liveRef.current = value
      setLive(value)
    }
  }, [value])

  const display = dragging ? live : value
  const span = max - min
  const ratio = Math.min(1, Math.max(0, (display - min) / span))

  const valueFromClientX = (clientX: number) => {
    if (!Number.isFinite(clientX)) return liveRef.current
    const track = trackRef.current
    if (!track) return liveRef.current
    const box = track.getBoundingClientRect()
    if (!(box.width > 0)) return liveRef.current
    const t = (clientX - box.left) / box.width
    if (!Number.isFinite(t)) return liveRef.current
    const next = clampStep(min + Math.min(1, Math.max(0, t)) * span, min, max, step)
    return Number.isFinite(next) ? next : liveRef.current
  }

  const publishLive = (next: number, force = false) => {
    if (!force && next === liveRef.current) return
    liveRef.current = next
    setLive(next)
    onLiveChange?.(next)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    publishLive(valueFromClientX(event.clientX), true)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    publishLive(valueFromClientX(event.clientX))
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    const next = valueFromClientX(event.clientX)
    draggingRef.current = false
    setDragging(false)
    liveRef.current = next
    setLive(next)
    onLiveChange?.(next)
    onChange(next)
  }

  return (
    <div className={`ml-slider ${dragging ? "is-dragging" : ""}`}>
      <div
        className="goal-slider"
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={display}
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault()
            const next = clampStep(value + step, min, max, step)
            setLive(next)
            onLiveChange?.(next)
            onChange(next)
          }
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault()
            const next = clampStep(value - step, min, max, step)
            setLive(next)
            onLiveChange?.(next)
            onChange(next)
          }
        }}
      >
        <div className="goal-slider-track">
          <span className="goal-slider-fill" style={{ width: `${ratio * 100}%` }} />
          <span
            className="goal-slider-thumb"
            style={{ left: `${ratio * 100}%` }}
          />
        </div>
        <div className="goal-slider-ends">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    </div>
  )
}
