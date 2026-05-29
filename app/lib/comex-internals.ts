// Pure parser helpers extracted from comex.ts for testability.
// These have no 'use server' directive and no DB/network dependencies.

export type ComexShipment = {
  embarqueNo: string
  extras: Record<string, string | null>
}

export function parseCSVRow(line: string): string[] {
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

export function buildCsvUrl(url: string, sheetName?: string): string {
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

export function splitCell(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(s => s.length > 0)
}

/**
 * For a single SO row, expand into N shipments using positional split.
 * - If `embarqueCol` has 2 values and any other column also has 2 values, they pair index-by-index.
 * - If another column has 1 value, it is replicated to all shipments.
 * - If lengths disagree (e.g. 2 vs 3), we use Math.min and record a warning.
 */
export function expandRowToShipments(
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

// ─── Date parsing & status (from embarques.ts) ───────────────────────────────

export function parseDateLoose(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const iso = new Date(raw)
  if (!isNaN(iso.getTime())) return iso
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    const dd = parseInt(m[1], 10)
    const mm = parseInt(m[2], 10) - 1   // 0-indexed
    let yyyy = parseInt(m[3], 10)
    if (yyyy < 100) yyyy += 2000
    // Guard against overflow (JS Date silently rolls over: new Date(2099, 98, 99) → 2107)
    if (dd < 1 || dd > 31 || mm < 0 || mm > 11) return null
    const d = new Date(yyyy, mm, dd)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

export type EmbarqueEstado = 'pendiente' | 'en-transito' | 'arribado' | 'desconocido'

export const ESTADO_PRIORITY: Record<EmbarqueEstado, number> = {
  desconocido:   0,
  pendiente:     1,
  'en-transito': 2,
  arribado:      3,
}

export function pickField(shipment: ComexShipment, candidates: string[]): string | null {
  for (const key of Object.keys(shipment.extras)) {
    const lower = key.toLowerCase()
    if (candidates.some(c => lower.includes(c))) {
      const v = shipment.extras[key]
      if (v) return v
    }
  }
  return null
}

/**
 * Detecta el tipo de transporte desde el prefijo del N° de Embarque.
 * - AIR: vuelos (típicamente "AIR 176", "AIR-001")
 * - FCL: barcos (Full Container Load, ej "FCL 2206")
 * - LCL: barco con consolidado (Less than Container Load)
 */
export type TipoTransporte = 'AIR' | 'FCL' | 'LCL' | 'unknown'

export function detectTipoTransporte(embarqueNo: string): TipoTransporte {
  const upper = embarqueNo.toUpperCase().trim()
  // Requerimos separador o final de palabra después del prefijo para no
  // matchear cosas como "AIRBUS" o "FCLOREST".
  if (/^AIR(?:[\s\-_]|$|\d)/.test(upper)) return 'AIR'
  if (/^FCL(?:[\s\-_]|$|\d)/.test(upper)) return 'FCL'
  if (/^LCL(?:[\s\-_]|$|\d)/.test(upper)) return 'LCL'
  return 'unknown'
}

/**
 * Threshold de SLA según tipo de transporte (en días, ETD → Arribo Depósito).
 */
export function slaThresholdDays(tipo: TipoTransporte): number {
  switch (tipo) {
    case 'AIR': return 30
    case 'FCL': return 65
    case 'LCL': return 65   // misma logística marítima
    case 'unknown': return 30   // default conservador
  }
}

export function deriveStatus(shipment: ComexShipment, now: Date = new Date()): EmbarqueEstado {
  // "Arribado" = fin de proceso = llegó al depósito final argentino.
  // NO se considera arribado al llegar al WH de HK / Airsea (esos son hitos
  // intermedios, el embarque sigue en tránsito hasta que pisa nuestro depósito).
  const arriboDeposito = parseDateLoose(pickField(shipment, ['deposito', 'depósito']))
  if (arriboDeposito) return 'arribado'
  const etd = parseDateLoose(pickField(shipment, ['etd']))
  if (!etd) return 'desconocido'
  return etd <= now ? 'en-transito' : 'pendiente'
}

// ─── Fuzzy matching for photo descriptions (from photo-actions.ts) ───────────

export function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3)
}

export function fuzzyScore(query: string, target: string): number {
  if (!query || !target) return 0
  const qt = tokens(query)
  const tt = tokens(target)
  if (qt.length === 0 || tt.length === 0) return 0
  let hits = 0
  for (const q of qt) if (tt.some(t => t.includes(q) || q.includes(t))) hits++
  return hits / qt.length
}
