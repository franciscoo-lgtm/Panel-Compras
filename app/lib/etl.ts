'use server'

import Anthropic from '@anthropic-ai/sdk'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { uploadToDrive } from '@/app/lib/drive'
import { buildGSOMap } from '@/app/lib/sheets'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExtractedItem = {
  asn:            string | null
  date:           string | null   // YYYY-MM-DD
  piNo:           string | null
  caseNo:         string | null
  qBultos:        number | null
  qty:            number | null
  codeEan:        string | null
  description:    string | null
  w:              number | null   // cm
  l:              number | null   // cm
  h:              number | null   // cm
  cbm:            number | null
  gwKg:           number | null
  cbmXBulto:      number | null
  uniXBulto:      number | null
  isDangerousGood: boolean
}

export type DriveLinks = {
  excel: string | null
  ci:    string | null
  pl:    string | null
}

export type ExtractionResult =
  | { success: true; items: ExtractedItem[]; tipoCarga: 'Repuesto' | 'Mercaderia'; driveLinks: DriveLinks }
  | { success: false; error: string }

export type SaveResult =
  | { success: true;  count: number }
  | { success: false; error: string }

// ─── Claude client ────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

async function callClaude(content: string): Promise<ExtractedItem[]> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content }],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '[]'

  const start = raw.indexOf('[')
  const end   = raw.lastIndexOf(']')
  if (start === -1 || end === -1) {
    console.error('[ETL] Claude response has no JSON array:\n', raw.slice(0, 300))
    return []
  }
  return JSON.parse(raw.slice(start, end + 1)) as ExtractedItem[]
}

// ─── Excel helpers ────────────────────────────────────────────────────────────

function findSheet(wb: XLSX.WorkBook, patterns: RegExp[]): XLSX.WorkSheet | null {
  const name = wb.SheetNames.find(n => patterns.some(p => p.test(n)))
  return name ? wb.Sheets[name] : null
}

function sheetToText(ws: XLSX.WorkSheet): string {
  if (!ws['!ref']) return ''
  const range = XLSX.utils.decode_range(ws['!ref'])
  const rows: string[] = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      cells.push(cell ? String(cell.v ?? '') : '')
    }
    const row = cells.join(' | ')
    if (row.replace(/[| ]/g, '').length) rows.push(row)
  }
  return rows.join('\n')
}

// ─── Repuesto extractor ───────────────────────────────────────────────────────

async function extractRepuesto(buf: Buffer): Promise<ExtractedItem[]> {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })

  const ciSheet = findSheet(wb, [/commercial\s*invoice/i, /comercial/i, /invoice/i])
  const plSheet = findSheet(wb, [/packing\s*list/i, /p12/i, /packing/i])

  const ciText = ciSheet ? sheetToText(ciSheet) : '(no CommercialInvoice sheet found)'
  const plText = plSheet ? sheetToText(plSheet) : '(no PackingList sheet found)'

  return callClaude(`Extract all line items from this DJI Repuesto (Spare Parts) Excel CIPL.

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
- Output rows in EXACTLY the same order as the Packing List (top to bottom, by carton number)`)
}

// ─── Mercadería extractor ─────────────────────────────────────────────────────

async function extractMercaderia(ciBuf: Buffer, plBuf: Buffer): Promise<ExtractedItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdf = require('pdf-parse')
  const [ciData, plData] = await Promise.all([pdf(ciBuf), pdf(plBuf)])

  return callClaude(`Extract all line items from this DJI Mercadería (Merchandise) CIPL.

=== COMMERCIAL INVOICE PDF ===
${(ciData.text as string).slice(0, 8000)}

=== PACKING LIST PDF ===
${(plData.text as string).slice(0, 12000)}

INSTRUCTIONS:
- Match items between CI and PL using the 13-digit EAN code
- codeEan = 13-digit EAN from Packing List
- qBultos: calculate from carton range (e.g. "7~41" = 35, "1~6" = 6)
- caseNo = the full carton code (e.g. "STS2605060W34-7~41")
- Dimensions appear as "W*L*H" in cm — split into w, l, h
- qBultos, gwKg, w, l, h, cbm: set ONLY on the primary row of each carton; null on sub-rows within the same carton
- Output rows in EXACTLY the same order as the Packing List (top to bottom, by carton number)`)
}

// ─── Server Actions ───────────────────────────────────────────────────────────

export async function extraerCIPL(formData: FormData): Promise<ExtractionResult> {
  try {
    const tipo = formData.get('tipoCarga') as string
    const driveLinks: DriveLinks = { excel: null, ci: null, pl: null }

    if (tipo === 'Repuesto') {
      const file = formData.get('file') as File | null
      if (!file) return { success: false, error: 'Archivo Excel requerido.' }

      const buf   = Buffer.from(await file.arrayBuffer())
      const items = await extractRepuesto(buf)

      // Drive upload (no-op when creds not configured)
      const firstItem = items[0]
      driveLinks.excel = await uploadToDrive(file, {
        piNo: firstItem?.piNo,
        asn:  firstItem?.asn,
        date: firstItem?.date,
      })

      return { success: true, items, tipoCarga: 'Repuesto', driveLinks }
    }

    if (tipo === 'Mercaderia') {
      const fileCi = formData.get('file_ci') as File | null
      const filePl = formData.get('file_pl') as File | null
      if (!fileCi || !filePl) return { success: false, error: 'Se requieren CI y PL en PDF.' }

      const [ciBuf, plBuf] = await Promise.all([
        Buffer.from(await fileCi.arrayBuffer()),
        Buffer.from(await filePl.arrayBuffer()),
      ])
      const items = await extractMercaderia(ciBuf, plBuf)

      const firstItem = items[0]
      const meta = { piNo: firstItem?.piNo, asn: firstItem?.asn, date: firstItem?.date }
      const [ciLink, plLink] = await Promise.all([
        uploadToDrive(fileCi, meta),
        uploadToDrive(filePl, meta),
      ])
      driveLinks.ci = ciLink
      driveLinks.pl = plLink

      return { success: true, items, tipoCarga: 'Mercaderia', driveLinks }
    }

    return { success: false, error: 'Tipo de carga inválido.' }
  } catch (err) {
    console.error('[ETL] extraerCIPL error:', err)
    return { success: false, error: String(err) }
  }
}

export type SOSuggestion = { so: string; reason: string } | null
export type SOSuggestionResult = { suggestions: SOSuggestion[]; error?: string; soCount: number }

// Robust extraction: tries full JSON parse, then per-object regex fallback.
function extractSOArray(text: string): Array<{ so: string; reason: string }> | null {
  // Strategy 1: find the outermost [...] and parse it
  const start = text.indexOf('[')
  const end   = text.lastIndexOf(']')
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) } catch { /* fall through */ }
  }
  // Strategy 2: extract individual {"so":...,"reason":...} objects via regex
  const hits: Array<{ so: string; reason: string }> = []
  const re = /\{\s*"so"\s*:\s*"([^"]+)"\s*,\s*"reason"\s*:\s*"([^"]+)"\s*\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) hits.push({ so: m[1], reason: m[2] })
  return hits.length > 0 ? hits : null
}

// Look up product names for EAN barcodes via public barcode DB (for Mercadería matching).
// Best-effort: ignores failures, 4s timeout per request.
async function lookupEANProducts(eans: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  await Promise.allSettled(
    eans.filter(e => e.length >= 8).map(async ean => {
      try {
        const res = await fetch(
          `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(ean)}`,
          { signal: AbortSignal.timeout(4000), headers: { Accept: 'application/json' } }
        )
        if (!res.ok) return
        const data = await res.json() as { items?: Array<{ title?: string; brand?: string; description?: string }> }
        const item = data.items?.[0]
        if (item?.title) {
          results.set(ean, `${item.brand ?? ''} ${item.title}`.trim().slice(0, 120))
        }
      } catch { /* timeout or network error — silently ignore */ }
    })
  )
  return results
}

export async function sugerirSOsCIPL(
  items: ExtractedItem[]
): Promise<SOSuggestionResult> {
  const empty = (error: string): SOSuggestionResult =>
    ({ suggestions: items.map(() => null), soCount: 0, error })

  try {
    const gsoMap = await buildGSOMap()
    if (gsoMap.size === 0) {
      return empty('No se encontraron SOs en GSO V4. Verificá la conexión con Google Sheets.')
    }

    // Send ALL SOs in compact format: soId + modelo + sku (~50 chars/line).
    // Hard cap at 400k chars (~100k tokens) so total prompt stays within Haiku's 200k limit.
    // No pre-filtering — Claude sees the full GSO to reason like a human.
    const MAX_GSO_CHARS = 400_000
    let gsoList = ''
    for (const [soId, row] of gsoMap.entries()) {
      const detail = [row.modelo, row.sku].filter(Boolean).join(' | ')
      const line = `${soId}: ${detail || '?'}\n`
      if (gsoList.length + line.length > MAX_GSO_CHARS) break
      gsoList += line
    }
    gsoList = gsoList.trimEnd()
    console.log(`[ETL] sugerirSOsCIPL: ${gsoList.split('\n').length} SOs in prompt (${Math.round(gsoList.length/1000)}k chars) of ${gsoMap.size} total`)

    // For Mercadería: look up EAN barcodes in public product DB to get product names.
    // This lets Claude match EAN → product name → GSO modelo even when EAN isn't in GSO.
    const uniqueEANs = [...new Set(items.map(i => i.codeEan).filter(Boolean))] as string[]
    const eanProducts = await lookupEANProducts(uniqueEANs)
    console.log(`[ETL] EAN lookups resolved: ${eanProducts.size}/${uniqueEANs.length}`)

    const itemsText = items
      .map((item, i) => {
        const eanInfo = item.codeEan ? eanProducts.get(item.codeEan) : null
        return `[${i}] CasNo/PI=${item.piNo ?? '?'} CódigoParte=${item.codeEan ?? '?'}${eanInfo ? ` (Producto: ${eanInfo})` : ''} Desc="${item.description ?? '?'}" Qty=${item.qty ?? '?'}`
      })
      .join('\n')

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Sos un experto en importaciones DJI. Tu tarea es encontrar el Sales Order (SO) correcto del GSO V4 para cada ítem de este Packing List. Razoná como lo haría un humano con experiencia: usá TODA la información disponible.

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
3. Para Mercadería: si tenés el nombre del producto (campo "Producto:" en los ítems), buscá el SO cuyo Modelo coincida.
4. Usá tu conocimiento de productos DJI para relacionar descripción, EAN o código con el modelo del SO.
5. En general todos los ítems del mismo PL corresponden al mismo SO o grupo de SOs.
6. Si no encontrás coincidencia exacta, elegí el SO más probable y explicá por qué.

Respondé ÚNICAMENTE con un array JSON con exactamente ${items.length} elementos, sin markdown ni código fence:
[{"so":"SO-XXXX","reason":"<por qué en español, máx 12 palabras>"},...]`,
      }],
    })

    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
    console.log('[ETL] sugerirSOsCIPL raw response:', text.slice(0, 800))

    const parsed = extractSOArray(text)
    if (!parsed) {
      return empty(`La IA no devolvió JSON válido. Respuesta: "${text.slice(0, 120)}"`)
    }

    const suggestions = items.map((_, i) => parsed[i] ?? null)
    const soCount = suggestions.filter(Boolean).length
    return { suggestions, soCount }
  } catch (err) {
    console.error('[ETL] sugerirSOsCIPL error:', err)
    return empty(`Error: ${String(err).slice(0, 120)}`)
  }
}

export async function guardarCIPL(formData: FormData): Promise<SaveResult> {
  try {
    const items         = JSON.parse(formData.get('items')         as string) as ExtractedItem[]
    const sosPrincipal  = JSON.parse(formData.get('sosPrincipal')  as string) as string[]
    const sosSecundario = JSON.parse(formData.get('sosSecundario') as string) as string[]
    const driveLinks    = JSON.parse(formData.get('driveLinks')    as string ?? '{}') as Partial<DriveLinks>
    const categoryName  = (formData.get('categoryName') as string)?.trim() || 'Sin nombre'
    const tipoCarga     = formData.get('tipoCarga') as string

    // Fetch GSO data once for all SOs in this batch
    const uniqueSOs = [...new Set(sosPrincipal.filter(Boolean).map(s => s.trim().toUpperCase()))]
    let gsoMap = new Map<string, Record<string, unknown>>()
    if (uniqueSOs.length > 0) {
      try {
        gsoMap = await buildGSOMap() as Map<string, Record<string, unknown>>
      } catch (err) {
        console.warn('[ETL] GSO map fetch failed, proceeding without:', err)
      }
    }

    const rows = items.map((item, i) => {
      const so  = sosPrincipal[i]?.trim() || null
      const gso = so ? (gsoMap.get(so.toUpperCase()) ?? {}) : {}
      return {
        tipoCarga,
        categoryName,
        sortOrder:    i,
        soPrincipal:  so,
        soSecundario: sosSecundario[i]?.trim() || null,
        asn:          item.asn,
        date:         item.date ? new Date(item.date) : null,
        piNo:         item.piNo,
        caseNo:       item.caseNo,
        qBultos:      item.qBultos,
        qty:          item.qty,
        codeEan:      item.codeEan,
        description:  item.description,
        w:            item.w,
        l:            item.l,
        h:            item.h,
        cbm:          item.cbm,
        gwKg:         item.gwKg,
        cbmXBulto:    item.cbmXBulto,
        uniXBulto:    item.uniXBulto,
        isDangerousGood: item.isDangerousGood ?? false,
        driveLinkExcel: driveLinks.excel ?? null,
        driveLinkCi:    driveLinks.ci    ?? null,
        driveLinkPl:    driveLinks.pl    ?? null,
        ...gso,
      }
    })

    await prisma.cIPLItem.createMany({ data: rows })
    return { success: true, count: rows.length }
  } catch (err) {
    console.error('[ETL] guardarCIPL error:', err)
    return { success: false, error: String(err) }
  }
}
