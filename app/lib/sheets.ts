'use server'

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1JT0EjHrEUIGhm4RBSVQq2sntS6naiQ30b7u63gnMaZI/export?format=csv&gid=1292277028'

const SO_PATTERN = /^SO[-\s]?\d+/i

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

// ─── Number / date parsing ─────────────────────────────────────────────────────

// Handles Argentine mixed format: "5.650,00" → 5650; "$5,650" → 5650; "5,65" → 5.65
function parseArgNumber(raw: string): number | null {
  if (!raw) return null
  const v = raw.replace(/[^0-9.,]/g, '').trim()
  if (!v) return null

  const hasDot   = v.includes('.')
  const hasComma = v.includes(',')

  let normalized: string
  if (hasDot && hasComma) {
    // Argentine format: "5.650,00" → remove dots, comma becomes decimal
    normalized = v.replace(/\./g, '').replace(',', '.')
  } else if (hasComma && !hasDot) {
    // Comma is thousands if exactly 3 digits follow it, else decimal
    const afterComma = v.split(',')[1] ?? ''
    normalized = afterComma.length === 3
      ? v.replace(/,/g, '')
      : v.replace(',', '.')
  } else {
    normalized = v
  }

  const num = parseFloat(normalized)
  return isNaN(num) ? null : num
}

// Parses D/M/YYYY (Argentine sheet date format)
function parseDMY(raw: string): Date | null {
  if (!raw) return null
  const parts = raw.trim().split('/')
  if (parts.length !== 3) return null
  const d = parseInt(parts[0]!, 10)
  const m = parseInt(parts[1]!, 10)
  const y = parseInt(parts[2]!, 10)
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null
  const date = new Date(y, m - 1, d)
  return isNaN(date.getTime()) ? null : date
}

// ─── SO list ───────────────────────────────────────────────────────────────────

export async function fetchSalesOrders(): Promise<string[]> {
  try {
    const res = await fetch(SHEET_CSV_URL, { cache: 'no-store' })
    if (!res.ok) return []

    const text = await res.text()
    return text
      .split('\n')
      .map(line => {
        const col = line.split(',')[0] ?? ''
        return col.trim().replace(/^"|"$/g, '').trim()
      })
      .filter(v => SO_PATTERN.test(v))
  } catch {
    return []
  }
}

// ─── GSO V4 types ──────────────────────────────────────────────────────────────

export type GSORow = {
  sku:          string | null
  pa:           string | null
  modelo:       string | null
  qPi:          number | null
  incoterm:     string | null
  puertoSalida: string | null
  fobUnit:      number | null
  fobTotal:     number | null
  etd:          Date   | null
  eta:          Date   | null
}

// ─── GSO V4 map (fetch once, use for bulk) ────────────────────────────────────

async function fetchRawCSV(): Promise<string> {
  const res = await fetch(SHEET_CSV_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`)
  return res.text()
}

// Exact lowercase column name lookup — derived from actual sheet headers
function buildColMap(headers: string[]): Record<string, number> {
  const idx = (name: string) => headers.indexOf(name)
  // Para PA: probar varios nombres comunes en orden de prioridad. Si ninguno
  // existe queda -1 (null) — mejor vacío que mostrar dato incorrecto.
  // El bug anterior leía "marca" (= "DJI" para todos los productos).
  const paIdx = ['pa', 'p.a.', 'p.a', 'pre alerta', 'prealerta', 'pre-alerta']
    .map(name => idx(name))
    .find(i => i >= 0) ?? -1
  return {
    sku:          idx('codigo'),
    pa:           paIdx,
    modelo:       idx('modelo'),
    qPi:          idx('cantidad'),
    incoterm:     idx('incoterm'),
    puertoSalida: idx('puerto de salida'),
    fobUnit:      idx('precio invoice usd'),
    fobTotal:     idx('total invoice usd'),
    etd:          idx('etd'),
    eta:          idx('eta'),
  }
}

function rowToGSO(cols: string[], colMap: Record<string, number>): GSORow {
  const g = (key: string): string | null => {
    const i = colMap[key]
    if (i == null || i < 0) return null
    return cols[i]?.trim() || null
  }
  return {
    sku:          g('sku'),
    pa:           g('pa'),
    modelo:       g('modelo'),
    qPi:          (() => { const v = parseArgNumber(g('qPi') ?? ''); return v != null ? Math.round(v) : null })(),
    incoterm:     g('incoterm'),
    puertoSalida: g('puertoSalida'),
    fobUnit:      parseArgNumber(g('fobUnit') ?? ''),
    fobTotal:     parseArgNumber(g('fobTotal') ?? ''),
    etd:          parseDMY(g('etd') ?? ''),
    eta:          parseDMY(g('eta') ?? ''),
  }
}

// Build a Map<soId_upper, GSORow> from the full sheet — use when saving multiple items
export async function buildGSOMap(): Promise<Map<string, GSORow>> {
  const map = new Map<string, GSORow>()
  try {
    const csv     = await fetchRawCSV()
    const lines   = csv.split('\n')
    const headers = parseCSVRow(lines[0] ?? '').map(h => h.toLowerCase())
    const idCol   = headers.indexOf('id')
    const colMap  = buildColMap(headers)
    if (idCol < 0) return map

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line?.trim()) continue
      const cols = parseCSVRow(line)
      const id   = (cols[idCol] ?? '').trim().toUpperCase()
      if (id && SO_PATTERN.test(id)) {
        map.set(id, rowToGSO(cols, colMap))
      }
    }
  } catch (err) {
    console.error('[sheets] buildGSOMap error:', err)
  }
  return map
}

// Returns all SO rows as a flat array — used by the Nueva Compra SO picker
export type SOOption = {
  soNumber: string
  modelo:   string | null
  sku:      string | null
  qPi:      number | null
  fobUnit:  number | null
  fobTotal: number | null
  incoterm: string | null
  pa:       string | null
}

export async function listAllSOs(): Promise<SOOption[]> {
  const map = await buildGSOMap()
  return Array.from(map.entries()).map(([soNumber, row]) => ({
    soNumber,
    modelo:   row.modelo,
    sku:      row.sku,
    qPi:      row.qPi,
    fobUnit:  row.fobUnit,
    fobTotal: row.fobTotal,
    incoterm: row.incoterm,
    pa:       row.pa,
  }))
}

// Fetch a single SO row — use when updating one item
export async function fetchGSORow(soId: string): Promise<GSORow | null> {
  try {
    const csv     = await fetchRawCSV()
    const lines   = csv.split('\n')
    const headers = parseCSVRow(lines[0] ?? '').map(h => h.toLowerCase())
    const idCol   = headers.indexOf('id')
    const colMap  = buildColMap(headers)
    if (idCol < 0) return null

    const target = soId.trim().toUpperCase()
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line?.trim()) continue
      const cols = parseCSVRow(line)
      if ((cols[idCol] ?? '').trim().toUpperCase() === target) {
        return rowToGSO(cols, colMap)
      }
    }
    return null
  } catch (err) {
    console.error('[sheets] fetchGSORow error:', err)
    return null
  }
}
