
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const I18N = path.resolve(__dirname, "../src/i18n")
const BASELINE = path.join(I18N, ".source-hash.json")
const SOURCE = "zh-TW.ts"
const TARGETS = [
  {
    file: "en.ts",
    exportName: "en",
    lang: "en",
    label: "English",
    hint: "Natural product English. Keep brand name 水啦 and SuiLa as-is when they appear.",
  },
  {
    file: "nan-TW.ts",
    exportName: "nanTW",
    lang: "nan-TW",
    label: "臺灣閩南語（台語漢字口語）",
    hint: "Write in 台語漢字口語, same tone as the existing nan-TW file. Keep 水啦 / SuiLa.",
  },
]

const SKIP = new Set([
  "meta.htmlLang",
  "brand.latin",
  "brand.name",
  "my.proTag",
  "my.languageNames.zh-TW",
  "my.languageNames.en",
  "my.languageNames.nan-TW",
])

const dryRun = process.argv.includes("--dry-run")
const force = process.argv.includes("--force")

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
const TEXT_MODEL = "gemini-3.5-flash"

function hash(text) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 12)
}

function shouldSkip(keyPath) {
  if (SKIP.has(keyPath)) return true
  if (keyPath.endsWith(".speechLang")) return true
  return false
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE)) return {}
  try {
    return JSON.parse(fs.readFileSync(BASELINE, "utf8"))
  } catch {
    return {}
  }
}

function parseFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8")
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  return { text, sf }
}

function findExportObject(sf, exportName) {
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === exportName) {
        if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
          return decl.initializer
        }
      }
    }
  }
  throw new Error(`export const ${exportName} = {…} not found`)
}

function litText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return null
}

function extract(obj, sf, prefix = "", out = new Map()) {
  for (const prop of obj.properties) {
    if (ts.isShorthandPropertyAssignment(prop)) continue
    if (!ts.isPropertyAssignment(prop)) continue
    if (prop.name.kind !== ts.SyntaxKind.Identifier && prop.name.kind !== ts.SyntaxKind.StringLiteral) {
      continue
    }
    const name = ts.isIdentifier(prop.name) ? prop.name.text : prop.name.text
    const keyPath = prefix ? `${prefix}.${name}` : name
    if (shouldSkip(keyPath)) continue

    const init = prop.initializer
    if (!init) continue

    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
      out.set(keyPath, {
        kind: "string",
        source: init.text,
        start: init.getStart(sf),
        end: init.getEnd(),
        nameStart: prop.name.getStart(sf),
        propEnd: prop.getEnd(),
      })
      continue
    }

    if (ts.isArrayLiteralExpression(init)) {
      const items = []
      let ok = true
      for (const el of init.elements) {
        const t = litText(el)
        if (t === null) {
          ok = false
          break
        }
        items.push(t)
      }
      if (ok) {
        out.set(keyPath, {
          kind: "array",
          source: JSON.stringify(items),
          items,
          start: init.getStart(sf),
          end: init.getEnd(),
          nameStart: prop.name.getStart(sf),
          propEnd: prop.getEnd(),
        })
      }
      continue
    }

    if (ts.isArrowFunction(init)) {
      out.set(keyPath, {
        kind: "fn",
        source: init.getText(sf),
        start: init.getStart(sf),
        end: init.getEnd(),
        nameStart: prop.name.getStart(sf),
        propEnd: prop.getEnd(),
      })
      continue
    }

    if (ts.isObjectLiteralExpression(init)) {
      extract(init, sf, keyPath, out)
    }
  }
  return out
}

function findParentObject(root, keyPath) {
  const parts = keyPath.split(".")
  let node = root
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    const next = node.properties.find(
      (p) =>
        ts.isPropertyAssignment(p) &&
        ((ts.isIdentifier(p.name) && p.name.text === part) ||
          (ts.isStringLiteral(p.name) && p.name.text === part)),
    )
    if (!next || !ts.isObjectLiteralExpression(next.initializer)) return null
    node = next.initializer
  }
  return { parent: node, leaf: parts[parts.length - 1] }
}

function quote(str) {
  return JSON.stringify(str)
}

function formatArray(items) {
  const body = items.map((item) => `      ${quote(item)},`).join("\n")
  return `[\n${body}\n    ]`
}

function escapeTemplate(str) {
  return str.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")
}


function normalizeFn(translated, zhSource) {
  let text = String(translated || "").trim()
  if (!text) return zhSource
  
  if ((text.startsWith("`") && text.endsWith("`")) || (text.startsWith('"') && text.endsWith('"'))) {
    const params = zhSource.match(/^\([^)]*\)/)?.[0] ?? "()"
    if (text.startsWith('"')) {
      try {
        text = `\`${escapeTemplate(JSON.parse(text))}\``
      } catch {
        text = `\`${escapeTemplate(text.slice(1, -1))}\``
      }
    }
    return `${params} => ${text}`
  }
  return text.replace(/\n+/g, " ").trim()
}

async function geminiTranslate(batch, target) {
  const key = (process.env.GEMINI_API_KEY || "").trim()
  if (!key) throw new Error("GEMINI_API_KEY missing")

  const payload = {}
  for (const [pathKey, entry] of Object.entries(batch)) {
    payload[pathKey] = { kind: entry.kind, zh: entry.source }
  }

  const prompt =
    `You translate UI copy for the SuiLa (水啦) elderly water-reminder app.\n` +
    `Source language: Traditional Chinese (Taiwan).\n` +
    `Target: ${target.label} (${target.lang}).\n` +
    `${target.hint}\n` +
    `Rules:\n` +
    `- Return ONLY a JSON object: key path → translated value.\n` +
    `- For kind "string": value is a plain string.\n` +
    `- For kind "array": value is a JSON array of strings (same length).\n` +
    `- For kind "fn": value is a full arrow function like (name: string) => \`…\${name}\`. ` +
    `Keep every \${…} placeholder and parameter name exactly.\n` +
    `- Do not translate brand latin "SuiLa" or the characters 水啦 when used as the product name.\n` +
    `- Keep tone warm, short, and easy for older adults.\n\n` +
    `INPUT:\n${JSON.stringify(payload, null, 2)}`

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
  }

  const tryModel = async (model) => {
    const resp = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      const err = await resp.text()
      throw new Error(`${model} ${resp.status}: ${err.slice(0, 200)}`)
    }
    const data = await resp.json()
    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || "")
      .join("\n")
      .trim()
    const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
    return JSON.parse(jsonText)
  }

  try {
    return await tryModel(TEXT_MODEL)
  } catch (err) {
    console.warn(`  retry with preview model (${err.message})`)
    return await tryModel("gemini-3-flash-preview")
  }
}

function chunk(entries, size) {
  const out = []
  for (let i = 0; i < entries.length; i += size) out.push(entries.slice(i, i + size))
  return out
}

function applyPatches(fileText, patches) {
  const ordered = [...patches].sort((a, b) => b.start - a.start)
  let text = fileText
  for (const patch of ordered) {
    text = text.slice(0, patch.start) + patch.value + text.slice(patch.end)
  }
  return text
}

function insertProperty(fileText, parentObj, sf, leafName, rendered) {
  const last = parentObj.properties[parentObj.properties.length - 1]
  const insertAt = last ? last.getEnd() : parentObj.getStart(sf) + 1
  const indent = "    "
  const needsComma = last && fileText[last.getEnd()] !== ","
  const prefix = needsComma ? "," : ""
  const snippet = `${prefix}\n${indent}${leafName}: ${rendered}`
  return {
    text: fileText.slice(0, insertAt) + snippet + fileText.slice(insertAt),
  }
}

async function syncTarget(target, zhMap, baseline, dirtyPaths) {
  const filePath = path.join(I18N, target.file)
  let { text, sf } = parseFile(filePath)
  let root = findExportObject(sf, target.exportName)
  let targetMap = extract(root, sf)

  const need = []
  for (const keyPath of dirtyPaths) {
    if (zhMap.has(keyPath) && !need.includes(keyPath)) need.push(keyPath)
  }
  for (const keyPath of zhMap.keys()) {
    if (!targetMap.has(keyPath) && !need.includes(keyPath)) need.push(keyPath)
  }

  if (need.length === 0) {
    console.log(`· ${target.file}: up to date`)
    return 0
  }

  console.log(`· ${target.file}: ${need.length} key(s)`)
  const translations = {}
  for (const group of chunk(need, 40)) {
    const batch = {}
    for (const keyPath of group) batch[keyPath] = zhMap.get(keyPath)
    if (dryRun) {
      for (const keyPath of group) translations[keyPath] = `[dry-run] ${zhMap.get(keyPath).source}`
      continue
    }
    const result = await geminiTranslate(batch, target)
    Object.assign(translations, result)
  }

  if (dryRun) {
    for (const keyPath of need) {
      console.log(`  ~ ${keyPath}`)
    }
    return need.length
  }

  const replacePatches = []
  const missing = []

  ;({ text, sf } = parseFile(filePath))
  root = findExportObject(sf, target.exportName)
  targetMap = extract(root, sf)

  for (const keyPath of need) {
    const zh = zhMap.get(keyPath)
    const translated = translations[keyPath]
    if (translated == null) {
      console.warn(`  ! no translation for ${keyPath}`)
      continue
    }
    const existing = targetMap.get(keyPath)
    let rendered
    if (zh.kind === "string") {
      rendered = quote(typeof translated === "string" ? translated : String(translated))
    } else if (zh.kind === "array") {
      const items = Array.isArray(translated) ? translated.map(String) : zh.items
      rendered = formatArray(items)
    } else {
      rendered = normalizeFn(translated, zh.source)
    }

    if (existing) {
      replacePatches.push({ start: existing.start, end: existing.end, value: rendered })
    } else {
      missing.push({ keyPath, rendered })
    }
  }

  text = applyPatches(text, replacePatches)
  fs.writeFileSync(filePath, text)

  for (const { keyPath, rendered } of missing) {
    ;({ text, sf } = parseFile(filePath))
    root = findExportObject(sf, target.exportName)
    const found = findParentObject(root, keyPath)
    if (!found) {
      console.warn(`  ! cannot insert ${keyPath} (missing parent)`)
      continue
    }
    const again = extract(root, sf)
    if (again.has(keyPath)) continue
    const { text: next } = insertProperty(text, found.parent, sf, found.leaf, rendered)
    fs.writeFileSync(filePath, next)
    console.log(`  + ${keyPath}`)
  }

  for (const keyPath of need) {
    if (targetMap.has(keyPath) || missing.some((m) => m.keyPath === keyPath)) {
      console.log(`  ✓ ${keyPath}`)
    }
  }
  return need.length
}

async function main() {
  const zhPath = path.join(I18N, SOURCE)
  const { sf } = parseFile(zhPath)
  const zhRoot = findExportObject(sf, "zhTW")
  const zhMap = extract(zhRoot, sf)
  const baseline = loadBaseline()

  const firstRun = Object.keys(baseline).length === 0 && !force
  const dirty = []
  for (const [keyPath, entry] of zhMap) {
    const h = hash(entry.source)
    if (force || (!firstRun && (!baseline[keyPath] || baseline[keyPath] !== h))) {
      dirty.push(keyPath)
    }
  }

  console.log(`Source: ${SOURCE} (${zhMap.size} keys)`)
  if (firstRun) {
    console.log("First run: seed baseline; only fill missing keys in en / nan-TW")
  } else {
    console.log(`Changed/new vs baseline: ${dirty.length}${force ? " (force)" : ""}`)
  }
  if (dryRun) console.log("Dry run — no files written\n")

  let total = 0
  for (const target of TARGETS) {
    total += await syncTarget(target, zhMap, baseline, dirty)
  }

  if (!dryRun) {
    const next = {}
    for (const [keyPath, entry] of zhMap) next[keyPath] = hash(entry.source)
    fs.writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`)
    console.log(`\nBaseline updated: ${path.relative(process.cwd(), BASELINE)}`)
  }

  console.log(`Done. ${total} update(s).`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
