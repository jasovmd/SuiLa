import { useCallback, useEffect, useRef, useState } from "react"
import { api, type AppData } from "./api"
import {
  BottomNav,
  familyPage,
  pageCount,
  remapPage,
} from "./components/BottomNav"
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
import { BandScreen } from "./screens/BandScreen"
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


const messageCheckMs = 2_000

const lineBindCheckMs = 2_500

type BootPhase = "boot" | "login" | "onboarding" | "loading" | "ready" | "failed"


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
  
  useEffect(() => {
    setProfile((current) =>
      defaultNames.includes(current.name)
        ? { ...current, name: t.profile.defaultName }
        : current,
    )
  }, [t])
  const [night, setNight] = useState(initial.nightMute)
  const [device, setDevice] = useState(initial.device)
  
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
  const tabs = pageCount(isPro)
  const familyTab = familyPage(isPro)
  const [advice, setAdvice] = useState(initial.advice)
  const [adviceLoading, setAdviceLoading] = useState(false)
  const openHabits = () => {
    if (!isPro) {
      setOverlay("pro")
      return
    }
    setOverlay("habits")
    
    if (advice) return
    setAdviceLoading(true)
    void api
      .getAnalysis()
      .then((result) => {
        if (result.advice) setAdvice(result.advice)
      })
      .catch(() => {})
      .finally(() => setAdviceLoading(false))
  }
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [familyCode, setFamilyCode] = useState<string | null>(null)
  const [familyCodeBusy, setFamilyCodeBusy] = useState(false)
  const [demoData, setDemoData] = useState<DemoData>("normal")
  
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
  
  const newMessageCount = lineConnected
    ? messages.filter((message) => !message.played).length
    : 0
  const [toast, setToast] = useState<string | null>(null)
  
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

  
  const save = async <T,>(work: () => Promise<T>, done: (result: T) => void) => {
    try {
      done(await work())
    } catch {
      setToast(t.common.actionFailed)
    }
  }

  
  useEffect(() => {
    if (toast === null) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  
  useEffect(() => {
    publishHomeWidget(todayWater, reminders.dailyGoalMl, device.connected)
  }, [todayWater, reminders.dailyGoalMl, device.connected])

  
  useEffect(() => {
    void syncReminderNotifications({
      times: reminders.times,
      night,
      title: t.reminders.pushTitle,
      body: t.reminders.pushFixed,
    })
  }, [reminders.times, night, t.reminders.pushTitle, t.reminders.pushFixed])

  
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

  useEffect(() => {
    if (overlay === "demo") return
    const timer = window.setInterval(() => {
      api.getDevice().then(setDevice, () => {})
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [overlay])

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
        },
      )
    }, messageCheckMs)
    return () => window.clearInterval(timer)
  }, [lineConnected, t])

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

  const moveToPage = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(0, Math.min(tabs - 1, page)))
    },
    [tabs],
  )

  const setPro = useCallback((next: boolean) => {
    setIsPro((was) => {
      if (was === next) return was
      setCurrentPage((page) => remapPage(page, was, next))
      return next
    })
  }, [])

  useAndroidBack({
    hasOverlay: overlay !== null,
    onCloseOverlay: closeOverlay,
    page: currentPage,
    onPageBack: () => moveToPage(Math.max(0, currentPage - 1)),
  })

  const shell = useRef<HTMLDivElement>(null)
  const swipe = useTabSwipe(shell, currentPage, tabs, moveToPage)
  const hasSensitiveCondition = (profile.conditions ?? []).some((condition) =>
    fluidSensitiveConditions.includes(condition),
  )
  const sampleText: Record<string, string> = t.family.messageText

  return (
    <main className="app-shell">
      <div className={closing ? "page is-closing" : "page"} ref={shell}>
        <div className="swipe-window">
          <div className="swipe-track">
            <HomeScreen
              records={records}
              isPro={isPro}
              onBrandTap={handleBrandTap}
              onOpenHabits={openHabits}
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
              onOpenMessages={() => moveToPage(familyTab)}
            />
            {isPro && <BandScreen />}
            <FamilyScreen
              connected={lineConnected}
              members={members}
              messages={messages}
              playingId={voice.playingId}
              translatingId={translatingId}
              onPlay={(message) => {
                const lang = getVoiceLanguage()
                const finishPlayed = () => {
                  setMessages((current) =>
                    current.map((item) =>
                      item.id === message.id ? { ...item, played: true } : item,
                    ),
                  )
                  api.markPlayed(message.id).catch(() => {})
                }
                const playOriginal = () => {
                  voice.play(
                    message.id,
                    sampleText[message.id] ?? "",
                    t.common.speechLang,
                    message.durationSec,
                    message.audioUrl,
                  )
                  finishPlayed()
                }
                const playTranslated = (audioUrl: string | undefined, text: string) => {
                  voice.play(
                    `${message.id}-tr`,
                    text || sampleText[message.id] || "",
                    voiceSpeechLang(lang),
                    message.durationSec,
                    audioUrl,
                  )
                  finishPlayed()
                }
                if (message.translatedLang === lang && message.translatedText === "") {
                  playOriginal()
                  return
                }
                if (
                  message.translatedAudioUrl &&
                  message.translatedLang === lang &&
                  message.translatedText
                ) {
                  playTranslated(message.translatedAudioUrl, message.translatedText)
                  return
                }
                setTranslatingId(message.id)
                api
                  .translateMessage(message.id, lang)
                  .then((result) => {
                    setMessages((current) =>
                      current.map((item) =>
                        item.id === message.id
                          ? {
                              ...item,
                              played: true,
                              translatedAudioUrl: result.skipped
                                ? undefined
                                : result.audioUrl,
                              translatedText: result.skipped ? "" : result.text,
                              translatedLang: lang,
                            }
                          : item,
                      ),
                    )
                    if (result.skipped) playOriginal()
                    else playTranslated(result.audioUrl, result.text)
                  })
                  .catch((err: unknown) => {
                    const detail =
                      err && typeof err === "object" && "detail" in err
                        ? String((err as { detail?: string }).detail || "")
                        : ""
                    setToast(
                      detail.includes("rate_limit") || detail.includes("429")
                        ? t.voicePlay.translateBusy
                        : t.voicePlay.translateFailed,
                    )
                    playOriginal()
                  })
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
              onOpenHabits={openHabits}
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
            adviceLoading={adviceLoading}
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
            onPro={setPro}
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
                  setPro(result.isPro)
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
          isPro={isPro}
          newMessageCount={newMessageCount}
          onSelect={moveToPage}
        />
      </div>
    </main>
  )
}
