import { useEffect, useId, useState } from "react"
import { createPortal } from "react-dom"

export type AppSelectOption = { value: string; label: string }


export function AppSelect({
  value,
  options,
  ariaLabel,
  disabled = false,
  placeholder,
  onChange,
}: {
  value: string
  options: AppSelectOption[]
  ariaLabel: string
  disabled?: boolean
  placeholder?: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const selected = options.find((option) => option.value === value)
  const shown = selected?.label ?? placeholder ?? ""

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div className={`app-select ${open ? "is-open" : ""}`}>
      <button
        className="app-select-trigger"
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => !disabled && setOpen(true)}
      >
        <span>{shown}</span>
        <b aria-hidden="true">▼</b>
      </button>

      {open &&
        createPortal(
          <div className="app-select-sheet" role="presentation">
            <button
              className="app-select-backdrop"
              type="button"
              aria-label={ariaLabel}
              onClick={() => setOpen(false)}
            />
            <div className="app-select-panel" role="dialog" aria-label={ariaLabel}>
              <p className="app-select-title">{ariaLabel}</p>
              <ul className="app-select-menu" id={listId} role="listbox">
                {options.map((option) => {
                  const active = option.value === value
                  return (
                    <li key={option.value} role="presentation">
                      <button
                        className={`app-select-option ${active ? "is-active" : ""}`}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          onChange(option.value)
                          setOpen(false)
                        }}
                      >
                        {option.label}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
