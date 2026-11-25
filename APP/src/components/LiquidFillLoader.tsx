import { useId } from "react"

const wavePath =
  "M0 10 Q30 0 60 10 T120 10 T180 10 T240 10 V160 H0 Z"


export function LiquidFillLoader({
  label,
  progress,
  brand,
  sub,
}: {
  label: string
  progress?: number
  brand?: string
  sub?: string
}) {
  const waterId = useId().replace(/:/g, "")
  const looping = progress === undefined
  const ratio = looping
    ? undefined
    : Math.min(1, Math.max(0, progress / 100))
  const waterTop = ratio === undefined ? undefined : 118 - ratio * 100

  return (
    <div className="liquid-fill" role="status" aria-live="polite" aria-busy="true">
      {brand && (
        <p className="liquid-fill-brand">
          {brand}
          {sub ? <small>{sub}</small> : null}
        </p>
      )}
      <div className="liquid-fill-circle" aria-hidden="true">
        <svg className="liquid-fill-svg" viewBox="0 0 120 120">
          <defs>
            <clipPath id={`liquid-clip-${waterId}`}>
              <circle cx="60" cy="60" r="52" />
            </clipPath>
            <linearGradient id={`liquid-water-${waterId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5fe6ff" />
              <stop offset="1" stopColor="#1f7dff" />
            </linearGradient>
          </defs>
          <circle className="liquid-fill-rim" cx="60" cy="60" r="52" />
          <g clipPath={`url(#liquid-clip-${waterId})`}>
            <g
              className={`liquid-fill-body ${looping ? "is-looping" : ""}`}
              style={
                waterTop === undefined
                  ? undefined
                  : { transform: `translate3d(0, ${waterTop}px, 0)` }
              }
            >
              <path className="wave wave-back" d={wavePath} />
              <path
                className="wave wave-front"
                d={wavePath}
                fill={`url(#liquid-water-${waterId})`}
              />
            </g>
          </g>
          <circle className="liquid-fill-edge" cx="60" cy="60" r="52" />
        </svg>
      </div>
      <p className="liquid-fill-label">{label}</p>
    </div>
  )
}
