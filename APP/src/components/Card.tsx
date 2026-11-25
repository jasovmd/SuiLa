import type { ReactNode } from "react"


export function Card({
  className = "",
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return <div className={`info-card ${className}`.trim()}>{children}</div>
}
