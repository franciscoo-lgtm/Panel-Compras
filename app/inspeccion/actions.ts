'use server'

import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExcelRow = {
  rowIndex:   number
  photoCount: number
  aiAsn:      string | null
  aiCarton:   string | null
  aiSo:       string | null
  aiError:    string | null
  matchedAsn:    string | null
  matchedCaseNo: string | null
  matchedDesc:   string | null
}

export type AnalysisResult =
  | { ok: true;  rows: ExcelRow[] }
  | { ok: false; error: string }

export type BoxOption = {
  asn:       string
  caseNo:    string
  desc:      string
  itemCount: number
}

export type SaveResult =
  | { ok: true;  count: number }
  | { ok: false; error: string }

// ─── Claude label reader ──────────────────────────────────────────────────────

type FirstPhotoInput = { rowIndex: number; base64: string; mediaType: string; photoCount: number }
type LabelRead = { asn: string | null; cartonNo: string | null; soNo: string | null; error: string | null }

// ─── Batch box matching (single DB query) ────────────────────────────────────

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
        const d = item.caseNo.replace(/\D/g, '')
        return d && (stripped.endsWith(d) || d.endsWith(stripped) || d === stripped)
      })
    }
    if (!matched) matched = asnItems.find(i => i.caseNo)
    if (matched?.caseNo) {
      result.set(label.rowIndex, { asn: matched.asn!, caseNo: matched.caseNo, desc: matched.description ?? matched.caseNo })
    }
  }
  return result
}

// ─── Main analysis action (receives only first photos, extracted client-side) ─

export async function analizarLabels(
  firstPhotos: FirstPhotoInput[]
): Promise<AnalysisResult> {
  try {
    if (!firstPhotos.length) return { ok: true, rows: [] }

    // Call Claude with just the first photo of each row
    const imageContent: Anthropic.ImageBlockParam[] = firstPhotos.map(r => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: r.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: r.base64,
      },
    }))

    const promptText = `You will receive ${firstPhotos.length} photos of shipping box labels, in order.
For each photo, extract from the shipping label:
- ASN / Shipment No (出货单号): e.g. "JDS260425M0NX"
- CartonNo (箱号): the long barcode number (digits only)
- SO: the sales order number e.g. "SO09797165"

Return ONLY a JSON array with exactly ${firstPhotos.length} elements, one per photo in order:
[
  { "asn": "...", "cartonNo": "...", "soNo": "...", "error": null },
  ...
]
If a photo does not show a readable label, set all fields to null and set "error" to a short reason.`

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: [...imageContent, { type: 'text', text: promptText }] }],
    })

    const raw    = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
    const start  = raw.indexOf('['), end = raw.lastIndexOf(']')
    const parsed: LabelRead[] = start >= 0 ? JSON.parse(raw.slice(start, end + 1)) : []

    const labelMap = new Map<number, LabelRead>()
    firstPhotos.forEach((r, i) =>
      labelMap.set(r.rowIndex, parsed[i] ?? { asn: null, cartonNo: null, soNo: null, error: 'No response' })
    )

    // Batch box matching — single DB query
    const labelsForMatch = firstPhotos.map(r => {
      const l = labelMap.get(r.rowIndex)!
      return { rowIndex: r.rowIndex, asn: l.asn, cartonNo: l.cartonNo }
    })
    const matchMap = await batchMatchToBox(labelsForMatch)

    const rows: ExcelRow[] = firstPhotos.map(r => {
      const label = labelMap.get(r.rowIndex)!
      const match = matchMap.get(r.rowIndex) ?? null
      return {
        rowIndex:      r.rowIndex,
        photoCount:    r.photoCount,
        aiAsn:         label.asn,
        aiCarton:      label.cartonNo,
        aiSo:          label.soNo,
        aiError:       label.error,
        matchedAsn:    match?.asn    ?? null,
        matchedCaseNo: match?.caseNo ?? null,
        matchedDesc:   match?.desc   ?? null,
      }
    })

    return { ok: true, rows }
  } catch (err) {
    console.error('[inspeccion] analizarLabels error:', err)
    return { ok: false, error: String(err) }
  }
}

// ─── Save ONE box assignment (photos sent directly from client) ────────────────

export async function guardarUnaAsignacion(
  asn: string,
  caseNo: string,
  photos: Array<{ rowIndex: number; colIndex: number; dataUrl: string }>,
): Promise<SaveResult> {
  try {
    if (!photos.length) return { ok: true, count: 0 }

    const items = await prisma.cIPLItem.findMany({
      where: { asn, caseNo },
      select: { id: true },
    })

    let count = 0
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
