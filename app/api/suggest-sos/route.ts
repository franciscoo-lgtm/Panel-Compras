// No edge runtime — needs Prisma (Node.js)
export const maxDuration = 25

import { prisma } from '@/lib/prisma'

// ─── Types ────────────────────────────────────────────────────────────────────

type ExtractedItem = {
  asn:         string | null
  piNo:        string | null
  codeEan:     string | null
  description: string | null
  qty:         number | null
}

type SOSuggestion = { so: string; reason: string } | null

type RouteResult = {
  suggestions: SOSuggestion[]
  soCount:     number
  error?:      string
}

type GSORow = { id: string; modelo: string; codigo: string; invoice: string }

// ─── CSV helpers ──────────────────────────────────────────────────────────────

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1JT0EjHrEUIGhm4RBSVQq2sntS6naiQ30b7u63gnMaZI/export?format=csv&gid=1292277028'

const SO_PATTERN = /^SO[-\s]?\d+/i

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

// Normalize: lowercase, strip spaces/dashes/dots/underscores
const norm = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, '')

// ─── Load GSO rows ────────────────────────────────────────────────────────────

async function loadGSO(): Promise<GSORow[]> {
  try {
    const res = await fetch(SHEET_CSV_URL, { cache: 'no-store' })
    if (!res.ok) return []

    const csv     = await res.text()
    const lines   = csv.split('\n')
    const headers = parseCSVRow(lines[0] ?? '').map(h => h.toLowerCase().trim())

    const idCol  = headers.indexOf('id')
    const modCol = headers.indexOf('modelo')
    const skuCol = headers.indexOf('codigo')
    // IMPORTANT: match "n invoice" exactly — NOT "fecha invoice"
    const invCol = headers.findIndex(h => h === 'n invoice')

    if (idCol < 0) return []

    const rows: GSORow[] = []
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line?.trim()) continue
      const cols = parseCSVRow(line)
      const id   = (cols[idCol] ?? '').trim().toUpperCase()
      if (!id || !SO_PATTERN.test(id)) continue
      rows.push({
        id,
        modelo:  cols[modCol]?.trim() ?? '',
        codigo:  cols[skuCol]?.trim() ?? '',
        invoice: invCol >= 0 ? (cols[invCol]?.trim() ?? '') : '',
      })
    }
    return rows
  } catch {
    return []
  }
}

// ─── Filter by PI / invoice ───────────────────────────────────────────────────
// Returns subset matching the PI; falls back to ALL rows if nothing matches.

function filterByPI(rows: GSORow[], piNos: string[]): { rows: GSORow[]; matched: boolean } {
  const normPIs = piNos.map(norm).filter(p => p.length >= 6)
  if (!normPIs.length) return { rows, matched: false }

  const filtered = rows.filter(r => {
    const ni = norm(r.invoice)
    return ni.length >= 6 && normPIs.some(p =>
      ni === p ||
      (ni.length >= 8 && p.includes(ni)) ||
      (p.length >= 8 && ni.includes(p))
    )
  })

  return filtered.length > 0
    ? { rows: filtered, matched: true }
    : { rows, matched: false }
}

// ─── Direct code match (deterministic, no AI) ─────────────────────────────────
// For DJI Repuesto: codeEan="BC.AG.SS001102.01", GSO modelo="BC.AG.SS001102"
// norm strips dots so: "bcagss00110201".startsWith("bcagss001102") = true

function directCodeMatch(codeEan: string, rows: GSORow[]): GSORow | null {
  const nc = norm(codeEan)
  if (nc.length < 6) return null
  for (const row of rows) {
    const nm = norm(row.modelo)
    if (nm.length < 6) continue
    if (nc === nm || nc.startsWith(nm) || nm.startsWith(nc)) return row
  }
  return null
}

// ─── Historical EAN→SO mappings (context for AI) ─────────────────────────────

async function getHistoricalMappings(
  eans: string[],
  allowedIds: Set<string> | null,
): Promise<string> {
  const valid = eans.filter(Boolean)
  if (!valid.length) return ''
  try {
    const items = await prisma.cIPLItem.findMany({
      where:   { codeEan: { in: valid }, soPrincipal: { not: null } },
      select:  { codeEan: true, description: true, soPrincipal: true },
      orderBy: { createdAt: 'desc' },
      take:    500,
    })
    const eanMap = new Map<string, Map<string, number>>()
    for (const item of items) {
      if (!item.codeEan || !item.soPrincipal) continue
      if (allowedIds && !allowedIds.has(item.soPrincipal)) continue
      if (!eanMap.has(item.codeEan)) eanMap.set(item.codeEan, new Map())
      const m = eanMap.get(item.codeEan)!
      m.set(item.soPrincipal, (m.get(item.soPrincipal) ?? 0) + 1)
    }
    const lines: string[] = []
    for (const [ean, soMap] of eanMap) {
      const [bestSO, count] = [...soMap.entries()].sort((a, b) => b[1] - a[1])[0]!
      const desc = items.find(i => i.codeEan === ean)?.description ?? ''
      lines.push(`${ean}${desc ? ` (${desc.slice(0, 35)})` : ''} → ${bestSO} (${count}x)`)
    }
    return lines.join('\n')
  } catch {
    return ''
  }
}

// ─── Robust JSON extraction ───────────────────────────────────────────────────

function extractSOArray(text: string): Array<{ so: string; reason: string }> | null {
  const start = text.indexOf('[')
  const end   = text.lastIndexOf(']')
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) } catch { /* fall through */ }
  }
  const hits: Array<{ so: string; reason: string }> = []
  const re = /\{\s*"so"\s*:\s*"([^"]+)"\s*,\s*"reason"\s*:\s*"([^"]+)"\s*\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) hits.push({ so: m[1]!, reason: m[2]! })
  return hits.length > 0 ? hits : null
}

// ─── POST /api/suggest-sos ────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const empty = (error: string): RouteResult => ({ suggestions: [], soCount: 0, error })

  try {
    const { items } = await req.json() as { items: ExtractedItem[] }
    if (!items?.length) return Response.json(empty('Sin ítems.'))

    // PI Nos from first item (may be comma-separated)
    const piNoRaw = items[0]?.piNo ?? ''
    const piNos   = piNoRaw.split(',').map(s => s.trim()).filter(Boolean)

    // Load GSO and filter by PI
    const allRows = await loadGSO()
    if (!allRows.length) return Response.json(empty('No se pudo leer GSO V4.'))

    const { rows: filteredRows, matched: piMatched } = filterByPI(allRows, piNos)

    // ── Phase 1: direct code match (deterministic) ──────────────────────────
    const suggestions: SOSuggestion[] = items.map(item => {
      if (!item.codeEan) return null
      const match = directCodeMatch(item.codeEan, filteredRows)
      if (!match) return null
      const piNote = piMatched ? ' (PI match)' : ''
      return {
        so:     match.id,
        reason: `parte ${item.codeEan} → ${match.modelo || match.id}${piNote}`,
      }
    })

    const unmatchedIdx = suggestions
      .map((s, i) => (s === null ? i : -1))
      .filter(i => i >= 0)

    // ── Phase 2: AI for items with no direct code match ──────────────────────
    if (unmatchedIdx.length > 0) {
      const unmatchedItems = unmatchedIdx.map(i => items[i]!)
      const eans = unmatchedItems.map(i => i.codeEan).filter(Boolean) as string[]
      const allowedIds = piMatched ? new Set(filteredRows.map(r => r.id)) : null
      const histMappings = await getHistoricalMappings(eans, allowedIds)

      // Build SO list for AI (capped at 380 KB)
      const MAX = 380_000
      let soList = ''
      for (const row of filteredRows) {
        const entry = `${row.id}: modelo=${row.modelo || '?'} | codigo=${row.codigo || '?'}\n`
        if (soList.length + entry.length >= MAX) break
        soList += entry
      }

      const piLabel      = piNos.join(', ') || 'N/A'
      const filteredCount = filteredRows.length

      const itemsText = unmatchedItems
        .map((item, i) =>
          `[${i}] EAN/Código=${item.codeEan ?? '?'} Desc="${item.description ?? '?'}" Qty=${item.qty ?? '?'}`
        )
        .join('\n')

      const histSection = histMappings
        ? `HISTORIAL (solo si el SO está en la lista filtrada):\n${histMappings}\n\n`
        : ''

      const piBlock = piMatched
        ? `SOs del invoice "${piLabel}" (${filteredCount} encontrados):\n${soList}`
        : `NOTA: no se encontró PI "${piLabel}" — usando todos los SOs.\n${soList}`

      const prompt = `Asigná el SO correcto a cada ítem. Respondé ÚNICAMENTE con un array JSON de exactamente ${unmatchedItems.length} elementos, sin markdown:
[{"so":"SO-XXXX","reason":"<15 palabras máx>"},...]

ASN: ${items[0]?.asn ?? 'N/A'} | PI: ${piLabel}

ÍTEMS:
${itemsText}

${piBlock}

${histSection}Para Mercadería: el campo "modelo" del SO debe coincidir con la descripción. Para Repuesto: el campo "modelo" del SO es el número de parte DJI.`

      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          messages:   [{ role: 'user', content: prompt }],
        }),
      })

      if (apiRes.ok) {
        const data   = await apiRes.json() as { content?: Array<{ type: string; text?: string }> }
        const text   = data.content?.[0]?.type === 'text' ? (data.content[0].text ?? '').trim() : ''
        const parsed = extractSOArray(text)
        if (parsed) {
          unmatchedIdx.forEach((origIdx, j) => {
            suggestions[origIdx] = parsed[j] ?? null
          })
        }
      }
    }

    const soCount = suggestions.filter(Boolean).length
    return Response.json({ suggestions, soCount } satisfies RouteResult)

  } catch (err) {
    console.error('[suggest-sos] error:', err)
    return Response.json(empty(String(err)))
  }
}
