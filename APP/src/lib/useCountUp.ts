import { useEffect, useRef, useState } from "react"


export function useCountUp(target: number, durationMs = 600): number {
  const [shown, setShown] = useState(target)
  const from = useRef(target)

  useEffect(() => {
    if (!Number.isFinite(target)) return
    const start = Number.isFinite(from.current) ? from.current : target
    if (
      start === target ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      from.current = target
      setShown(target)
      return
    }
    const began = performance.now()
    let frame = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      const value = Math.round(start + (target - start) * eased)
      from.current = value
      setShown(value)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs])

  return shown
}
