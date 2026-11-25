import { BleClient } from "@capacitor-community/bluetooth-le"

const SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
const RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
const TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
const PROV_SECRET = "SuiLaProv2026"

export type FoundBase = { id: string; name: string }
export type WifiChoice = { ssid: string; rssi: number }

type Waiter = {
  match: (line: string) => boolean
  resolve: (line: string) => void
  timer: number
}

class LineBus {
  private lines: string[] = []
  private waiters: Waiter[] = []
  private buffer = ""

  pushBytes(text: string) {
    this.buffer += text
    while (true) {
      const cut = this.buffer.indexOf("\n")
      if (cut < 0) return
      const line = this.buffer.slice(0, cut).trim()
      this.buffer = this.buffer.slice(cut + 1)
      if (line) this.push(line)
    }
  }

  private push(line: string) {
    const waiter = this.waiters.find((item) => item.match(line))
    if (!waiter) {
      this.lines.push(line)
      return
    }
    window.clearTimeout(waiter.timer)
    this.waiters = this.waiters.filter((item) => item !== waiter)
    waiter.resolve(line)
  }

  wait(match: (line: string) => boolean, ms: number) {
    const index = this.lines.findIndex(match)
    if (index >= 0) {
      const [line] = this.lines.splice(index, 1)
      return Promise.resolve(line)
    }
    return new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.waiters = this.waiters.filter((item) => item.timer !== timer)
        reject(new Error("timeout"))
      }, ms)
      this.waiters.push({ match, resolve, timer })
    })
  }
}

let bleId = ""
let sessionKey: Uint8Array | null = null
let bus = new LineBus()

function copyBytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

function bytesToView(bytes: Uint8Array) {
  const copy = copyBytes(bytes)
  return new DataView(copy.buffer)
}

function viewToText(view: DataView) {
  return new TextDecoder().decode(
    new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
  )
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("")
}

function fromHex(value: string) {
  const out = new Uint8Array(value.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", copyBytes(bytes))
  return new Uint8Array(digest)
}

async function ensureBle() {
  await BleClient.initialize()
  if (await BleClient.isEnabled()) return
  await BleClient.requestEnable()
  if (!(await BleClient.isEnabled())) throw new Error("bluetooth-off")
}

async function writeLine(line: string) {
  const bytes = new TextEncoder().encode(`${line}\n`)
  await BleClient.write(bleId, SERVICE, RX, bytesToView(bytes))
}

export async function scanBases(ms = 8000): Promise<FoundBase[]> {
  await ensureBle()
  const found = new Map<string, FoundBase>()
  await BleClient.requestLEScan({ namePrefix: "SuiLa" }, (result) => {
    const name = result.localName || result.device.name || ""
    if (!name.startsWith("SuiLa")) return
    found.set(result.device.deviceId, { id: result.device.deviceId, name })
  })
  await new Promise((resolve) => window.setTimeout(resolve, ms))
  await BleClient.stopLEScan().catch(() => undefined)
  return [...found.values()]
}

export async function connectBase(base: FoundBase) {
  await endProvision()
  bus = new LineBus()
  bleId = base.id
  await BleClient.connect(base.id, () => {
    bleId = ""
    sessionKey = null
  })
  await BleClient.startNotifications(base.id, SERVICE, TX, (value) => {
    bus.pushBytes(viewToText(value))
  })
  await writeLine("HELLO")
  const hello = await bus.wait((line) => line.startsWith("HELLO|"), 10000)
  const parts = hello.split("|")
  const deviceId = parts[2] || ""
  const nonceHex = parts[3] || ""
  if (!deviceId || nonceHex.length !== 32) throw new Error("handshake")
  const secret = new TextEncoder().encode(PROV_SECRET)
  const idBytes = new TextEncoder().encode(deviceId)
  const nonce = fromHex(nonceHex)
  const material = new Uint8Array(secret.length + idBytes.length + nonce.length)
  material.set(secret, 0)
  material.set(idBytes, secret.length)
  material.set(nonce, secret.length + idBytes.length)
  sessionKey = (await sha256(material)).slice(0, 16)
  const authMaterial = new Uint8Array(4 + sessionKey.length)
  authMaterial.set(new TextEncoder().encode("AUTH"), 0)
  authMaterial.set(sessionKey, 4)
  const token = hex((await sha256(authMaterial)).slice(0, 8))
  await writeLine(`AUTH|${token}`)
  const auth = await bus.wait(
    (line) => line.startsWith("AUTH_OK") || line.startsWith("ERR|"),
    8000,
  )
  if (!auth.startsWith("AUTH_OK")) throw new Error("auth")
  return deviceId
}

export async function scanWifi(): Promise<WifiChoice[]> {
  await writeLine("SCAN")
  const line = await bus.wait(
    (item) => item.startsWith("LIST|") || item.startsWith("ERR|"),
    20000,
  )
  if (line.startsWith("ERR|")) throw new Error(line.slice(4))
  const choices: WifiChoice[] = []
  line.split("|").slice(2).forEach((chunk) => {
    const tab = chunk.indexOf("\t")
    if (tab <= 0) return
    choices.push({
      ssid: chunk.slice(0, tab),
      rssi: Number.parseInt(chunk.slice(tab + 1), 10) || 0,
    })
  })
  choices.sort((a, b) => b.rssi - a.rssi)
  return choices
}

export async function sendWifi(ssid: string, password: string) {
  if (!sessionKey) throw new Error("auth")
  const plain = new TextEncoder().encode(`${ssid}\n${password}`)
  const iv = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey("raw", copyBytes(sessionKey), "AES-CBC", false, [
    "encrypt",
  ])
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-CBC", iv: copyBytes(iv) }, key, copyBytes(plain)),
  )
  await writeLine(`CREDS|${hex(iv)}|${hex(cipher)}`)
  const result = await bus.wait(
    (line) => line.startsWith("WIFI_OK|") || line.startsWith("WIFI_FAIL|"),
    35000,
  )
  if (!result.startsWith("WIFI_OK|")) throw new Error("wifi")
  return result.slice("WIFI_OK|".length)
}

export async function endProvision() {
  const id = bleId
  bleId = ""
  sessionKey = null
  if (!id) return
  await BleClient.stopNotifications(id, SERVICE, TX).catch(() => undefined)
  await BleClient.disconnect(id).catch(() => undefined)
}
