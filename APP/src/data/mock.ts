



const at = (daysAgo: number, time: string) => {
  const [hours, minutes] = time.split(":").map(Number)
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}


export type DeviceStatus = {
  
  paired: boolean
  connected: boolean
  batteryPercent: number
  
  pendingSyncCount: number
  
  name?: string
  deviceId?: string
}

export const deviceStatus: DeviceStatus = {
  paired: true,
  connected: true,
  batteryPercent: 82,
  pendingSyncCount: 0,
}


export const baseLightColors = ["blue", "white", "red"] as const


export const demoValues = {
  normalBatteryPercent: 82,
  lowBatteryPercent: 15,
  offlinePendingCount: 3,
}


export const lowBatteryPercent = 20

export type DrinkRecord = { id: string; time: string; amountMl: number }


const recentRecords: DrinkRecord[] = [
  { id: "r01", time: at(0, "16:25"), amountMl: 210 },
  { id: "r02", time: at(0, "14:10"), amountMl: 220 },
  { id: "r03", time: at(0, "13:00"), amountMl: 200 },
  { id: "r04", time: at(0, "11:35"), amountMl: 180 },
  { id: "r05", time: at(0, "09:20"), amountMl: 250 },
  { id: "r06", time: at(0, "07:45"), amountMl: 200 },
  { id: "r07", time: at(1, "20:30"), amountMl: 180 },
  { id: "r08", time: at(1, "18:10"), amountMl: 220 },
  { id: "r09", time: at(1, "15:40"), amountMl: 200 },
  { id: "r10", time: at(1, "12:15"), amountMl: 250 },
  { id: "r11", time: at(1, "09:50"), amountMl: 180 },
  { id: "r12", time: at(1, "07:30"), amountMl: 200 },
]




const earlierRecords: DrinkRecord[] = Array.from(
  { length: 40 },
  (_, index) => index + 2,
).flatMap((daysAgo) => {
  if (daysAgo % 11 === 5) return []
  const count = 6 + ((daysAgo * 7) % 5)
  return Array.from({ length: count }, (_, n) => ({
    id: `d${daysAgo}-${n}`,
    time: at(
      daysAgo,
      `${String(21 - Math.round((n * 14) / count)).padStart(2, "0")}:${n % 2 ? "30" : "10"}`,
    ),
    amountMl: 180 + ((daysAgo * 13 + n * 37) % 6) * 30,
  }))
})

export const drinkRecords: DrinkRecord[] = [...recentRecords, ...earlierRecords]

export type Brightness = "low" | "medium" | "high"

export type ReminderSettings = {
  dailyGoalMl: number
  times: string[]
  brightness: Brightness
}

export const initialReminderSettings: ReminderSettings = {
  dailyGoalMl: 2000,
  times: ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"],
  brightness: "medium",
}

export const goalLimits = { min: 500, max: 4000, step: 100 }

export const drinkAmountLimits = { min: 50, max: 4000, step: 10 }

export type FamilyMember = {
  id: string
  name?: string
  relation?: string
  color: string
}

export const initialLineConnected = true

export const initialIsPro = false

export type PremiumPlan = "monthly" | "yearly"
export const premiumPlans: PremiumPlan[] = ["monthly", "yearly"]

export const familyInviteLink = "https://example.com/suila/invite/demo"

export const freeFamilyLimit = 2

export const familyMembers: FamilyMember[] = [
  { id: "daughter", color: "coral" },
  { id: "son", color: "blue" },
]

export type VoiceMessage = {
  id: string
  from: string
  audioUrl?: string
  translatedAudioUrl?: string
  translatedText?: string
  translatedLang?: string
  time: string
  durationSec: number
  played: boolean
}

export const voiceMessages: VoiceMessage[] = [
  { id: "m1", from: "daughter", time: at(0, "12:40"), durationSec: 6, played: false },
  { id: "m2", from: "son", time: at(0, "09:05"), durationSec: 6, played: false },
  { id: "m3", from: "daughter", time: at(1, "19:20"), durationSec: 5, played: true },
]

export type ConditionId =
  | "hypertension"
  | "diabetes"
  | "heart"
  | "kidney"
  | "gout"
  | "stroke"
  | "liver"
  | "thyroid"
  | "pregnancy"
  | "none"
  | "other"

export const fluidSensitiveConditions: ConditionId[] = ["heart", "kidney"]

export const conditionOptions: ConditionId[] = [
  "hypertension",
  "diabetes",
  "heart",
  "kidney",
  "gout",
  "stroke",
  "liver",
  "thyroid",
  "pregnancy",
  "none",
  "other",
]

export const heightOptionsCm = Array.from({ length: 61 }, (_, i) => String(140 + i))
export const weightOptionsKg = Array.from({ length: 116 }, (_, i) => String(35 + i))

export const relationOptions = ["女兒", "兒子", "配偶", "孫子", "孫女", "親友", "照顧者"] as const

export type Profile = {
  name: string
  heightCm: string
  weightKg: string
  conditions: ConditionId[]
}

export const initialProfile = (name: string): Profile => ({
  name,
  heightCm: "162",
  weightKg: "58",
  conditions: ["hypertension"],
})

export type NightMute = {
  enabled: boolean
  start: string
  end: string
}

export const initialNightMute: NightMute = {
  enabled: true,
  start: "22:00",
  end: "07:00",
}
