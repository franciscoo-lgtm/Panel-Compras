'use server'

import Anthropic from '@anthropic-ai/sdk'
import { unzipSync } from 'fflate'
import { prisma } from '@/lib/prisma'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Types ────────────────────────────────────────────────────────────────────

export type PhotoEntry = { colIndex: number; base64: string; mediaType: string }

export type ExcelRow = {
  rowIndex: number
  photos: PhotoEntry[]
  // AI-read label data
  aiAsn:    string | null
  aiCarton: string | null
  aiSo:     string | null
  aiError:  string | null
  // Box-level match (asn + caseNo identifies the physical box)
  matchedAsn:    string | null
  matchedCaseNo: string | null
  matchedDesc:   string | null  // first item description for display
}

export type AnalysisResult =
  | { ok: true;  rows: ExcelRow[] }
  | { ok: false; error: string }

export type BoxOption = {
  asn:       string
  caseNo:    string
  desc:      string   // first item description
  itemCount: number
}

// Box-level assignment: photos → all CIPLItems with this asn+caseNo
export type SaveAssignment = {
  asn:    string
  caseNo: string
  photos: Array<{ rowIndex: number; colIndex: number; base64: string; mediaType: string }>
}

export type SaveResult =
  | { ok: true;  count: number }
  | { ok: false; error: string }

// ─── ZIP / image extraction ───────────────────────────────────────────────────

function detectMediaType(buf: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  if (buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp'
  return 'image/jpeg' // fallback
}

function extractImagesFromXlsx(buf: Uint8Array): {
  byRow: Map<number, PhotoEntry[]>
} {
  const files = unzipSync(buf)

  // drawing XML → rId → (rowIndex, colIndex)
  const drawingXml = new TextDecoder().decode(
    files['xl/drawings/drawing1.xml']
  )
  const relsXml = new TextDecoder().decode(
    files['xl/drawings/_rels/drawing1.xml.rels']
  )

  // rId → image filename
  const ridToFile: Record<string, string> = {}
  const rRe = /Id="(rId\d+)"[^>]*Target="\.\.\/media\/(image\d+\.\w+)"/g
  let rm: RegExpExecArray | null
  while ((rm = rRe.exec(relsXml)) !== null) ridToFile[rm[1]] = rm[2]

  // anchor → rId, fromRow, fromCol
  const byRow = new Map<number, PhotoEntry[]>()
  const anchorRe = /<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g
  let am: RegExpExecArray | null
  while ((am = anchorRe.exec(drawingXml)) !== null) {
    const block = am[0]
    const fromRow = parseInt((block.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/) || [])[1] ?? '0')
    const fromCol = parseInt((block.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/) || [])[1] ?? '0')
    const rid = (block.match(/r:embed="(rId\d+)"/) || [])[1]
    if (!rid) continue
    const imgFile = ridToFile[rid]
    if (!imgFile) continue
    const imgBuf = files[`xl/media/${imgFile}`]
    if (!imgBuf) continue
    const base64 = Buffer.from(imgBuf).toString('base64')
    const mediaType = detectMediaType(imgBuf)
    if (!byRow.has(fromRow)) byRow.set(fromRow, [])
    byRow.get(fromRow)!.push({ colIndex: fromCol, base64, mediaType })
  }

  // sort each row's photos by column
  for (const [, photos] of byRow) photos.sort((a, b) => a.colIndex - b.colIndex)
  return { byRow }
}

// ─── Claude label reader ──────────────────────────────────────────────────────

type LabelRead = { asn: string | null; cartonNo: string | null; soNo: string | null; error: string | null }

async function readLabelsFromPhotos(
  rows: Array<{ rowIndex: number; firstPhoto: string; mediaType: string }>
): Promise<Map<number, LabelRead>> {
  const imageContent: Anthropic.ImageBlockParam[] = rows.map(r => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: r.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
      data: r.firstPhoto,
    },
  }))

  const promptText = `You will receive ${rows.length} photos of shipping box labels, in order.
For each photo, extract from the shipping label:
- ASN / Shipment No (出货单号): e.g. "JDS260425M0NX"
- CartonNo (箱号): the long barcode number (digits only)
- SO: the sales order number e.g. "SO09797165"

Return ONLY a JSON array with exactly ${rows.length} elements, one per photo in order:
[
  { "asn": "...", "cartonNo": "...", "soNo": "...", "error": null },
  ...
]
If a photo does not show a readable label (blurry, inside box, packaging), set all fields to null and set "error" to a short reason.`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [...imageContent, { type: 'text', text: promptText }],
    }],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
  const start = raw.indexOf('['), end = raw.lastIndexOf(']')
  const parsed: LabelRead[] = start >= 0 ? JSON.parse(raw.slice(start, end + 1)) : []

  const result = new Map<number, LabelRead>()
  rows.forEach((r, i) => result.set(r.rowIndex, parsed[i] ?? { asn: null, cartonNo: null, soNo: null, error: 'No response' }))
  return result
}

// ─── Match label to box (asn + caseNo) ───────────────────────────────────────

async function matchToBox(
  asn: string | null,
  cartonNo: string | null,
): Promise<{ asn: string; caseNo: string; desc: string } | null> {
  if (!asn) return null

  const items = await prisma.cIPLItem.findMany({
    where: { asn },
    select: { asn: true, caseNo: true, description: true },
    take: 200,
  })
  if (!items.length) return null

  // Try to match by carton number suffix (DJI caseNo is last digits of the barcode)
  if (cartonNo) {
    const stripped = cartonNo.replace(/\D/g, '')
    for (const item of items) {
      if (!item.caseNo) continue
      const itemDigits = item.caseNo.replace(/\D/g, '')
      if (itemDigits && (stripped.endsWith(itemDigits) || itemDigits.endsWith(stripped) || itemDigits === stripped)) {
        return { asn: item.asn!, caseNo: item.caseNo, desc: item.description ?? item.caseNo }
      }
    }
  }

  // Fallback: first caseNo for this ASN
  const first = items.find(i => i.caseNo)
  if (!first?.caseNo) return null
  return { asn: first.asn!, caseNo: first.caseNo, desc: first.description ?? first.caseNo }
}

// ─── Main server action ───────────────────────────────────────────────────────

export async function analizarFotosExcel(formData: FormData): Promise<AnalysisResult> {
  try {
    const file = formData.get('file') as File | null
    if (!file) return { ok: false, error: 'Archivo requerido.' }

    const buf = new Uint8Array(await file.arrayBuffer())
    const { byRow } = extractImagesFromXlsx(buf)

    const rowIndices = [...byRow.keys()].sort((a, b) => a - b)
    const rowsForClaude = rowIndices.map(ri => ({
      rowIndex: ri,
      firstPhoto: byRow.get(ri)![0]!.base64,
      mediaType:  byRow.get(ri)![0]!.mediaType,
    }))

    const labelMap = await readLabelsFromPhotos(rowsForClaude)

    const rows: ExcelRow[] = []
    for (const rowIndex of rowIndices) {
      const photos = byRow.get(rowIndex)!
      const label = labelMap.get(rowIndex) ?? { asn: null, cartonNo: null, soNo: null, error: 'No data' }
      const match = await matchToBox(label.asn, label.cartonNo)
      rows.push({
        rowIndex,
        photos,
        aiAsn:         label.asn,
        aiCarton:      label.cartonNo,
        aiSo:          label.soNo,
        aiError:       label.error,
        matchedAsn:    match?.asn    ?? null,
        matchedCaseNo: match?.caseNo ?? null,
        matchedDesc:   match?.desc   ?? null,
      })
    }

    return { ok: true, rows }
  } catch (err) {
    console.error('[inspeccion] error:', err)
    return { ok: false, error: String(err) }
  }
}

export async function guardarAsignaciones(assignments: SaveAssignment[]): Promise<SaveResult> {
  try {
    let count = 0
    for (const { asn, caseNo, photos } of assignments) {
      if (!photos.length) continue
      // Find ALL items that share this physical box
      const items = await prisma.cIPLItem.findMany({
        where: { asn, caseNo },
        select: { id: true },
      })
      for (const item of items) {
        await prisma.cIPLPhoto.createMany({
          data: photos.map(p => ({
            ciplItemId: item.id,
            dataUrl:    `data:${p.mediaType};base64,${p.base64}`,
            rowIndex:   p.rowIndex,
            colIndex:   p.colIndex,
          })),
        })
        count += photos.length
      }
    }
    return { ok: true, count }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// Returns unique physical boxes (asn+caseNo combos) for an ASN
export async function getBoxesForAsn(asn: string): Promise<BoxOption[]> {
  const items = await prisma.cIPLItem.findMany({
    where: { asn: { contains: asn } },
    select: { asn: true, caseNo: true, description: true },
    orderBy: { caseNo: 'asc' },
    take: 500,
  })
  const seen = new Map<string, BoxOption>()
  for (const item of items) {
    if (!item.caseNo || !item.asn) continue
    const key = `${item.asn}|${item.caseNo}`
    if (seen.has(key)) {
      seen.get(key)!.itemCount++
    } else {
      seen.set(key, { asn: item.asn, caseNo: item.caseNo, desc: item.description ?? item.caseNo, itemCount: 1 })
    }
  }
  return [...seen.values()]
}
