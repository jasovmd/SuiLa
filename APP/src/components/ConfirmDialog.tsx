
export function ConfirmDialog({
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  message: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="confirm-screen"
      role="alertdialog"
      aria-modal="true"
      aria-label={message}
    >
      <div className="confirm-card">
        <p>{message}</p>
        <button
          className={`confirm-primary ${danger ? "is-danger" : ""}`.trim()}
          type="button"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button
          className="confirm-secondary"
          type="button"
          onClick={onCancel}
          autoFocus
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  )
}
