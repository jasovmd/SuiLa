import { Card } from "../components/Card"
import { PlayIcon, StopIcon } from "../components/Icons"
import {
  freeFamilyLimit,
  type FamilyMember,
  type VoiceMessage,
} from "../data/mock"
import { useT } from "../i18n"
import { isToday } from "../lib/date"

export function FamilyScreen({
  connected,
  members,
  messages,
  playingId,
  onConnect,
  bindCode,
  bindBusy,
  isPro,
  inviteCode,
  inviteBusy,
  onInvite,
  onRemoveMember,
  onPlay,
  onPlayTranslated,
  translatingId,
  onStop,
}: {
  connected: boolean
  members: FamilyMember[]
  messages: VoiceMessage[]
  playingId: string | null
  onConnect: () => void
  bindCode: string | null
  bindBusy: boolean
  isPro: boolean
  inviteCode: string | null
  inviteBusy: boolean
  onInvite: () => void
  onRemoveMember: (id: string) => void
  onPlay: (message: VoiceMessage) => void
  onPlayTranslated: (message: VoiceMessage) => void
  translatingId: string | null
  onStop: () => void
}) {
  const t = useT()
  const familyCount = members.filter((member) => member.relation !== "本人").length
  const atLimit = !isPro && familyCount >= freeFamilyLimit
  const samples: Record<string, { relation: string; name: string; initial: string }> =
    t.family.people

  const personOf = (id: string) => {
    const sample = samples[id]
    if (sample) return sample
    const member = members.find((item) => item.id === id)
    const display = member?.name ?? ""
    const rawRelation = member?.relation ?? ""
    const relations = t.family.relations as Record<string, string>
    return {
      relation: relations[rawRelation] ?? rawRelation,
      name: display,
      initial: display.slice(0, 1) || "?",
    }
  }
  const nameOf = (id: string) => {
    const person = personOf(id)
    const member = members.find((item) => item.id === id)
    // Self is just the LINE / profile display name — no 「本人」 prefix.
    if (member?.relation === "本人") return person.name || t.family.relations["本人"] || "我"
    return person.relation
      ? t.family.personLabel(person.relation, person.name)
      : person.name
  }

  if (!connected) {
    return (
      <section className="swipe-page social-page" aria-label={t.family.aria}>
        <div className="hero-blue tab-band">
          <p className="band-title">{t.nav.family}</p>
          <p className="band-sub">{t.family.bandNotConnected}</p>
        </div>
        <Card className="line-bind-card">
          <p className="family-intro">{t.family.notConnectedIntro}</p>
          {bindCode ? (
            <div className="line-bind-panel" aria-live="polite">
              <p className="line-bind-label">{t.family.bindCodeLabel}</p>
              <p className="line-bind-code">{bindCode}</p>
              <p className="line-bind-hint">{t.family.bindCodeHint}</p>
              <p className="line-bind-wait">{t.family.bindWaiting}</p>
            </div>
          ) : (
            <button
              className="line-join-button"
              type="button"
              disabled={bindBusy}
              onClick={onConnect}
            >
              <strong>{bindBusy ? t.common.loading : t.family.joinLine}</strong>
            </button>
          )}
        </Card>
      </section>
    )
  }

  return (
    <section className="swipe-page social-page" aria-label={t.family.aria}>
      <div className="hero-blue tab-band">
        <p className="band-title">{t.nav.family}</p>
        <p className="band-sub">{t.family.connectedHeading(members.length)}</p>
      </div>

      <Card>
        <p className="card-label">{t.family.listTitle}</p>
        {members.length === 0 && (
          <p className="records-empty">{t.family.noMembers}</p>
        )}
        <div className="connected-people-list">
          {members.map((member) => (
            <div className="connected-person" key={member.id}>
              <span
                className={`person-avatar ${member.color}`}
                aria-hidden="true"
              >
                {personOf(member.id).initial}
              </span>
              <strong>{nameOf(member.id)}</strong>
              <button
                className="edit-button"
                type="button"
                aria-label={t.family.removeAria(nameOf(member.id))}
                onClick={() => onRemoveMember(member.id)}
              >
                {t.family.remove}
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="line-bind-card">
        {atLimit ? (
          <p className="field-hint">{t.family.addMemberHint(freeFamilyLimit)}</p>
        ) : (
          <>
            <button
              className="outline-button is-wide"
              type="button"
              disabled={inviteBusy}
              onClick={onInvite}
            >
              {inviteBusy ? t.common.loading : t.family.addMember}
            </button>
            {inviteCode && (
              <div className="line-bind-panel" aria-live="polite">
                <p className="line-bind-label">{t.family.inviteCodeLabel}</p>
                <p className="line-bind-code">{inviteCode}</p>
                <p className="line-bind-hint">{t.family.inviteCodeHint}</p>
              </div>
            )}
          </>
        )}
      </Card>

      <Card className="voice-card">
        <p className="card-label">{t.family.voiceTitle}</p>
        {messages.length === 0 ? (
          <p className="records-empty">{t.family.noMessages}</p>
        ) : (
          messages.map((message) => {
            const playing = playingId === message.id
            const sender = nameOf(message.from)
            const date = new Date(message.time)
            return (
              <div className="voice-row" key={message.id}>
                <div className="voice-actions">
                  <button
                    className="play-button"
                    type="button"
                    aria-label={
                      playing ? t.family.stopAria(sender) : t.family.playAria(sender)
                    }
                    onClick={() => (playing ? onStop() : onPlay(message))}
                  >
                    {playing ? <StopIcon /> : <PlayIcon />}
                    {playing ? t.family.stop : t.voicePlay.original}
                  </button>
                  <button
                    className="play-button is-secondary"
                    type="button"
                    disabled={translatingId === message.id}
                    onClick={() => onPlayTranslated(message)}
                  >
                    {translatingId === message.id
                      ? t.voicePlay.translating
                      : t.voicePlay.translated}
                  </button>
                </div>
                <div className="voice-info">
                  <strong>
                    {sender}
                    {!message.played && (
                      <b className="new-tag">{t.family.newTag}</b>
                    )}
                  </strong>
                  <span>{t.common.dayTime(date, isToday(date))}</span>
                  <span>{t.family.duration(message.durationSec)}</span>
                </div>
              </div>
            )
          })
        )}
      </Card>
    </section>
  )
}
