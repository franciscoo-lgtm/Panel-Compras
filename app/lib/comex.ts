'use server'

import { prisma } from '@/lib/prisma'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComexConfig = {
  url: string
  sheetName?: string
  joinCol: string
  embarqueCol: string
  extraCols: { header: string; label: string }[]
}

export type ComexShipment = {
  embarqueNo: string
  extras: Record<string, string | null>
}

export type ComexSORow = {
  so: string
  shipments: ComexShipment[]
}

export type ComexData = {
  bySO: Map<string, ComexSORow>
  byEmbarque: Map<string, Set<string>>
  extraColumns: { fieldKey: string; label: string }[]
  fetchedAt: Date
  errors: string[]
}

const CONFIG_KEY = 'COMEX_CONFIG'
const LEGACY_KEY = 'COMEX_SOURCES'

// ─── Config persistence ───────────────────────────────────────────────────────

export async function getComexConfig(): Promise<ComexConfig | null> {
  const cfg = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEY } })
  if (cfg) {
    try { return JSON.parse(cfg.value) as ComexConfig } catch { return null }
  }
  const legacy = await prisma.appConfig.findUnique({ where: { key: LEGACY_KEY } })
  if (!legacy) return null
  try {
    const sources = JSON.parse(legacy.value) as Array<{
      url: string; sheetName?: string; enabled: boolean
      joinOn?: string; mappings: { sheetHeader: string; fieldKey: string; label: string; isJoin: boolean }[]
    }>
    const first = sources.find(s => s.enabled && (s.joinOn ?? 'so') === 'so')
    if (!first) return null
    const joinMap = first.mappings.find(m => m.isJoin)
    if (!joinMap) return null
    const embarqueMap = first.mappings.find(m => m.fieldKey === 'embarqueNo' || m.label.toLowerCase().includes('embarque'))
    return {
      url: first.url,
      sheetName: first.sheetName,
      joinCol: joinMap.sheetHeader,
      embarqueCol: embarqueMap?.sheetHeader ?? 'N° Embarque',
      extraCols: first.mappings
        .filter(m => !m.isJoin && m !== embarqueMap)
        .map(m => ({ header: m.sheetHeader, label: m.label })),
    }
  } catch {
    return null
  }
}

export async function saveComexConfig(cfg: ComexConfig): Promise<void> {
  await prisma.appConfig.upsert({
    where:  { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: JSON.stringify(cfg) },
    update: { value: JSON.stringify(cfg) },
  })
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

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

function buildCsvUrl(url: string, sheetName?: string): string {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!idMatch) return url
  const id = idMatch[1]
  if (sheetName?.trim()) {
    return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName.trim())}`
  }
  const gidMatch = url.match(/[?&#]gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
}

// ─── Split-aware row parser ───────────────────────────────────────────────────

function splitCell(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(s => s.length > 0)
}

function expandRowToShipments(
  embarqueRaw: string,
  extras: { fieldKey: string; raw: string }[],
  errors: string[],
  rowLabel: string,
): ComexShipment[] {
  const embarques = splitCell(embarqueRaw)
  if (embarques.length === 0) return []

  const extraSplits = extras.map(e => ({ fieldKey: e.fieldKey, parts: splitCell(e.raw) }))

  return embarques.map((embarqueNo, idx) => {
    const slice: Record<string, string | null> = {}
    for (const e of extraSplits) {
      if (e.parts.length === 0) {
        slice[e.fieldKey] = null
      } else if (e.parts.length === 1) {
        slice[e.fieldKey] = e.parts[0]
      } else if (idx < e.parts.length) {
        slice[e.fieldKey] = e.parts[idx]
      } else {
        slice[e.fieldKey] = e.parts[e.parts.length - 1]
        errors.push(`Fila ${rowLabel}: columna "${e.fieldKey}" tiene menos splits que N° Embarque`)
      }
    }
    return { embarqueNo, extras: slice }
  })
}

// ─── Public: fetch live data ──────────────────────────────────────────────────

export async function fetchComexData(): Promise<ComexData> {
  const empty: ComexData = {
    bySO: new Map(),
    byEmbarque: new Map(),
    extraColumns: [],
    fetchedAt: new Date(),
    errors: [],
  }

  const cfg = await getComexConfig()
  if (!cfg) {
    empty.errors.push('Sin configuración de planilla Comex')
    return empty
  }

  try {
    const csvUrl = buildCsvUrl(cfg.url, cfg.sheetName)
    const res = await fetch(csvUrl, { cache: 'no-store' })
    if (!res.ok) {
      empty.errors.push(`HTTP ${res.status} al leer la planilla`)
      return empty
    }
    const text = await res.text()
    const lines = text.split('\n')
    const headers = parseCSVRow(lines[0] ?? '').map(h => h.trim())

    const joinIdx = headers.findIndex(h => h.toLowerCase() === cfg.joinCol.toLowerCase())
    if (joinIdx < 0) {
      empty.errors.push(`Columna "${cfg.joinCol}" no encontrada en la planilla`)
      return empty
    }

    const embarqueIdx = headers.findIndex(h => h.toLowerCase() === cfg.embarqueCol.toLowerCase())
    if (embarqueIdx < 0) {
      empty.errors.push(`Columna "${cfg.embarqueCol}" no encontrada en la planilla`)
      return empty
    }

    const extraCols = cfg.extraCols
      .map(c => ({
        fieldKey: c.header,
        label: c.label,
        colIdx: headers.findIndex(h => h.toLowerCase() === c.header.toLowerCase()),
      }))
      .filter(c => c.colIdx >= 0)

    const bySO = new Map<string, ComexSORow>()
    const byEmbarque = new Map<string, Set<string>>()
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line?.trim()) continue
      const cols = parseCSVRow(line)
      const so = (cols[joinIdx] ?? '').trim().toUpperCase()
      if (!so) continue

      const shipments = expandRowToShipments(
        cols[embarqueIdx] ?? '',
        extraCols.map(e => ({ fieldKey: e.fieldKey, raw: cols[e.colIdx] ?? '' })),
        errors,
        `SO ${so}`,
      )
      if (shipments.length === 0) continue

      bySO.set(so, { so, shipments })
      for (const ship of shipments) {
        const emb = ship.embarqueNo.toUpperCase()
        if (!byEmbarque.has(emb)) byEmbarque.set(emb, new Set())
        byEmbarque.get(emb)!.add(so)
      }
    }

    return {
      bySO,
      byEmbarque,
      extraColumns: extraCols.map(c => ({ fieldKey: c.fieldKey, label: c.label })),
      fetchedAt: new Date(),
      errors,
    }
  } catch (err) {
    empty.errors.push(`Excepción: ${err instanceof Error ? err.message : String(err)}`)
    return empty
  }
}
