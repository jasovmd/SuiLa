import { useId } from "react"


const bottlePath =
  "M56 10 H84 V34 C84 46 122 50 122 76 V212 Q122 228 106 228 H34 Q18 228 18 212 V76 C18 50 56 46 56 34 Z"

const bottomY = 228
const fullHeight = 168

const wavePath =
  "M0 8 Q35 0 70 8 T140 8 T210 8 T280 8 V260 H0 Z"


export function WaterBottle({
  level,
  className = "",
}: {
  level: number
  className?: string
}) {
  
  const id = useId().replace(/:/g, "")
  const top = bottomY - Math.max(0, Math.min(1, level)) * fullHeight

  return (
    <svg
      className={`water-bottle ${className}`.trim()}
      viewBox="0 0 140 240"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`bottle-${id}`}>
          <path d={bottlePath} />
        </clipPath>
        <linearGradient id={`water-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5fe6ff" />
          <stop offset="1" stopColor="#1f7dff" />
        </linearGradient>
      </defs>
      <path className="bottle-glass" d={bottlePath} />
      <g clipPath={`url(#bottle-${id})`}>
        <g className="bottle-water" style={{ transform: `translateY(${top - 8}px)` }}>
          <path className="wave wave-back" d={wavePath} />
          <path className="wave wave-front" d={wavePath} fill={`url(#water-${id})`} />
        </g>
      </g>
      {[0.25, 0.5, 0.75].map((mark) => (
        <path
          className="bottle-mark"
          key={mark}
          d={`M104 ${bottomY - mark * fullHeight} H116`}
        />
      ))}
      <path className="bottle-edge" d={bottlePath} />
    </svg>
  )
}
