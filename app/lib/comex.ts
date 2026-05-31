'use server'

import { cache as reactCache } from 'react'
import { prisma } from '@/lib/prisma'
import { parseCSVRow as parsePure, buildCsvUrl as buildUrlPure, expandRowToShipments } from '@/app/lib/comex-internals'
import { cachedFetchText } from '@/app/lib/csv-cache'
import type { MilestoneField } from '@/app/lib/milestone-catalog'

// ─── Tipos públicos ──────────────────────────────────────────────────────────

/**
 * Una columna de una fuente mapeada a un campo del sistema.
 * - `field` puede ser un MilestoneField conocido o "extra_<slug>" para campos libres.
 */
export type ComexMapping = {
  header: string
  field: MilestoneField | `extra_${string}`
  label: string
}

/**
 * Una fuente individual: una Google Sheet + cómo leerla.
 */
export type ComexSource = {
  id: string
  name: string
  enabled: boolean
  url: string
  sheetName?: string
  joinCol: string
  mappings: ComexMapping[]
}

/**
 * Config completa: lista de fuentes + cuál es la principal (la que tiene N° Embarque).
 */
export type ComexConfig = {
  sources: ComexSource[]
  primarySourceId: string | null
}

// Re-exporto los tipos del data fetch
export type { ComexShipment, ComexSORow, ComexData } from '@/app/lib/comex-data-types'
import type { ComexShipment, ComexSORow, ComexData } from '@/app/lib/comex-data-types'

const CONFIG_KEY = 'COMEX_CONFIG'
const LEGACY_KEY = 'COMEX_SOURCES'

// ─── Config persistence ──────────────────────────────────────────────────────

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Migra config single-source vieja al nuevo formato multi-source.
 * El objeto viejo tenía: { url, sheetName, joinCol, embarqueCol, extraCols[] }
 */
type LegacySingleSource = {
  url: string
  sheetName?: string
  joinCol: string
  embarqueCol: string
  extraCols: { header: string; label: string }[]
}

function migrateLegacySingle(legacy: LegacySingleSource): ComexConfig {
  const sourceId = genId()
  const mappings: ComexMapping[] = [
    { header: legacy.embarqueCol, field: 'embarqueNo', label: 'N° Embarque' },
    ...legacy.extraCols.map(c => {
      const lower = c.header.toLowerCase()
      let field: ComexMapping['field']
      if (lower.includes('etd'))    field = 'etd'
      else if (lower.includes('eta'))    field = 'eta'
      else if (lower.includes('awb'))    field = 'awb'
      else if (lower.includes('arribo')) field = 'arriboWh'
      else field = `extra_${c.header.toLowerCase().replace(/[^a-z0-9]+/g, '_')}` as ComexMapping['field']
      return { header: c.header, field, label: c.label }
    }),
  ]
  return {
    sources: [{
      id: sourceId,
      name: 'Planilla principal',
      enabled: true,
      url: legacy.url,
      sheetName: legacy.sheetName,
      joinCol: legacy.joinCol,
      mappings,
    }],
    primarySourceId: sourceId,
  }
}

export async function getComexConfig(): Promise<ComexConfig | null> {
  const cfg = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEY } })
  if (cfg) {
    try {
      const parsed = JSON.parse(cfg.value)
      // Detectar formato: si tiene 'sources' es nuevo, si tiene 'url' es viejo single
      if (parsed && Array.isArray(parsed.sources)) return parsed as ComexConfig
      if (parsed && typeof parsed.url === 'string') return migrateLegacySingle(parsed as LegacySingleSource)
      return null
    } catch { return null }
  }
  // Fallback al legacy COMEX_SOURCES (multi-source con shape distinta)
  const legacy = await prisma.appConfig.findUnique({ where: { key: LEGACY_KEY } })
  if (!legacy) return null
  try {
    const sources = JSON.parse(legacy.value) as Array<{
      url: string; sheetName?: string; enabled: boolean
      joinOn?: string
      mappings: { sheetHeader: string; fieldKey: string; label: string; isJoin: boolean }[]
    }>
    const first = sources.find(s => s.enabled && (s.joinOn ?? 'so') === 'so')
    if (!first) return null
    const joinMap = first.mappings.find(m => m.isJoin)
    if (!joinMap) return null
    const embarqueMap = first.mappings.find(m => m.fieldKey === 'embarqueNo' || m.label.toLowerCase().includes('embarque'))
    return migrateLegacySingle({
      url: first.url,
      sheetName: first.sheetName,
      joinCol: joinMap.sheetHeader,
      embarqueCol: embarqueMap?.sheetHeader ?? 'N° Embarque',
      extraCols: first.mappings
        .filter(m => !m.isJoin && m !== embarqueMap)
        .map(m => ({ header: m.sheetHeader, label: m.label })),
    })
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

export async function clearComexConfig(): Promise<void> {
  await prisma.appConfig.deleteMany({
    where: { key: { in: [CONFIG_KEY, LEGACY_KEY] } },
  })
}

export async function newEmptySource(name: string = 'Nueva fuente'): Promise<ComexSource> {
  return {
    id: genId(),
    name,
    enabled: true,
    url: '',
    sheetName: '',
    joinCol: '',
    mappings: [],
  }
}

// ─── Preview de columnas para la UI de Configuración ─────────────────────────

export async function previewSheetHeaders(
  url: string,
  sheetName?: string,
): Promise<{ ok: true; headers: string[] } | { ok: false; error: string }> {
  if (!url.trim()) return { ok: false, error: 'URL vacía' }
  try {
    const csvUrl = buildUrlPure(url, sheetName)
    // No cacheamos esta — el preview se usa para verificar cambios manuales
    // en la sheet, queremos data fresca.
    const res = await fetch(csvUrl, { cache: 'no-store' })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} al leer la planilla` }
    const text = await res.text()
    const firstLine = text.replace(/\r\n/g, '\n').split('\n')[0] ?? ''
    const headers = parsePure(firstLine).map(h => h.trim()).filter(h => h.length > 0)
    if (headers.length === 0) return { ok: false, error: 'Sin headers detectados' }
    return { ok: true, headers }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Fetch de una fuente individual ──────────────────────────────────────────

type SourceResult = {
  sourceId: string
  sourceName: string
  bySO: Map<string, { so: string; shipments: ComexShipment[] }>
  byEmbarque: Map<string, Set<string>>
  fields: { field: string; label: string }[]
  errors: string[]
}

async function fetchOneSource(source: ComexSource, isPrimary: boolean): Promise<SourceResult> {
  const result: SourceResult = {
    sourceId: source.id,
    sourceName: source.name,
    bySO: new Map(),
    byEmbarque: new Map(),
    fields: [],
    errors: [],
  }

  if (!source.enabled) return result
  if (!source.url.trim() || !source.joinCol) {
    result.errors.push(`Fuente "${source.name}": falta URL o columna SO`)
    return result
  }

  try {
    const csvUrl = buildUrlPure(source.url, source.sheetName)
    let text: string
    try {
      text = await cachedFetchText(csvUrl, { key: `comex:${source.id}` })
    } catch (err) {
      result.errors.push(`Fuente "${source.name}": ${err instanceof Error ? err.message : String(err)}`)
      return result
    }
    const lines = text.replace(/\r\n/g, '\n').split('\n')
    const headers = parsePure(lines[0] ?? '').map(h => h.trim())

    const joinIdx = headers.findIndex(h => h.toLowerCase() === source.joinCol.toLowerCase())
    if (joinIdx < 0) {
      result.errors.push(`Fuente "${source.name}": columna SO "${source.joinCol}" no encontrada`)
      return result
    }

    // El campo `embarqueNo` solo se respeta de la fuente PRIMARY
    const embarqueMapping = source.mappings.find(m => m.field === 'embarqueNo')
    const embarqueIdx = isPrimary && embarqueMapping
      ? headers.findIndex(h => h.toLowerCase() === embarqueMapping.header.toLowerCase())
      : -1

    if (isPrimary && embarqueMapping && embarqueIdx < 0) {
      result.errors.push(`Fuente principal "${source.name}": columna N° Embarque "${embarqueMapping.header}" no encontrada`)
      return result
    }

    // Mappings no-embarqueNo: extras
    const extras: { field: string; label: string; colIdx: number }[] = []
    for (const m of source.mappings) {
      if (m.field === 'embarqueNo') continue
      const colIdx = headers.findIndex(h => h.toLowerCase() === m.header.toLowerCase())
      if (colIdx < 0) {
        result.errors.push(`Fuente "${source.name}": columna "${m.header}" mapeada a ${m.field} no encontrada`)
        continue
      }
      extras.push({ field: m.field, label: m.label, colIdx })
    }
    result.fields = extras.map(e => ({ field: e.field, label: e.label }))

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line?.trim()) continue
      const cols = parsePure(line)
      const so = (cols[joinIdx] ?? '').trim().toUpperCase()
      if (!so) continue

      // Sin embarque (fuentes secundarias): un único "shipment" sin embarqueNo
      // que mergeará por SO con la fuente primary
      if (!isPrimary || embarqueIdx < 0) {
        const extrasData: Record<string, string | null> = {}
        for (const e of extras) {
          const v = (cols[e.colIdx] ?? '').trim()
          extrasData[e.field] = v || null
        }
        const shipments: ComexShipment[] = [{ embarqueNo: '', extras: extrasData }]
        const existing = result.bySO.get(so)
        if (existing) {
          result.bySO.set(so, { so, shipments: [...existing.shipments, ...shipments] })
        } else {
          result.bySO.set(so, { so, shipments })
        }
        continue
      }

      // Primary: parseamos N° Embarque con split logic
      const shipments = expandRowToShipments(
        cols[embarqueIdx] ?? '',
        extras.map(e => ({ fieldKey: e.field, raw: cols[e.colIdx] ?? '' })),
        result.errors,
        `SO ${so} en fuente "${source.name}"`,
      )
      if (shipments.length === 0) continue

      const existing = result.bySO.get(so)
      if (existing) {
        result.bySO.set(so, { so, shipments: [...existing.shipments, ...shipments] })
      } else {
        result.bySO.set(so, { so, shipments })
      }
      for (const ship of shipments) {
        const emb = ship.embarqueNo.toUpperCase()
        if (!emb) continue
        if (!result.byEmbarque.has(emb)) result.byEmbarque.set(emb, new Set())
        result.byEmbarque.get(emb)!.add(so)
      }
    }
  } catch (err) {
    result.errors.push(`Fuente "${source.name}": ${err instanceof Error ? err.message : String(err)}`)
  }

  return result
}

// ─── Public: fetch live data (mergea todas las fuentes) ──────────────────────
// El export usa React.cache para dedupear llamadas dentro de la misma
// request (ej: home page hace listEmbarques + getExecutiveKPIs, ambos
// invocan fetchComexData → con cache, el segundo reusa el primero).

export const fetchComexData = reactCache(_fetchComexDataInner)

async function _fetchComexDataInner(): Promise<ComexData> {
  const empty: ComexData = {
    bySO: new Map(),
    byEmbarque: new Map(),
    extraColumns: [],
    fetchedAt: new Date(),
    errors: [],
  }

  const cfg = await getComexConfig()
  if (!cfg || cfg.sources.length === 0) {
    empty.errors.push('Sin fuentes de Comex configuradas')
    return empty
  }

  const enabledSources = cfg.sources.filter(s => s.enabled)
  if (enabledSources.length === 0) {
    empty.errors.push('No hay fuentes habilitadas')
    return empty
  }

  const primaryId = cfg.primarySourceId
  if (!primaryId || !enabledSources.find(s => s.id === primaryId)) {
    empty.errors.push('No hay fuente principal configurada (la que tiene N° Embarque)')
    return empty
  }

  // Fetch en paralelo
  const results = await Promise.all(
    enabledSources.map(s => fetchOneSource(s, s.id === primaryId)),
  )

  // Merge: cada SO acumula extras de todas las fuentes
  const bySO = new Map<string, ComexSORow>()
  const byEmbarque = new Map<string, Set<string>>()
  const errors: string[] = []
  const fieldsSeen = new Map<string, string>()  // field → label

  for (const res of results) {
    for (const err of res.errors) errors.push(err)
    for (const f of res.fields) {
      if (!fieldsSeen.has(f.field)) fieldsSeen.set(f.field, f.label)
    }
  }

  // Primero: armar desde la primary source (tiene los shipments con embarqueNo)
  const primaryResult = results.find(r => r.sourceId === primaryId)
  if (primaryResult) {
    for (const [so, row] of primaryResult.bySO) {
      bySO.set(so, { so, shipments: row.shipments.map(s => ({ ...s, extras: { ...s.extras } })) })
    }
    for (const [emb, sos] of primaryResult.byEmbarque) {
      byEmbarque.set(emb, new Set(sos))
    }
  }

  // Después: mergear las secundarias en los shipments existentes (sumando sus extras)
  for (const res of results) {
    if (res.sourceId === primaryId) continue
    for (const [so, row] of res.bySO) {
      const existing = bySO.get(so)
      if (!existing) {
        // SO sin embarque conocido (no aparece en primary): la guardamos igual con embarqueNo vacío
        bySO.set(so, { so, shipments: row.shipments.map(s => ({ ...s, extras: { ...s.extras } })) })
        continue
      }
      // Mergeamos: las extras de la secundaria se aplican a TODOS los shipments del SO
      // (la secundaria no distingue embarques, solo da info por SO)
      const secondaryExtras = row.shipments[0]?.extras ?? {}
      existing.shipments = existing.shipments.map(ship => ({
        ...ship,
        extras: { ...secondaryExtras, ...ship.extras },  // primary tiene prioridad si overlap
      }))
    }
  }

  const extraColumns = Array.from(fieldsSeen.entries()).map(([fieldKey, label]) => ({ fieldKey, label }))

  return {
    bySO,
    byEmbarque,
    extraColumns,
    fetchedAt: new Date(),
    errors,
  }
}
