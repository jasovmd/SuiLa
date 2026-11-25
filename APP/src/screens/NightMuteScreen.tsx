import { useState } from "react"
import { AppSelect } from "../components/AppSelect"
import { Card } from "../components/Card"
import { ConfirmDialog } from "../components/ConfirmDialog"
import { FloatingButton } from "../components/FloatingButton"
import { ScreenHeader } from "../components/ScreenHeader"
import type { NightMute } from "../data/mock"
import { useT } from "../i18n"
import { halfHours, splitTime } from "../lib/time"

export function NightMuteScreen({
  night,
  onSave,
  onClose,
}: {
  night: NightMute
  onSave: (night: NightMute) => void
  onClose: () => void
}) {
  const t = useT()
  const [draft, setDraft] = useState(night)
  const [asking, setAsking] = useState(false)
  const changed = JSON.stringify(draft) !== JSON.stringify(night)
  const timeOptions = halfHours.map((time) => ({
    value: time,
    label: t.common.clock(...splitTime(time)),
  }))

  return (
    <section className="settings-screen" aria-label={t.night.aria}>
      <ScreenHeader
        title={t.night.title}
        onBack={() => (changed ? setAsking(true) : onClose())}
      />

      <div className="settings-content">
        <label className="info-card setting-card switch-row">
          <div>
            <strong>{t.night.enable}</strong>
            <span className="switch-state">
              {draft.enabled ? t.common.on : t.common.off}
            </span>
          </div>
          <input
            className="sr-only"
            type="checkbox"
            checked={draft.enabled}
            onChange={() =>
              setDraft((current) => ({ ...current, enabled: !current.enabled }))
            }
          />
          <span
            className={`compact-switch ${draft.enabled ? "is-on" : ""}`}
            aria-hidden="true"
          >
            <span />
          </span>
        </label>

        <Card className="profile-form">
          <label>
            <span>{t.night.start}</span>
            <AppSelect
              value={draft.start}
              options={timeOptions}
              ariaLabel={t.night.start}
              disabled={!draft.enabled}
              onChange={(start) => setDraft((current) => ({ ...current, start }))}
            />
          </label>
          <label>
            <span>{t.night.end}</span>
            <AppSelect
              value={draft.end}
              options={timeOptions}
              ariaLabel={t.night.end}
              disabled={!draft.enabled}
              onChange={(end) => setDraft((current) => ({ ...current, end }))}
            />
          </label>
        </Card>
      </div>

      <FloatingButton onClick={() => onSave(draft)}>
        {t.common.save}
      </FloatingButton>

      {asking && (
        <ConfirmDialog
          message={t.common.unsaved}
          confirmLabel={t.common.leave}
          cancelLabel={t.common.stay}
          onConfirm={onClose}
          onCancel={() => setAsking(false)}
        />
      )}
    </section>
  )
}
