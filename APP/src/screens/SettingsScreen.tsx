import { useState } from "react"
import { AppSelect } from "../components/AppSelect"
import { Card } from "../components/Card"
import { ConfirmDialog } from "../components/ConfirmDialog"
import { ScreenHeader } from "../components/ScreenHeader"
import { languages, setLanguage, useLanguage, useT, type Language } from "../i18n"
import {
  setVoiceLanguage,
  useVoiceLanguage,
  voiceLanguages,
} from "../lib/voiceLanguage"

export function SettingsScreen({
  onClose,
  onSignOut,
  onDeleteAccount,
}: {
  onClose: () => void
  onSignOut: () => void
  onDeleteAccount: () => Promise<void>
}) {
  const t = useT()
  const uiLanguage = useLanguage()
  const voiceLanguage = useVoiceLanguage()
  const [confirm, setConfirm] = useState<"signOut" | "delete" | null>(null)
  const [busy, setBusy] = useState(false)

  const removeAccount = async () => {
    setBusy(true)
    try {
      await onDeleteAccount()
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const languageOptions = languages.map((option) => ({
    value: option,
    label: t.my.languageNames[option],
  }))

  return (
    <section className="settings-screen" aria-label={t.settings.title}>
      <ScreenHeader title={t.settings.title} onBack={onClose} />

      <div className="settings-content">
        <Card className="language-card profile-form">
          <label>
            <span>{t.settings.uiLanguage}</span>
            <AppSelect
              value={uiLanguage}
              options={languageOptions}
              ariaLabel={t.settings.uiLanguage}
              onChange={(next) => void setLanguage(next as Language)}
            />
            <span className="field-hint">{t.settings.uiLanguageHint}</span>
          </label>
          <label>
            <span>{t.settings.voiceLanguage}</span>
            <AppSelect
              value={voiceLanguage}
              options={voiceLanguages.map((option) => ({
                value: option,
                label: t.my.languageNames[option],
              }))}
              ariaLabel={t.settings.voiceLanguage}
              onChange={(next) => void setVoiceLanguage(next as Language)}
            />
            <span className="field-hint">{t.settings.voiceLanguageHint}</span>
          </label>
        </Card>

        <div className="settings-account">
          <button
            className="outline-button is-wide"
            type="button"
            onClick={() => setConfirm("signOut")}
          >
            {t.settings.signOut}
          </button>
          <button
            className="settings-delete"
            type="button"
            disabled={busy}
            onClick={() => setConfirm("delete")}
          >
            {t.settings.deleteAccount}
          </button>
        </div>
      </div>

      {confirm === "signOut" && (
        <ConfirmDialog
          message={t.settings.signOutConfirm}
          confirmLabel={t.settings.signOut}
          cancelLabel={t.common.back}
          onConfirm={onSignOut}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "delete" && (
        <ConfirmDialog
          message={t.settings.deleteConfirm}
          confirmLabel={busy ? t.common.loading : t.settings.deleteAccount}
          cancelLabel={t.common.back}
          danger
          onConfirm={() => {
            if (!busy) void removeAccount()
          }}
          onCancel={() => {
            if (!busy) setConfirm(null)
          }}
        />
      )}
    </section>
  )
}
