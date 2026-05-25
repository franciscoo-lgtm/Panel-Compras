export const maxDuration = 60

// ─── Types ────────────────────────────────────────────────────────────────────

type ExtractedItem = {
  asn:             string | null
  date:            string | null
  piNo:            string | null
  caseNo:          string | null
  qBultos:         number | null
  qty:             number | null
  codeEan:         string | null
  description:     string | null
  w:               number | null
  l:               number | null
  h:               number | null
  cbm:             number | null
  gwKg:            number | null
  cbmXBulto:       number | null
  uniXBulto:       number | null
  isDangerousGood: boolean
}

type RouteResult =
  | { success: true;  items: ExtractedItem[]; tipoCarga: 'Repuesto' | 'Mercaderia' }
  | { success: false; error: string }

// ─── Shared prompt rules ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a CIPL data extraction expert for DJI product imports into Argentina.
Extract structured line items from Commercial Invoice (CI) and Packing List (PL) documents.

Return ONLY a valid JSON array — no markdown, no code fences, no explanation.

Each element must have EXACTLY these fields:
{
  "asn": string | null,
  "date": "YYYY-MM-DD" | null,
  "piNo": string | null,
  "caseNo": string | null,
  "qBultos": number | null,
  "qty": number | null,
  "codeEan": string | null,
  "description": string | null,
  "w": number | null,
  "l": number | null,
  "h": number | null,
  "cbm": number | null,
  "gwKg": number | null,
  "cbmXBulto": number | null,
  "uniXBulto": number | null,
  "isDangerousGood": boolean
}

Rules:
- qBultos: compute from carton range — "1~6" = 6, "7~41" = 35, "3~4" = 2, "5" = 1
- w / l / h: split from "W*L*H" or "WxLxH" format (values in cm)
- cbmXBulto = cbm / qBultos (round to 6 decimals)
- uniXBulto = qty / qBultos (round to 4 decimals)
- isDangerousGood: true if description includes lithium batteries, flammable liquids, aerosols, explosives, or any IATA/IMDG class dangerous goods
- Apply fill-down for caseNo: if a sub-row has no case number, inherit the last known case number
- gwKg, w, l, h: set ONLY on the first sub-row of each physical carton (the "primary" row). Leave them NULL on subsequent rows within the same carton — do NOT fill down these values
- CRITICAL: output items in EXACTLY the same top-to-bottom order as they appear in the Packing List document. Do not reorder items.
- piNo = CAS No. from Commercial Invoice (applies to ALL rows)`

// ─── Anthropic call (raw fetch, edge-compatible) ──────────────────────────────

async function callHaikuText(
  system: string,
  userContent: Array<{ type: string; [key: string]: unknown }>
): Promise<string> {
  const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'pdfs-2024-09-25',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system,
      messages:   [{ role: 'user', content: userContent }],
    }),
  })

  if (!apiRes.ok) {
    const t = await apiRes.text()
    throw new Error(`Anthropic ${apiRes.status}: ${t.slice(0, 300)}`)
  }

  const data = await apiRes.json() as { content?: Array<{ type: string; text?: string }> }
  return data.content?.[0]?.type === 'text' ? (data.content[0].text ?? '') : ''
}

async function callHaiku(
  userContent: Array<{ type: string; [key: string]: unknown }>
): Promise<ExtractedItem[]> {
  const raw   = await callHaikuText(SYSTEM_PROMPT, userContent)
  const start = raw.indexOf('[')
  const end   = raw.lastIndexOf(']')
  if (start === -1 || end === -1) {
    console.error('[extract] No JSON array in response:', raw.slice(0, 200))
    return []
  }
  return JSON.parse(raw.slice(start, end + 1)) as ExtractedItem[]
}

// ─── Enforce single primary row per carton ────────────────────────────────────
// Claude sometimes fills dimensions on all sub-rows; this corrects it.

function enforcePrimaryRow(items: ExtractedItem[]): ExtractedItem[] {
  const seen = new Set<string>()
  return items.map(item => {
    if (!item.caseNo) return item
    if (seen.has(item.caseNo)) {
      return { ...item, qBultos: null, w: null, l: null, h: null, cbm: null, gwKg: null, cbmXBulto: null }
    }
    seen.add(item.caseNo)
    return item
  })
}

// ─── ArrayBuffer → base64 (no Buffer / Node.js needed) ───────────────────────

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary  = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

// ─── POST /api/extract ────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  try {
    const tipoParam = new URL(req.url).searchParams.get('tipo')
    const ct        = req.headers.get('content-type') ?? ''

    // ── Repuesto ─────────────────────────────────────────────────────────────
    // Client sends JSON body with pre-extracted sheet text (xlsx parsed browser-side)
    if (tipoParam === 'Repuesto' || ct.includes('application/json')) {
      const json    = await req.json() as { ciText?: string; plText?: string }
      const ciText  = json.ciText ?? ''
      const plText  = json.plText ?? ''

      // Extract shared header fields via regex — no AI tokens wasted repeating them per row
      const combined  = ciText + '\n' + plText
      const asnMatch  = combined.match(/\|\s*(?:ASN\.|Packing List No\.)\s*\|\s*([A-Z]{2,5}\d{6,}[A-Z0-9]*)/i)
      const dateMatch = combined.match(/\|\s*Date\s*\|\s*(\d{4}-\d{2}-\d{2})/)
      const piNoMatch = ciText.match(/\|\s*CAS No\.\s*\|\s*(CAS-[\w-]+)/)

      const sharedAsn  = asnMatch?.[1]?.trim()  ?? null
      const sharedDate = dateMatch?.[1]?.trim()  ?? null
      const sharedPiNo = piNoMatch?.[1]?.trim()  ?? null

      // Ask Claude only for per-row variable fields using compact abbreviated keys
      // This keeps the response well under the 8192-token Haiku limit
      const promptText = `Extract ALL data rows from this DJI Repuesto Packing List. Return ONLY a minified JSON array (no whitespace, no code fences).

=== PACKING LIST ===
${plText.slice(0, 10000)}

One object per row using these abbreviated keys (omit null/blank fields entirely):
- "cn": full Case No (e.g. "731226126040200000158-1"). Fill-down if blank. WARNING: the "No" column with 1,2,3… is the carton sequence — do NOT use it as cn.
- "qb": 1 only on FIRST row of each cn; omit on sub-rows with same cn
- "q": Qty column number
- "c": Part No. or P/N column (e.g. "BC.AG.SS001102.01")
- "d": Description text
- "w","l","h": numbers from SIZE field (split "59*57*27" or "59x57x27" on * or x)
- "cbm": Volume(CBM) — first row per cn only
- "gw": GW(KG) — first row per cn only
- "dg": true only if description mentions lithium battery, flammable, aerosol, or explosive

Output MINIFIED JSON only — single line, no spaces between keys/values.`

      type CompactRow = { cn?:string; qb?:number; q?:number; c?:string; d?:string; w?:number; l?:number; h?:number; cbm?:number; gw?:number; dg?:boolean }

      const REPUESTO_SYSTEM = `You are a packing list data extractor. Return ONLY a compact minified JSON array with no whitespace and no code fences.`
      const raw   = await callHaikuText(REPUESTO_SYSTEM, [{ type: 'text', text: promptText }])
      const start = raw.indexOf('[')
      const end   = raw.lastIndexOf(']')
      if (start === -1 || end === -1) {
        console.error('[extract/repuesto] No JSON array in response:', raw.slice(0, 300))
        return Response.json({ success: false, error: 'La IA no devolvió datos válidos.' } satisfies RouteResult)
      }
      const compact = JSON.parse(raw.slice(start, end + 1)) as CompactRow[]

      const items = enforcePrimaryRow(compact.map(row => ({
        asn:             sharedAsn,
        date:            sharedDate,
        piNo:            sharedPiNo,
        caseNo:          row.cn  ?? null,
        qBultos:         row.qb  ?? null,
        qty:             row.q   ?? null,
        codeEan:         row.c   ?? null,
        description:     row.d   ?? null,
        w:               row.w   ?? null,
        l:               row.l   ?? null,
        h:               row.h   ?? null,
        cbm:             row.cbm ?? null,
        gwKg:            row.gw  ?? null,
        cbmXBulto:       (row.cbm != null && (row.qb ?? 0) > 0) ? +((row.cbm) / (row.qb ?? 1)).toFixed(6) : null,
        uniXBulto:       (row.q  != null && (row.qb ?? 0) > 0) ? +((row.q)   / (row.qb ?? 1)).toFixed(4) : null,
        isDangerousGood: row.dg  ?? false,
      })))

      return Response.json({ success: true, items, tipoCarga: 'Repuesto' } satisfies RouteResult)
    }

    // ── Mercadería ────────────────────────────────────────────────────────────
    const formData = await req.formData()
    const fileCi   = formData.get('file_ci') as File | null
    const filePl   = formData.get('file_pl') as File | null
    if (!fileCi || !filePl) {
      return Response.json({ success: false, error: 'Se requieren CI y PL en PDF.' } satisfies RouteResult)
    }

    const [ciBuf, plBuf] = await Promise.all([fileCi.arrayBuffer(), filePl.arrayBuffer()])
    const [ciB64, plB64] = [toBase64(ciBuf), toBase64(plBuf)]

    const promptText = `Extract all line items from this DJI Mercadería (Merchandise) CIPL.

INSTRUCTIONS:
- Match items between CI and PL using the 13-digit EAN code
- codeEan = 13-digit EAN from Packing List
- qBultos: calculate from carton range (e.g. "7~41" = 35, "1~6" = 6)
- caseNo = the full carton code (e.g. "STS2605060W34-7~41")
- Dimensions appear as "W*L*H" in cm — split into w, l, h
- qBultos, gwKg, w, l, h, cbm: set ONLY on the primary row of each carton; null on sub-rows within the same carton
- Output rows in EXACTLY the same order as the Packing List (top to bottom, by carton number)`

    const items = enforcePrimaryRow(await callHaiku([
      { type: 'text', text: '=== COMMERCIAL INVOICE PDF ===' },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: ciB64 } },
      { type: 'text', text: '=== PACKING LIST PDF ===' },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: plB64 } },
      { type: 'text', text: promptText },
    ]))
    return Response.json({ success: true, items, tipoCarga: 'Mercaderia' } satisfies RouteResult)

  } catch (err) {
    console.error('[extract] error:', err)
    return Response.json({ success: false, error: String(err) } satisfies RouteResult)
  }
}
