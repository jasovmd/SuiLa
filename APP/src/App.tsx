import { useCallback, useEffect, useRef, useState } from "react"
import { api, type AppData } from "./api"
import { BottomNav, familyPage, pageCount } from "./components/BottomNav"
import { LiquidFillLoader } from "./components/LiquidFillLoader"
import { Toast } from "./components/Toast"
import {
  demoValues,
  drinkRecords,
  type DrinkRecord,
  fluidSensitiveConditions,
  voiceMessages,
  type Profile,
} from "./data/mock"
import { defaultNames, useT } from "./i18n"
import {
  deleteLocalAccount,
  getSession,
  isOnboardingDone,
  signOut,
  type AuthSession,
} from "./lib/auth"
import { useAndroidBack } from "./lib/useAndroidBack"
import { isToday } from "./lib/date"
import { publishHomeWidget } from "../widget/publishHomeWidget"
import {
  inQuietHours,
  maybeProgressNotification,
  syncReminderNotifications,
} from "./lib/remindersNotify"
import { getVoiceLanguage, playReminderCue, voiceSpeechLang } from "./lib/voiceLanguage"
import { useTabSwipe } from "./lib/useTabSwipe"
import { useVoicePlayer } from "./lib/useVoicePlayer"
import { AboutScreen } from "./screens/AboutScreen"
import { AddWaterScreen } from "./screens/AddWaterScreen"
import { EditRecordScreen } from "./screens/EditRecordScreen"
import {
  DemoPanelScreen,
  type DemoData,
} from "./screens/DemoPanelScreen"
import { DeviceScreen } from "./screens/DeviceScreen"
import { PairingScreen } from "./screens/PairingScreen"
import { CalendarScreen } from "./screens/CalendarScreen"
import { FamilyScreen } from "./screens/FamilyScreen"
import { HabitsScreen } from "./screens/HabitsScreen"
import { InviteScreen } from "./screens/InviteScreen"
import { HomeScreen } from "./screens/HomeScreen"
import { LoginScreen } from "./screens/LoginScreen"
import { MyScreen } from "./screens/MyScreen"
import { NightMuteScreen } from "./screens/NightMuteScreen"
import { OnboardingProfileScreen } from "./screens/OnboardingProfileScreen"
import { ProScreen } from "./screens/ProScreen"
import { ProfileScreen } from "./screens/ProfileScreen"
import { ReminderSettingsScreen } from "./screens/ReminderSettingsScreen"
import { SettingsScreen } from "./screens/SettingsScreen"

type Overlay =
  | "calendar"
  | "addWater"
  | "editRecord"
  | "profile"
  | "reminders"
  | "nightMute"
  | "device"
  | "pairing"
  | "about"
  | "settings"
  | "habits"
  | "invite"
  | "demo"
  | "pro"
  | null

/** How often to ask the backend for new voice messages while the app is open. */
const messageCheckMs = 2_000
/** How often to poll LINE binding while a connect code is on screen. */
const lineBindCheckMs = 2_500

type BootPhase = "boot" | "login" | "onboarding" | "loading" | "ready" | "failed"

/** Session → onboarding → backend load → main app. */
export default function App() {
  const t = useT()
  const [phase, setPhase] = useState<BootPhase>("boot")
  const [session, setSession] = useState<AuthSession | null>(null)
  const [data, setData] = useState<AppData | null>(null)
  const [onboardSeed, setOnboardSeed] = useState<Profile>({
    name: "",
    heightCm: "160",
    weightKg: "60",
    conditions: ["none"],
  })

  const refreshSession = useCallback(async () => {
    const next = await getSession()
    setSession(next)
    if (!next) {
      setPhase("login")
      return
    }
    await api
      .registerSession?.({
        uid: next.uid,
        provider: next.provider,
        idToken: next.idToken,
        phone: next.phone,
        name: next.displayName ?? "",
      })
      .catch(() => undefined)
    const done = await isOnboardingDone()
    if (!done) {
      const guessedName = next.displayName?.trim() || ""
      try {
        const profile = await api.loadAll().then((all) => all.profile)
        setOnboardSeed({
          name: profile.name?.trim() || guessedName,
          heightCm: profile.heightCm || "160",
          weightKg: profile.weightKg || "60",
          conditions: profile.conditions?.length ? profile.conditions : ["none"],
        })
      } catch {
        setOnboardSeed({
          name: guessedName,
          heightCm: "160",
          weightKg: "60",
          conditions: ["none"],
        })
      }
      setPhase("onboarding")
      return
    }
    setPhase("loading")
    try {
      setData(await api.loadAll())
      setPhase("ready")
    } catch {
      setPhase("failed")
    }
  }, [])

  useEffect(() => {
    refreshSession()
  }, [refreshSession])

  const retryLoad = () => {
    setPhase("loading")
    api.loadAll().then(
      (all) => {
        setData(all)
        setPhase("ready")
      },
      () => setPhase("failed"),
    )
  }

  if (phase === "boot" || phase === "loading") {
    return (
      <main className="app-shell">
        <div className="page load-screen">
          <LiquidFillLoader
            brand={t.brand.name}
            sub={t.brand.latin}
            label={t.common.loading}
          />
        </div>
      </main>
    )
  }

  if (phase === "failed") {
    return (
      <main className="app-shell">
        <div className="page load-screen">
          <LiquidFillLoader
            brand={t.brand.name}
            sub={t.brand.latin}
            label={t.common.loadFailed}
            progress={12}
          />
          <button className="outline-button" type="button" onClick={retryLoad}>
            {t.common.retry}
          </button>
        </div>
      </main>
    )
  }

  if (phase === "login" || !session) {
    return (
      <main className="app-shell">
        <LoginScreen onSignedIn={() => refreshSession()} />
      </main>
    )
  }

  if (phase === "onboarding") {
    return (
      <main className="app-shell">
        <OnboardingProfileScreen
          initial={onboardSeed}
          onSave={(profile) => api.saveProfile(profile).then(() => undefined)}
          onComplete={() => {
            setPhase("loading")
            api.loadAll().then(
              (all) => {
                setData(all)
                setPhase("ready")
              },
              () => setPhase("failed"),
            )
          }}
        />
      </main>
    )
  }

  if (!data) {
    return (
      <main className="app-shell">
        <div className="page load-screen">
          <LiquidFillLoader
            brand={t.brand.name}
            sub={t.brand.latin}
            label={t.common.loading}
          />
        </div>
      </main>
    )
  }

  return (
    <LoadedApp
      initial={data}
      onSignedOut={() => {
        setSession(null)
        setPhase("login")
      }}
    />
  )
}

function LoadedApp({
  initial,
  onSignedOut,
}: {
  initial: AppData
  onSignedOut: () => void
}) {
  const t = useT()
  const [currentPage, setCurrentPage] = useState(0)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [records, setRecords] = useState(initial.records)
  const [editingRecord, setEditingRecord] = useState<DrinkRecord | null>(null)
  const todayRecords = records.filter((record) => isToday(new Date(record.time)))
  const todayWater = todayRecords.reduce(
    (total, record) => total + record.amountMl,
    0,
  )
  const [profile, setProfile] = useState(initial.profile)
  // The sample owner's name follows the language, unless the user typed their own.
  useEffect(() => {
    setProfile((current) =>
      defaultNames.includes(current.name)
        ? { ...current, name: t.profile.defaultName }
        : current,
    )
  }, [t])
  const [night, setNight] = useState(initial.nightMute)
  const [device, setDevice] = useState(initial.device)
  // Where to go back to when the pairing page closes.
  const [pairingBack, setPairingBack] = useState<Overlay>(null)
  const openPairing = () => {
    setPairingBack(overlay)
    setOverlay("pairing")
  }
  const [reminders, setReminders] = useState(initial.reminders)
  const waterPercentage = Math.min(
    100,
    Math.round((todayWater / reminders.dailyGoalMl) * 100),
  )
  const [lineConnected, setLineConnected] = useState(initial.lineConnected)
  const [lineBindCode, setLineBindCode] = useState<string | null>(null)
  const [lineBindBusy, setLineBindBusy] = useState(false)
  const [members, setMembers] = useState(initial.members)
  const [isPro, setIsPro] = useState(initial.isPro)
  const [advice] = useState(initial.advice)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [familyCode, setFamilyCode] = useState<string | null>(null)
  const [familyCodeBusy, setFamilyCodeBusy] = useState(false)
  const [demoData, setDemoData] = useState<DemoData>("normal")
  // Hidden way into the demo panel: five quick taps on the app name.
  const brandTaps = useRef({ count: 0, last: 0 })
  const handleBrandTap = () => {
    const now = Date.now()
    const taps = brandTaps.current
    taps.count = now - taps.last < 600 ? taps.count + 1 : 1
    taps.last = now
    if (taps.count >= 5) {
      taps.count = 0
      setOverlay("demo")
    }
  }
  const [messages, setMessages] = useState(initial.messages)
  const [translatingId, setTranslatingId] = useState<string | null>(null)
  const voice = useVoicePlayer()
  const remindedSlots = useRef<Set<string>>(new Set())
  // New messages only count while LINE is linked.
  const newMessageCount = lineConnected
    ? messages.filter((message) => !message.played).length
    : 0
  const [toast, setToast] = useState<string | null>(null)
  // Full-screen views slide out before they are removed.
  const [closing, setClosing] = useState(false)
  const closeOverlay = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOverlay(null)
      return
    }
    setClosing(true)
    window.setTimeout(() => {
      setOverlay(null)
      setClosing(false)
    }, 200)
  }, [])

  /** Runs a backend call; on failure the screen stays open and says so. */
  const save = async <T,>(work: () => Promise<T>, done: (result: T) => void) => {
    try {
      done(await work())
    } catch {
      setToast(t.common.actionFailed)
    }
  }

  // Confirmation messages disappear on their own after a few seconds.
  useEffect(() => {
    if (toast === null) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  // The home widget reads this. The app can reach the server while it is open.
  useEffect(() => {
    publishHomeWidget(todayWater, reminders.dailyGoalMl, device.connected)
  }, [todayWater, reminders.dailyGoalMl, device.connected])

  // Local push for fixed times (works in background) + night mute.
  useEffect(() => {
    void syncReminderNotifications({
      times: reminders.times,
      night,
      title: t.reminders.pushTitle,
      body: t.reminders.pushFixed,
    })
  }, [reminders.times, night, t.reminders.pushTitle, t.reminders.pushFixed])

  // Fixed speech (while open) + afternoon progress nudge (same pace rule as LINE).
  useEffect(() => {
    const tick = () => {
      void maybeProgressNotification({
        totalMl: todayWater,
        goalMl: reminders.dailyGoalMl,
        night,
        title: t.reminders.pushTitle,
        body: t.reminders.pushProgress,
      })
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, "0")
      const mm = String(now.getMinutes()).padStart(2, "0")
      const slot = `${hh}:${mm}`
      const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${slot}`
      if (!reminders.times.includes(slot) || remindedSlots.current.has(dayKey)) return
      if (now.getSeconds() > 5) return
      if (inQuietHours(slot, night)) return
      remindedSlots.current.add(dayKey)
      const lang = getVoiceLanguage()
      const files = {
        "zh-TW": "該喝水了，記得補充水分。",
        en: "Time to drink some water.",
        "nan-TW": "該飲水矣，記得補水份。",
      } as const
      playReminderCue(files[lang] ?? files["zh-TW"], lang)
    }
    const timer = window.setInterval(tick, 15_000)
    tick()
    return () => window.clearInterval(timer)
  }, [
    reminders.times,
    reminders.dailyGoalMl,
    todayWater,
    night,
    t.reminders.pushTitle,
    t.reminders.pushProgress,
  ])

  // The base is "connected" only while its heartbeat is fresh, so re-check it.
  useEffect(() => {
    if (overlay === "demo") return
    const timer = window.setInterval(() => {
      api.getDevice().then(setDevice, () => {})
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [overlay])

  // Tell the server this phone's name, so a LINE voice can be addressed to this person.
  useEffect(() => {
    const name = profile.name.trim()
    if (!name) return
    void getSession().then((current) => {
      if (!current) return
      void api.registerSession?.({
        uid: current.uid,
        provider: current.provider,
        idToken: current.idToken,
        phone: current.phone,
        name,
      })
    })
  }, [profile.name])

  // While the app is open, ask now and then whether family sent something new.
  const unplayedRef = useRef(newMessageCount)
  unplayedRef.current = newMessageCount
  useEffect(() => {
    if (!lineConnected) return
    const timer = window.setInterval(() => {
      Promise.all([api.getMessages(), api.getFamily()]).then(
        ([latest, family]) => {
          const unplayed = latest.filter((message) => !message.played).length
          if (unplayed > unplayedRef.current) {
            setToast(t.family.newMessageToast(unplayed - unplayedRef.current))
          }
          setMessages(latest)
          setLineConnected(family.lineConnected)
          setMembers(family.members)
          if (family.lineConnected) setLineBindCode(null)
        },
        () => {
          // A missed check is retried on the next round; nothing to tell the owner.
        },
      )
    }, messageCheckMs)
    return () => window.clearInterval(timer)
  }, [lineConnected, t])

  // While a bind code is showing, poll until LINE self-binding succeeds.
  useEffect(() => {
    if (lineConnected || !lineBindCode) return
    const timer = window.setInterval(() => {
      api.getFamily().then((family) => {
        if (!family.lineConnected) return
        setLineConnected(true)
        setMembers(family.members)
        setLineBindCode(null)
        setToast(t.family.connectedToast)
        api.getMessages().then(setMessages, () => {})
      }, () => {})
    }, lineBindCheckMs)
    return () => window.clearInterval(timer)
  }, [lineConnected, lineBindCode, t])

  const moveToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(0, Math.min(pageCount - 1, page)))
  }, [])

  useAndroidBack({
    hasOverlay: overlay !== null,
    onCloseOverlay: closeOverlay,
    page: currentPage,
    onPageBack: () => moveToPage(Math.max(0, currentPage - 1)),
  })

  const shell = useRef<HTMLDivElement>(null)
  const swipe = useTabSwipe(shell, currentPage, pageCount, moveToPage)
  const hasSensitiveCondition = profile.conditions.some((condition) =>
    fluidSensitiveConditions.includes(condition),
  )
  const sampleText: Record<string, string> = t.family.messageText

  return (
    <main className="app-shell">
      <div className={closing ? "page is-closing" : "page"} ref={shell}>
        <header className="topbar">
          <div
            className="brand"
            aria-label={t.brand.aria}
            onClick={handleBrandTap}
          >
            <span className="brand-name">
              {t.brand.name}
              <small>{t.brand.latin}</small>
            </span>
          </div>
        </header>

        <div className="swipe-window">
          <div className="swipe-track">
            <HomeScreen
              records={records}
              isPro={isPro}
              onOpenHabits={() => setOverlay(isPro ? "habits" : "pro")}
              todayWater={todayWater}
              goalMl={reminders.dailyGoalMl}
              waterPercentage={waterPercentage}
              device={device}
              onPair={openPairing}
              todayRecords={todayRecords}
              onEditRecord={(record) => {
                setEditingRecord(record)
                setOverlay("editRecord")
              }}
              newMessageCount={newMessageCount}
              onOpenCalendar={() => setOverlay("calendar")}
              onOpenMessages={() => moveToPage(familyPage)}
            />
            <FamilyScreen
              connected={lineConnected}
              members={members}
              messages={messages}
              playingId={voice.playingId}
              translatingId={translatingId}
              onPlay={(message) => {
                voice.play(
                  message.id,
                  sampleText[message.id] ?? "",
                  t.common.speechLang,
                  message.durationSec,
                  message.audioUrl,
                )
                setMessages((current) =>
                  current.map((item) =>
                    item.id === message.id ? { ...item, played: true } : item,
                  ),
                )
                api.markPlayed(message.id).catch(() => {})
              }}
              onPlayTranslated={(message) => {
                const lang = getVoiceLanguage()
                setTranslatingId(message.id)
                api
                  .translateMessage(message.id, lang)
                  .then((result) => {
                    voice.play(
                      `${message.id}-tr`,
                      result.text || sampleText[message.id] || "",
                      voiceSpeechLang(lang),
                      message.durationSec,
                      result.audioUrl || undefined,
                    )
                    setMessages((current) =>
                      current.map((item) =>
                        item.id === message.id
                          ? {
                              ...item,
                              played: true,
                              translatedAudioUrl: result.audioUrl,
                              translatedText: result.text,
                            }
                          : item,
                      ),
                    )
                    api.markPlayed(message.id).catch(() => {})
                  })
                  .catch(() => setToast(t.voicePlay.translateFailed))
                  .finally(() => setTranslatingId(null))
              }}
              onStop={voice.stop}
              bindCode={lineBindCode}
              bindBusy={lineBindBusy}
              onConnect={() => {
                setLineBindBusy(true)
                save(api.linkLine, (result) => {
                  setLineBindBusy(false)
                  if (result.connected) {
                    setLineConnected(true)
                    setLineBindCode(null)
                    setToast(t.family.connectedToast)
                    api.getFamily().then((family) => {
                      setLineConnected(family.lineConnected)
                      setMembers(family.members)
                    }, () => {})
                    api.getMessages().then(setMessages, () => {})
                    return
                  }
                  if (result.code) {
                    setLineBindCode(result.code)
                    return
                  }
                  if (result.url) {
                    window.location.href = result.url
                  }
                }).finally(() => setLineBindBusy(false))
              }}
              isPro={isPro}
              inviteCode={familyCode}
              inviteBusy={familyCodeBusy}
              onInvite={() => {
                setFamilyCodeBusy(true)
                void save(api.createFamilyCode, (result) => {
                  setFamilyCode(result.code)
                }).finally(() => setFamilyCodeBusy(false))
              }}
              onRemoveMember={(id) => {
                const target = members.find((member) => member.id === id)
                const sample = t.family.people[id as keyof typeof t.family.people]
                const relationLabel =
                  target?.relation && target.relation !== "本人"
                    ? (t.family.relations[
                        target.relation as keyof typeof t.family.relations
                      ] ?? target.relation)
                    : ""
                const displayName = sample
                  ? t.family.personLabel(sample.relation, sample.name)
                  : relationLabel
                    ? t.family.personLabel(relationLabel, target?.name ?? "")
                    : target?.name ?? ""
                save(() => api.removeMember(id), () => {
                  setToast(t.family.removedMemberToast(displayName))
                  api.getFamily().then(
                    (family) => {
                      setLineConnected(family.lineConnected)
                      setMembers(family.members)
                      if (!family.lineConnected) setLineBindCode(null)
                    },
                    () => {
                      setMembers((current) => current.filter((member) => member.id !== id))
                    },
                  )
                })
              }}
            />
            <MyScreen
              ownerName={profile.name}
              onOpenProfile={() => setOverlay("profile")}
              onOpenReminders={() => setOverlay("reminders")}
              onOpenNightMute={() => setOverlay("nightMute")}
              onOpenDevice={() => setOverlay("device")}
              onOpenHabits={() => setOverlay(isPro ? "habits" : "pro")}
              onOpenAbout={() => setOverlay("about")}
              onOpenSettings={() => setOverlay("settings")}
              onOpenPro={() => setOverlay("pro")}
              isPro={isPro}
            />
          </div>
        </div>

        {overlay === "calendar" && (
          <CalendarScreen
            records={records}
            goalMl={reminders.dailyGoalMl}
            onClose={closeOverlay}
          />
        )}

        {overlay === "addWater" && (
          <AddWaterScreen
            onAdd={(amountMl) =>
              save(
                () => api.addRecord(amountMl),
                (record) => {
                  // shortcut: new records go on top without re-sorting by time.
                  setRecords((current) => [record, ...current])
                  setToast(t.home.addedToast(amountMl))
                  closeOverlay()
                },
              )
            }
            onClose={closeOverlay}
          />
        )}

        {overlay === "editRecord" && editingRecord && (
          <EditRecordScreen
            record={editingRecord}
            onSave={(amountMl) =>
              save(
                () => api.updateRecord(editingRecord.id, amountMl),
                (updated) => {
                  setRecords((current) =>
                    current.map((record) =>
                      record.id === updated.id ? updated : record,
                    ),
                  )
                  setToast(t.editRecord.updatedToast)
                  closeOverlay()
                },
              )
            }
            onDelete={() =>
              save(
                () => api.deleteRecord(editingRecord.id),
                () => {
                  setRecords((current) =>
                    current.filter((record) => record.id !== editingRecord.id),
                  )
                  setToast(t.editRecord.deletedToast)
                  closeOverlay()
                },
              )
            }
            onClose={closeOverlay}
          />
        )}

        {overlay === "profile" && (
          <ProfileScreen
            profile={profile}
            onSave={(changed) =>
              save(
                () => api.saveProfile(changed),
                (saved) => {
                  setProfile(saved)
                  setToast(t.profile.savedToast)
                  closeOverlay()
                },
              )
            }
            onClose={closeOverlay}
          />
        )}

        {overlay === "reminders" && (
          <ReminderSettingsScreen
            settings={reminders}
            showHealthNote={hasSensitiveCondition}
            onSave={(settings) =>
              save(
                () => api.saveReminders(settings),
                (saved) => {
                  setReminders(saved)
                  setToast(t.reminders.savedToast)
                  closeOverlay()
                },
              )
            }
            onClose={closeOverlay}
          />
        )}

        {overlay === "nightMute" && (
          <NightMuteScreen
            night={night}
            onSave={(changed) =>
              save(
                () => api.saveNightMute(changed),
                (saved) => {
                  setNight(saved)
                  setToast(t.night.savedToast)
                  closeOverlay()
                },
              )
            }
            onClose={closeOverlay}
          />
        )}

        {overlay === "device" && (
          <DeviceScreen
            device={device}
            onPair={openPairing}
            onClose={closeOverlay}
          />
        )}

        {overlay === "pairing" && (
          <PairingScreen
            onPaired={() =>
              save(api.pairDevice, (paired) => {
                setDevice(paired)
                setOverlay(pairingBack)
              })
            }
            onClose={() => setOverlay(pairingBack)}
          />
        )}

        {overlay === "habits" && (
          <HabitsScreen
            records={records}
            goalMl={reminders.dailyGoalMl}
            advice={advice}
            hasSensitiveCondition={hasSensitiveCondition}
            onAddReminder={() => setOverlay("reminders")}
            onClose={closeOverlay}
          />
        )}

        {overlay === "about" && <AboutScreen onClose={closeOverlay} />}
        {overlay === "settings" && (
          <SettingsScreen
            onClose={closeOverlay}
            onSignOut={() => {
              void signOut().then(onSignedOut)
            }}
            onDeleteAccount={async () => {
              try {
                await api.deleteAccount()
                await deleteLocalAccount()
                onSignedOut()
              } catch {
                setToast(t.settings.deleteFailed)
              }
            }}
          />
        )}

        {/* The demo panel changes what this screen shows, not what the backend stores. */}
        {overlay === "demo" && (
          <DemoPanelScreen
            data={demoData}
            device={
              !device.paired
                ? "unpaired"
                : device.connected
                  ? "connected"
                  : "offline"
            }
            batteryLow={
              device.batteryPercent === demoValues.lowBatteryPercent
            }
            lineConnected={lineConnected}
            isPro={isPro}
            onData={(value) => {
              voice.stop()
              setDemoData(value)
              setRecords(value === "dayOne" ? [] : drinkRecords)
              setMessages(value === "dayOne" ? [] : voiceMessages)
            }}
            onDevice={(value) =>
              setDevice((current) => ({
                ...current,
                paired: value !== "unpaired",
                connected: value === "connected",
                pendingSyncCount:
                  value === "offline" ? demoValues.offlinePendingCount : 0,
              }))
            }
            onBatteryLow={(low) =>
              setDevice((current) => ({
                ...current,
                batteryPercent: low
                  ? demoValues.lowBatteryPercent
                  : demoValues.normalBatteryPercent,
              }))
            }
            onLine={setLineConnected}
            onPro={setIsPro}
            // Reloading fetches everything again, so every screen goes back to the start.
            onReset={() => window.location.reload()}
            onClose={closeOverlay}
          />
        )}

        {overlay === "pro" && (
          <ProScreen
            isPro={isPro}
            onSubscribe={(plan) =>
              save(
                () => api.subscribe(plan),
                (result) => {
                  setIsPro(result.isPro)
                  if (result.isPro) setToast(t.pro.upgradedToast)
                },
              )
            }
            onClose={closeOverlay}
          />
        )}

        {overlay === "invite" && (
          <InviteScreen
            link={inviteLink}
            onShared={setToast}
            onClose={closeOverlay}
          />
        )}

        {/* Home's main action. Floats above the navigation, on the 喝水 tab only. */}
        <button
          className={`floating-action home-action ${currentPage === 0 ? "" : "is-away"}`.trim()}
          type="button"
          tabIndex={currentPage === 0 ? undefined : -1}
          aria-hidden={currentPage === 0 ? undefined : true}
          onClick={() => setOverlay("addWater")}
        >
          {t.home.addWater}
        </button>

        <Toast message={toast} />
        <BottomNav
          slideHandlers={swipe}
          currentPage={currentPage}
          newMessageCount={newMessageCount}
          onSelect={moveToPage}
        />
      </div>
    </main>
  )
}
