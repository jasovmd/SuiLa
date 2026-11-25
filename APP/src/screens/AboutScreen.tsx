import { Card } from "../components/Card"
import { ScreenHeader } from "../components/ScreenHeader"
import { useT } from "../i18n"


const LINE_OA_URL = "https://line.me/R/ti/p/@049jguej"

export function AboutScreen({ onClose }: { onClose: () => void }) {
  const t = useT()

  const openLine = async () => {
    try {
      const { Browser } = await import("@capacitor/browser")
      await Browser.open({ url: LINE_OA_URL })
    } catch {
      window.open(LINE_OA_URL, "_blank", "noopener,noreferrer")
    }
  }

  return (
    <section className="settings-screen" aria-label={t.about.title}>
      <ScreenHeader title={t.about.title} onBack={onClose} />

      <div className="settings-content about-content">
        <Card className="about-card">
          <h2>{t.about.demoTitle}</h2>
          <p>{t.about.demoBody}</p>
        </Card>

        <Card className="about-card">
          <h2>{t.about.featuresTitle}</h2>
          <ul className="about-feature-list">
            {t.about.features.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>

        <Card className="about-card about-contact-card">
          <h2>{t.about.contactTitle}</h2>
          <p>{t.about.contactBody}</p>
          <button className="line-oa-button" type="button" onClick={() => void openLine()}>
            <span className="line-oa-mark" aria-hidden="true">
              LINE
            </span>
            <strong>{t.about.lineButton}</strong>
          </button>
        </Card>
      </div>
    </section>
  )
}
