import type { ReactNode } from "react"


export function FloatingButton({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      className="floating-action"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
