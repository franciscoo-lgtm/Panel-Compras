export const runtime    = 'edge'
export const maxDuration = 25

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

async function callHaiku(
  userContent: Array<{ type: string; [key: string]: unknown }>
): Promise<ExtractedItem[]> {
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
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userContent }],
    }),
  })

  if (!apiRes.ok) {
    const t = await apiRes.text()
    throw new Error(`Anthropic ${apiRes.status}: ${t.slice(0, 300)}`)
  }

  const data  = await apiRes.json() as { content?: Array<{ type: string; text?: string }> }
  const raw   = data.content?.[0]?.type === 'text' ? (data.content[0].text ?? '[]') : '[]'
  const start = raw.indexOf('[')
  const end   = raw.lastIndexOf(']')
  if (start === -1 || end === -1) {
    console.error('[extract] No JSON array in response:', raw.slice(0, 200))
    return []
  }
  return JSON.parse(raw.slice(start, end + 1)) as ExtractedItem[]
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
      const ciText  = json.ciText ?? '(no CommercialInvoice sheet found)'
      const plText  = json.plText ?? '(no PackingList sheet found)'

      const promptText = `Extract all line items from this DJI Repuesto (Spare Parts) Excel CIPL.

=== COMMERCIAL INVOICE SHEET ===
${ciText.slice(0, 6000)}

=== PACKING LIST SHEET ===
${plText.slice(0, 10000)}

INSTRUCTIONS:
- piNo = CAS No. value from CommercialInvoice (same for all rows)
- codeEan = the DJI official part/item number (column labeled "No.", "Item No.", "P/N", "Product Code", or "Item" — NOT the EAN barcode, NOT a distributor SKU). This is typically a short numeric or alphanumeric code like "15522" or "CP.MA.00000266.01".
- description = the text description only (e.g. "Motor", "Battery", "Arm") — do NOT include the item number in this field
- caseNo: apply fill-down if rows share the same physical carton; multiple items in the same carton share the same caseNo
- qBultos = 1 only on the FIRST item of each carton (primary row); set null on all subsequent items in the same carton
- gwKg / w / l / h: set ONLY on the primary row of each carton; null on sub-rows
- Output rows in EXACTLY the same order as the Packing List (top to bottom, by carton number)`

      const items = await callHaiku([{ type: 'text', text: promptText }])
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

    const items = await callHaiku([
      { type: 'text', text: '=== COMMERCIAL INVOICE PDF ===' },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: ciB64 } },
      { type: 'text', text: '=== PACKING LIST PDF ===' },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: plB64 } },
      { type: 'text', text: promptText },
    ])
    return Response.json({ success: true, items, tipoCarga: 'Mercaderia' } satisfies RouteResult)

  } catch (err) {
    console.error('[extract] error:', err)
    return Response.json({ success: false, error: String(err) } satisfies RouteResult)
  }
}
