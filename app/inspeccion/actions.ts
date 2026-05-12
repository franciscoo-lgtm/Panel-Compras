'use server'

import Anthropic from '@anthropic-ai/sdk'
import { unzipSync } from 'fflate'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Types ────────────────────────────────────────────────────────────────────

// PhotoEntry with base64 is only used internally during analysis; never sent to client
type PhotoEntry = { colIndex: number; base64: string; mediaType: string }

export type ExcelRow = {
  rowIndex:   number
  photoCount: number          // how many photos were stored for this row
  // AI-read label data
  aiAsn:    string | null
  aiCarton: string | null
  aiSo:     string | null
  aiError:  string | null
  // Box-level match (asn + caseNo identifies the physical box)
  matchedAsn:    string | null
  matchedCaseNo: string | null
  matchedDesc:   string | null
}

export type AnalysisResult =
  | { ok: true;  rows: ExcelRow[]; sessionId: string }
  | { ok: false; error: string }

export type BoxOption = {
  asn:       string
  caseNo:    string
  desc:      string
  itemCount: number
}

// Box-level assignment: references stored photos by sessionId + rowIndex
export type SaveAssignment = {
  asn:      string
  caseNo:   string
  rowIndex: number
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
  return 'image/jpeg'
}

function extractImagesFromXlsx(buf: Uint8Array): { byRow: Map<number, PhotoEntry[]> } {
  const files = unzipSync(buf)

  const drawingXml = new TextDecoder().decode(files['xl/drawings/drawing1.xml'])
  const relsXml    = new TextDecoder().decode(files['xl/drawings/_rels/drawing1.xml.rels'])

  const ridToFile: Record<string, string> = {}
  const rRe = /Id="(rId\d+)"[^>]*Target="\.\.\/media\/(image\d+\.\w+)"/g
  let rm: RegExpExecArray | null
  while ((rm = rRe.exec(relsXml)) !== null) ridToFile[rm[1]] = rm[2]

  const byRow = new Map<number, PhotoEntry[]>()
  const anchorRe = /<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g
  let am: RegExpExecArray | null
  while ((am = anchorRe.exec(drawingXml)) !== null) {
    const block   = am[0]
    const fromRow = parseInt((block.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/) || [])[1] ?? '0')
    const fromCol = parseInt((block.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/) || [])[1] ?? '0')
    const rid     = (block.match(/r:embed="(rId\d+)"/) || [])[1]
    if (!rid) continue
    const imgFile = ridToFile[rid]
    if (!imgFile) continue
    const imgBuf = files[`xl/media/${imgFile}`]
    if (!imgBuf) continue
    const base64    = Buffer.from(imgBuf).toString('base64')
    const mediaType = detectMediaType(imgBuf)
    if (!byRow.has(fromRow)) byRow.set(fromRow, [])
    byRow.get(fromRow)!.push({ colIndex: fromCol, base64, mediaType })
  }

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
    source: { type: 'base64' as const, media_type: r.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: r.firstPhoto },
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
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: [...imageContent, { type: 'text', text: promptText }] }],
  })

  const raw   = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
  const start = raw.indexOf('['), end = raw.lastIndexOf(']')
  const parsed: LabelRead[] = start >= 0 ? JSON.parse(raw.slice(start, end + 1)) : []

  const result = new Map<number, LabelRead>()
  rows.forEach((r, i) => result.set(r.rowIndex, parsed[i] ?? { asn: null, cartonNo: null, soNo: null, error: 'No response' }))
  return result
}

// ─── Match labels to boxes (batched single query) ────────────────────────────

async function batchMatchToBox(
  labels: Array<{ rowIndex: number; asn: string | null; cartonNo: string | null }>
): Promise<Map<number, { asn: string; caseNo: string; desc: string }>> {
  const asns = [...new Set(labels.map(l => l.asn).filter((a): a is string => !!a))]
  if (!asns.length) return new Map()

  const items = await prisma.cIPLItem.findMany({
    where: { asn: { in: asns } },
    select: { asn: true, caseNo: true, description: true },
    take: 2000,
  })

  const result = new Map<number, { asn: string; caseNo: string; desc: string }>()
  for (const label of labels) {
    if (!label.asn) continue
    const asnItems = items.filter(i => i.asn === label.asn)
    if (!asnItems.length) continue

    let matched: typeof asnItems[0] | undefined
    if (label.cartonNo) {
      const stripped = label.cartonNo.replace(/\D/g, '')
      matched = asnItems.find(item => {
        if (!item.caseNo) return false
        const itemDigits = item.caseNo.replace(/\D/g, '')
        return itemDigits && (stripped.endsWith(itemDigits) || itemDigits.endsWith(stripped) || itemDigits === stripped)
      })
    }
    if (!matched) matched = asnItems.find(i => i.caseNo)
    if (matched?.caseNo) {
      result.set(label.rowIndex, { asn: matched.asn!, caseNo: matched.caseNo, desc: matched.description ?? matched.caseNo })
    }
  }
  return result
}

// ─── Main server action ───────────────────────────────────────────────────────

export async function analizarFotosExcel(formData: FormData): Promise<AnalysisResult> {
  try {
    const file = formData.get('file') as File | null
    if (!file) return { ok: false, error: 'Archivo requerido.' }

    const buf       = new Uint8Array(await file.arrayBuffer())
    const { byRow } = extractImagesFromXlsx(buf)

    const rowIndices   = [...byRow.keys()].sort((a, b) => a - b)
    const rowsForClaude = rowIndices.map(ri => ({
      rowIndex:   ri,
      firstPhoto: byRow.get(ri)![0]!.base64,
      mediaType:  byRow.get(ri)![0]!.mediaType,
    }))

    // Run Claude and DB photo save in parallel
    const sessionId = randomUUID()
    const allPhotoRecords = rowIndices.flatMap(ri =>
      (byRow.get(ri) ?? []).map(p => ({
        sessionId,
        rowIndex: ri,
        colIndex: p.colIndex,
        dataUrl:  `data:${p.mediaType};base64,${p.base64}`,
      }))
    )

    const [labelMap] = await Promise.all([
      readLabelsFromPhotos(rowsForClaude),
      allPhotoRecords.length
        ? prisma.inspeccionTemp.createMany({ data: allPhotoRecords })
        : Promise.resolve(),
    ])

    // Batch box matching — single DB query for all ASNs
    const labelsForMatch = rowIndices.map(ri => {
      const label = labelMap.get(ri) ?? { asn: null, cartonNo: null, soNo: null, error: 'No data' }
      return { rowIndex: ri, asn: label.asn, cartonNo: label.cartonNo }
    })
    const matchMap = await batchMatchToBox(labelsForMatch)

    const rows: ExcelRow[] = rowIndices.map(rowIndex => {
      const photos = byRow.get(rowIndex)!
      const label  = labelMap.get(rowIndex) ?? { asn: null, cartonNo: null, soNo: null, error: 'No data' }
      const match  = matchMap.get(rowIndex) ?? null
      return {
        rowIndex,
        photoCount:    photos.length,
        aiAsn:         label.asn,
        aiCarton:      label.cartonNo,
        aiSo:          label.soNo,
        aiError:       label.error,
        matchedAsn:    match?.asn    ?? null,
        matchedCaseNo: match?.caseNo ?? null,
        matchedDesc:   match?.desc   ?? null,
      }
    })

    return { ok: true, rows, sessionId }
  } catch (err) {
    console.error('[inspeccion] error:', err)
    return { ok: false, error: String(err) }
  }
}

// Returns photos for a specific row (called lazily when user expands a row)
export async function getPhotosForRow(
  sessionId: string,
  rowIndex: number,
): Promise<Array<{ colIndex: number; dataUrl: string }>> {
  const records = await prisma.inspeccionTemp.findMany({
    where: { sessionId, rowIndex },
    orderBy: { colIndex: 'asc' },
    select: { colIndex: true, dataUrl: true },
  })
  return records
}

export async function guardarAsignaciones(
  sessionId: string,
  assignments: SaveAssignment[],
): Promise<SaveResult> {
  try {
    let count = 0
    for (const { asn, caseNo, rowIndex } of assignments) {
      const photos = await prisma.inspeccionTemp.findMany({
        where: { sessionId, rowIndex },
        orderBy: { colIndex: 'asc' },
      })
      if (!photos.length) continue

      const items = await prisma.cIPLItem.findMany({
        where: { asn, caseNo },
        select: { id: true },
      })
      for (const item of items) {
        await prisma.cIPLPhoto.createMany({
          data: photos.map(p => ({
            ciplItemId: item.id,
            dataUrl:    p.dataUrl,
            rowIndex:   p.rowIndex,
            colIndex:   p.colIndex,
          })),
        })
        count += photos.length
      }
    }

    // Clean up temp records for this session
    await prisma.inspeccionTemp.deleteMany({ where: { sessionId } })

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
