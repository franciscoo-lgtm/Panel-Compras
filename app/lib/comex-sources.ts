'use server'

import { prisma } from '@/lib/prisma'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ColumnMapping = {
  sheetHeader: string  // exact header in the sheet
  fieldKey: string     // known CIPLItem field OR 'extra_<slug>'
  label: string        // display label in table
  isJoin: boolean      // true = this column contains the SO number (join key)
}

export type PanelId = 'panel-general' | 'comex'

export type ComexSource = {
  id: string
  name: string
  url: string           // full browser URL
  sheetName?: string    // exact tab name within the spreadsheet
  enabled: boolean
  panels: PanelId[]     // which panels show this source's columns
  mappings: ColumnMapping[]
}

export type ExtraColumn = {
  fieldKey: string
  label: string
}

const CONFIG_KEY = 'COMEX_SOURCES'

// ─── Persistence ───────────────────────────────────────────────────────────────

export async function getComexSources(): Promise<ComexSource[]> {
  try {
    const cfg = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEY } })
    if (!cfg) return []
    return JSON.parse(cfg.value) as ComexSource[]
  } catch {
    return []
  }
}

export async function saveAllSources(sources: ComexSource[]): Promise<void> {
  await prisma.appConfig.upsert({
    where:  { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: JSON.stringify(sources) },
    update: { value: JSON.stringify(sources) },
  })
}

// ─── Server actions (called from client) ──────────────────────────────────────

export async function upsertComexSource(
  source: ComexSource,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const sources = await getComexSources()
    const idx = sources.findIndex(s => s.id === source.id)
    if (idx >= 0) sources[idx] = source
    else sources.push(source)
    await saveAllSources(sources)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function toggleComexSource(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const sources = await getComexSources()
    const src = sources.find(s => s.id === id)
    if (src) src.enabled = !src.enabled
    await saveAllSources(sources)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function deleteComexSource(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const sources = await getComexSources()
    await saveAllSources(sources.filter(s => s.id !== id))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// ─── CSV helpers ───────────────────────────────────────────────────────────────

function parseCSVRow(line: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQ = false
  for (const c of line) {
    if (c === '"') { inQ = !inQ }
    else if (c === ',' && !inQ) { cols.push(cur.trim().replace(/^"|"$/g, '')); cur = '' }
    else cur += c
  }
  cols.push(cur.trim().replace(/^"|"$/g, ''))
  return cols
}

// Build a CSV export URL from a browser URL, optionally targeting a named sheet tab
function buildCsvUrl(url: string, sheetName?: string): string {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!idMatch) return url  // assume already a direct CSV URL
  const spreadsheetId = idMatch[1]
  if (sheetName?.trim()) {
    // gviz API supports sheet name lookup reliably
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName.trim())}`
  }
  const gidMatch = url.match(/[?&#]gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`
}

// ─── Preview: returns column headers for the config UI ────────────────────────

export async function previewSheetColumns(
  url: string,
  sheetName?: string,
): Promise<{ ok: true; headers: string[]; csvUrl: string } | { ok: false; error: string }> {
  try {
    const csvUrl = buildCsvUrl(url, sheetName)
    const res = await fetch(csvUrl, { cache: 'no-store' })
    if (!res.ok) return { ok: false, error: `Error ${res.status} al obtener la planilla. ¿Es pública?` }
    const text = await res.text()
    const firstLine = text.split('\n')[0] ?? ''
    const headers = parseCSVRow(firstLine).filter(h => h.length > 0)
    if (!headers.length) return { ok: false, error: 'La planilla parece estar vacía o sin encabezados' }
    return { ok: true, headers, csvUrl }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// ─── Runtime: fetch live data from all enabled sources ─────────────────────────

export type LiveDataMap = Record<string, Record<string, string>>
// SO_upper → { fieldKey → rawString }

async function fetchOneSource(source: ComexSource): Promise<LiveDataMap> {
  const result: LiveDataMap = {}
  try {
    const csvUrl = buildCsvUrl(source.url, source.sheetName)
    const res = await fetch(csvUrl, { cache: 'no-store' })
    if (!res.ok) return result

    const text = await res.text()
    const lines = text.split('\n')
    const rawHeaders = parseCSVRow(lines[0] ?? '')
    const headers = rawHeaders.map(h => h.trim().toLowerCase())

    const joinMapping = source.mappings.find(m => m.isJoin)
    if (!joinMapping) return result

    const joinIdx = headers.findIndex(h => h === joinMapping.sheetHeader.toLowerCase())
    if (joinIdx < 0) return result

    // Map each non-join mapping to its column index
    const colIdxMap: Array<{ fieldKey: string; colIdx: number }> = []
    for (const m of source.mappings) {
      if (m.isJoin) continue
      const idx = headers.findIndex(h => h === m.sheetHeader.toLowerCase())
      if (idx >= 0) colIdxMap.push({ fieldKey: m.fieldKey, colIdx: idx })
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line?.trim()) continue
      const cols = parseCSVRow(line)
      const so = (cols[joinIdx] ?? '').trim().toUpperCase()
      if (!so) continue
      if (!result[so]) result[so] = {}
      for (const { fieldKey, colIdx } of colIdxMap) {
        const val = (cols[colIdx] ?? '').trim()
        if (val) result[so]![fieldKey] = val
      }
    }
  } catch (err) {
    console.error(`[comex-sources] Error fetching "${source.name}":`, err)
  }
  return result
}

export async function fetchAllSourcesData(sources: ComexSource[]): Promise<{
  liveData: LiveDataMap
  extraColumns: ExtraColumn[]
}> {
  const enabled = sources.filter(s => s.enabled)
  const results = await Promise.all(enabled.map(fetchOneSource))

  const liveData: LiveDataMap = {}
  for (const map of results) {
    for (const [so, fields] of Object.entries(map)) {
      liveData[so] = { ...(liveData[so] ?? {}), ...fields }
    }
  }

  const seenKeys = new Set<string>()
  const extraColumns: ExtraColumn[] = []
  for (const source of enabled) {
    for (const m of source.mappings) {
      if (m.isJoin) continue
      if (m.fieldKey.startsWith('extra_') && !seenKeys.has(m.fieldKey)) {
        seenKeys.add(m.fieldKey)
        extraColumns.push({ fieldKey: m.fieldKey, label: m.label })
      }
    }
  }

  return { liveData, extraColumns }
}
