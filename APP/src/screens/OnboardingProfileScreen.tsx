import { useEffect, useState } from "react"
import { AppSelect } from "../components/AppSelect"
import { Card } from "../components/Card"
import { FloatingButton } from "../components/FloatingButton"
import { LiquidFillLoader } from "../components/LiquidFillLoader"
import {
  conditionOptions,
  heightOptionsCm,
  weightOptionsKg,
  type ConditionId,
  type Profile,
} from "../data/mock"
import { useT } from "../i18n"
import { markOnboardingDone } from "../lib/auth"

const emptyProfile: Profile = {
  name: "",
  heightCm: "160",
  weightKg: "60",
  conditions: ["none"],
}

export function OnboardingProfileScreen({
  initial = emptyProfile,
  onSave,
  onComplete,
}: {
  initial?: Profile
  onSave: (profile: Profile) => Promise<void>
  onComplete: () => void
}) {
  const t = useT()
  const [draft, setDraft] = useState<Profile>({
    ...initial,
    name: initial.name || "",
    heightCm: initial.heightCm || "160",
    weightKg: initial.weightKg || "60",
    conditions: initial.conditions?.length ? initial.conditions : ["none"],
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const heightOptions = heightOptionsCm.map((cm) => ({ value: cm, label: cm }))
  const weightOptions = weightOptionsKg.map((kg) => ({ value: kg, label: kg }))
  const canSave = Boolean(draft.name.trim())

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      name: current.name.trim() ? current.name : initial.name || "",
      heightCm: current.heightCm || initial.heightCm || "160",
      weightKg: current.weightKg || initial.weightKg || "60",
    }))
  }, [initial.name, initial.heightCm, initial.weightKg])

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

  if (busy) {
    return (
      <section className="onboard-screen" aria-label={t.onboarding.title}>
        <div className="auth-busy">
          <LiquidFillLoader label={t.onboarding.saving} />
        </div>
      </section>
    )
  }

  return (
    <section className="onboard-screen" aria-label={t.onboarding.title}>
      <div className="settings-content">
        <p className="onboard-lead">{t.onboarding.lead}</p>
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
              const selected = draft.conditions.includes(condition)
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
        {error && <p className="auth-error">{error}</p>}
      </div>

      <FloatingButton
        disabled={!canSave}
        onClick={() => {
          setBusy(true)
          setError("")
          onSave(draft)
            .then(() => markOnboardingDone())
            .then(() => onComplete())
            .catch(() => {
              setError(t.onboarding.failed)
              setBusy(false)
            })
        }}
      >
        {t.onboarding.continue}
      </FloatingButton>
    </section>
  )
}
