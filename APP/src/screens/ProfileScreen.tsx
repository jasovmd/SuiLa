import { useState } from "react"
import { AppSelect } from "../components/AppSelect"
import { Card } from "../components/Card"
import { ConfirmDialog } from "../components/ConfirmDialog"
import { FloatingButton } from "../components/FloatingButton"
import { ScreenHeader } from "../components/ScreenHeader"
import {
  conditionOptions,
  heightOptionsCm,
  weightOptionsKg,
  type ConditionId,
  type Profile,
} from "../data/mock"
import { useT } from "../i18n"

export function ProfileScreen({
  profile,
  onSave,
  onClose,
}: {
  profile: Profile
  onSave: (profile: Profile) => void
  onClose: () => void
}) {
  const t = useT()
  const [draft, setDraft] = useState(profile)
  const [asking, setAsking] = useState(false)
  const changed = JSON.stringify(draft) !== JSON.stringify(profile)
  const { conditions } = draft
  const heightOptions = heightOptionsCm.map((cm) => ({ value: cm, label: cm }))
  const weightOptions = weightOptionsKg.map((kg) => ({ value: kg, label: kg }))

  const toggleCondition = (condition: ConditionId) => {
    setDraft((current) => {
      if (condition === "none") {
        return {
          ...current,
          conditions: current.conditions.includes("none") ? [] : ["none"],
        }
      }
      const withoutNone = current.conditions.filter((item) => item !== "none")
      return {
        ...current,
        conditions: withoutNone.includes(condition)
          ? withoutNone.filter((item) => item !== condition)
          : [...withoutNone, condition],
      }
    })
  }

  return (
    <section className="settings-screen" aria-label={t.profile.aria}>
      <ScreenHeader
        title={t.profile.title}
        onBack={() => (changed ? setAsking(true) : onClose())}
      />

      <div className="settings-content">
        <Card className="settings-profile-card">
          <div className="profile-form">
            <label>
              <span>{t.profile.name}</span>
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder={t.profile.namePlaceholder}
              />
            </label>
            <div className="profile-form-row">
              <label>
                <span>{t.profile.height}</span>
                <AppSelect
                  value={draft.heightCm || "160"}
                  options={heightOptions}
                  ariaLabel={t.profile.height}
                  onChange={(heightCm) =>
                    setDraft((current) => ({ ...current, heightCm }))
                  }
                />
              </label>
              <label>
                <span>{t.profile.weight}</span>
                <AppSelect
                  value={draft.weightKg || "60"}
                  options={weightOptions}
                  ariaLabel={t.profile.weight}
                  onChange={(weightKg) =>
                    setDraft((current) => ({ ...current, weightKg }))
                  }
                />
              </label>
            </div>
          </div>
        </Card>

        <Card>
          <p className="card-label">{t.profile.conditions}</p>
          <div className="condition-chip-grid">
            {conditionOptions.map((condition) => {
              const selected = conditions.includes(condition)
              return (
                <button
                  className={`condition-chip ${selected ? "is-on" : ""}`}
                  type="button"
                  key={condition}
                  aria-pressed={selected}
                  onClick={() => toggleCondition(condition)}
                >
                  {t.profile.conditionLabels[condition]}
                </button>
              )
            })}
          </div>
        </Card>
      </div>

      <FloatingButton onClick={() => onSave(draft)}>{t.common.save}</FloatingButton>

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
