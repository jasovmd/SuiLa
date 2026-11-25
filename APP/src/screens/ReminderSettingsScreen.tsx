import { useState } from "react"
import { AppSelect } from "../components/AppSelect"
import { Card } from "../components/Card"
import { ConfirmDialog } from "../components/ConfirmDialog"
import { FloatingButton } from "../components/FloatingButton"
import { GoalDial } from "../components/GoalDial"
import { ScreenHeader } from "../components/ScreenHeader"
import { type ReminderSettings } from "../data/mock"
import { useT } from "../i18n"
import { halfHours, splitTime } from "../lib/time"

export function ReminderSettingsScreen({
  settings,
  showHealthNote,
  onSave,
  onClose,
}: {
  settings: ReminderSettings
  showHealthNote: boolean
  onSave: (settings: ReminderSettings) => void
  onClose: () => void
}) {
  const t = useT()
  const [draft, setDraft] = useState(settings)
  const [asking, setAsking] = useState(false)
  const changed = JSON.stringify(draft) !== JSON.stringify(settings)
  const label = (time: string) => t.common.clock(...splitTime(time))
  const unused = halfHours.filter((time) => !draft.times.includes(time))
  const allTimeOptions = halfHours.map((time) => ({
    value: time,
    label: label(time),
  }))

  const changeTime = (index: number, next: string) => {
    setDraft((current) => {
      const times = [...current.times]
      times[index] = next
      return { ...current, times: [...new Set(times)].sort() }
    })
  }

  const addTime = (time: string) => {
    if (!time) return
    setDraft((current) => ({
      ...current,
      times: [...new Set([...current.times, time])].sort(),
    }))
  }

  const removeTime = (time: string) => {
    setDraft((current) => ({
      ...current,
      times: current.times.filter((item) => item !== time),
    }))
  }

  return (
    <section className="settings-screen" aria-label={t.reminders.title}>
      <ScreenHeader
        title={t.reminders.title}
        onBack={() => (changed ? setAsking(true) : onClose())}
      />

      <div className="settings-content">
        <Card>
          <p className="card-label">{t.reminders.goalLabel}</p>
          <GoalDial
            value={draft.dailyGoalMl}
            formatLabel={t.reminders.goalValue}
            onChange={(dailyGoalMl) =>
              setDraft((current) => ({ ...current, dailyGoalMl }))
            }
          />
          {showHealthNote && (
            <p className="health-note">{t.reminders.healthNote}</p>
          )}
        </Card>

        <Card>
          <p className="card-label">{t.reminders.timesLabel}</p>
          {draft.times.length === 0 && (
            <p className="records-empty">{t.reminders.noTimes}</p>
          )}
          <div className="time-select-list">
            {draft.times.map((time, index) => (
              <div className="time-select-row" key={`${time}-${index}`}>
                <AppSelect
                  value={time}
                  options={allTimeOptions.filter(
                    (option) =>
                      option.value === time || !draft.times.includes(option.value),
                  )}
                  ariaLabel={t.reminders.addTimeAria}
                  onChange={(next) => changeTime(index, next)}
                />
                <button
                  className="edit-button"
                  type="button"
                  aria-label={t.reminders.removeAria(label(time))}
                  onClick={() => removeTime(time)}
                >
                  {t.reminders.remove}
                </button>
              </div>
            ))}
          </div>
          {unused.length > 0 && (
            <div className="add-time-select">
              <span>{t.reminders.add}</span>
              <AppSelect
                value=""
                placeholder={t.reminders.addTimeAria}
                options={unused.map((time) => ({
                  value: time,
                  label: label(time),
                }))}
                ariaLabel={t.reminders.addTimeAria}
                onChange={addTime}
              />
            </div>
          )}
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
