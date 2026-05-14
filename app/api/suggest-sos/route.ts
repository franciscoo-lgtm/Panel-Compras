export const runtime    = 'edge'
export const maxDuration = 25

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

// ─── CSV helpers (inlined — can't import 'use server' files in edge) ──────────

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

async function buildGSOList(): Promise<string> {
  try {
    const res = await fetch(SHEET_CSV_URL, { cache: 'no-store' })
    if (!res.ok) return ''
    const csv     = await res.text()
    const lines   = csv.split('\n')
    const headers = parseCSVRow(lines[0] ?? '').map(h => h.toLowerCase())
    const idCol   = headers.indexOf('id')
    const modCol  = headers.indexOf('modelo')
    const skuCol  = headers.indexOf('codigo')
    if (idCol < 0) return ''

    const MAX_CHARS = 380_000
    let result = ''
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line?.trim()) continue
      const cols = parseCSVRow(line)
      const id   = (cols[idCol] ?? '').trim().toUpperCase()
      if (!id || !SO_PATTERN.test(id)) continue
      const modelo = cols[modCol]?.trim() ?? ''
      const sku    = cols[skuCol]?.trim() ?? ''
      const detail = [modelo, sku].filter(Boolean).join(' | ')
      const entry  = `${id}: ${detail || '?'}\n`
      if (result.length + entry.length > MAX_CHARS) break
      result += entry
    }
    return result.trimEnd()
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

    const gsoList = await buildGSOList()
    if (!gsoList) return Response.json(empty('No se encontraron SOs en GSO V4. Verificá la conexión con Google Sheets.'))

    const itemsText = items
      .map((item, i) =>
        `[${i}] CasNo/PI=${item.piNo ?? '?'} CódigoParte=${item.codeEan ?? '?'} Desc="${item.description ?? '?'}" Qty=${item.qty ?? '?'}`
      )
      .join('\n')

    const prompt = `Sos un experto en importaciones DJI. Tu tarea es encontrar el Sales Order (SO) correcto del GSO V4 para cada ítem de este Packing List. Razoná como lo haría un humano con experiencia: usá TODA la información disponible.

INFORMACIÓN DEL PACKING LIST:
- ASN: ${items[0]?.asn ?? 'N/A'}
- CAS No. / PI: ${items[0]?.piNo ?? 'N/A'}

ÍTEMS:
${itemsText}

TODOS LOS SALES ORDERS EN GSO V4 (formato: SO_ID: Modelo | CódigoParte):
${gsoList}

CÓMO RAZONAR:
1. El CAS No./PI del PL identifica el shipment — buscá SOs cuyo ID contenga los mismos números.
2. Para Repuestos: el CódigoParte del ítem debe coincidir exactamente con el CódigoParte del SO.
3. Para Mercadería: buscá el SO cuyo Modelo coincida con la descripción del ítem.
4. Usá tu conocimiento de productos DJI para relacionar descripción o código con el modelo del SO.
5. En general todos los ítems del mismo PL corresponden al mismo SO o grupo de SOs.
6. Si no encontrás coincidencia exacta, elegí el SO más probable y explicá por qué.

Respondé ÚNICAMENTE con un array JSON con exactamente ${items.length} elementos, sin markdown ni código fence:
[{"so":"SO-XXXX","reason":"<por qué en español, máx 12 palabras>"},...]`

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

    if (!apiRes.ok) {
      const t = await apiRes.text()
      return Response.json(empty(`Anthropic ${apiRes.status}: ${t.slice(0, 200)}`))
    }

    const data = await apiRes.json() as { content?: Array<{ type: string; text?: string }> }
    const text = data.content?.[0]?.type === 'text' ? (data.content[0].text ?? '').trim() : ''

    const parsed = extractSOArray(text)
    if (!parsed) {
      return Response.json(empty(`La IA no devolvió JSON válido. Respuesta: "${text.slice(0, 120)}"`))
    }

    const suggestions: SOSuggestion[] = items.map((_, i) => parsed[i] ?? null)
    const soCount = suggestions.filter(Boolean).length
    return Response.json({ suggestions, soCount } satisfies RouteResult)
  } catch (err) {
    console.error('[suggest-sos] error:', err)
    return Response.json(empty(String(err)))
  }
}
