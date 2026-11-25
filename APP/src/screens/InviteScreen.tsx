import { Card } from "../components/Card"
import { FloatingButton } from "../components/FloatingButton"
import { ScreenHeader } from "../components/ScreenHeader"
import { useT } from "../i18n"


export function InviteScreen({
  link,
  onShared,
  onClose,
}: {
  
  link: string | null
  onShared: (message: string) => void
  onClose: () => void
}) {
  const t = useT()

  const share = async () => {
    if (!link) return
    try {
      if (navigator.share) {
        await navigator.share({ title: t.invite.title, url: link })
        onShared(t.invite.sharedToast)
        return
      }
      await navigator.clipboard.writeText(link)
      onShared(t.invite.copiedToast)
    } catch {
      
      onShared(t.invite.failedToast)
    }
  }

  return (
    <section className="settings-screen" aria-label={t.invite.title}>
      <ScreenHeader title={t.invite.title} onBack={onClose} />

      <div className="settings-content">
        <Card>
          <p className="card-label">{t.invite.stepsLabel}</p>
          <ol className="pair-steps">
            {t.invite.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Card>
      </div>

      <FloatingButton disabled={!link} onClick={share}>
        {link ? t.invite.share : t.common.loading}
      </FloatingButton>
    </section>
  )
}
