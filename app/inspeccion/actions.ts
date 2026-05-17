'use server'

import { prisma } from '@/lib/prisma'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExcelRow = {
  rowIndex:     number
  colIndex:     number               // column within the Excel row (0 = first photo)
  photoCount:   number               // total photos in this Excel row
  aiAsn:        string | null
  aiCarton:     string | null
  aiCaseNo:     string | null        // direct PL match from Claude
  aiSo:         string | null
  aiConfidence: 'high' | 'medium' | 'low' | null
  aiNote:       string | null
  aiError:      string | null
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

export type PLItemForInspection = {
  caseNo:      string
  description: string | null
  qty:         number | null
  gwKg:        number | null
}

// ─── Input type from edge route ──────────────────────────────────────────────

type LabelInput = {
  rowIndex:    number
  colIndex:    number
  photoCount:  number
  asn:         string | null
  cartonNo:    string | null
  caseNo:      string | null
  soNo:        string | null
  confidence:  'high' | 'medium' | 'low' | null
  note:        string | null
  error:       string | null
}

// ─── Get PL items for a given ASN (used for inspection context) ───────────────

export async function getPLItemsForInspection(asn: string): Promise<PLItemForInspection[]> {
  const items = await prisma.cIPLItem.findMany({
    where: { asn: { contains: asn.trim() } },
    select: { caseNo: true, description: true, qty: true, gwKg: true },
    orderBy: [{ createdAt: 'desc' }, { sortOrder: 'asc' }],
    take: 500,
  })
  // One entry per unique caseNo (primary row), in PL order
  const seen = new Set<string>()
  const result: PLItemForInspection[] = []
  for (const item of items) {
    if (!item.caseNo) continue
    if (seen.has(item.caseNo)) continue
    seen.add(item.caseNo)
    result.push({ caseNo: item.caseNo, description: item.description, qty: item.qty, gwKg: item.gwKg })
  }
  return result
}

// ─── Batch box matching (single DB query) ────────────────────────────────────

// Composite key for per-photo matching
const photoKey = (rowIndex: number, colIndex: number) => `${rowIndex}_${colIndex}`

async function batchMatchToBox(
  labels: Array<{ rowIndex: number; colIndex: number; asn: string | null; cartonNo: string | null; caseNo: string | null }>
): Promise<Map<string, { asn: string; caseNo: string; desc: string }>> {
  const directCaseNos = labels.map(l => l.caseNo).filter((c): c is string => !!c)
  const asns = [...new Set(labels.map(l => l.asn).filter((a): a is string => !!a))]

  if (!directCaseNos.length && !asns.length) return new Map()

  const items = await prisma.cIPLItem.findMany({
    where: {
      OR: [
        ...(directCaseNos.length ? [{ caseNo: { in: directCaseNos } }] : []),
        ...(asns.length ? [{ asn: { in: asns } }] : []),
      ],
    },
    select: { asn: true, caseNo: true, description: true, piNo: true },
    take: 2000,
  })

  const result = new Map<string, { asn: string; caseNo: string; desc: string }>()

  for (const label of labels) {
    const key = photoKey(label.rowIndex, label.colIndex)

    if (label.caseNo) {
      // Claude returned a caseNo — try exact match, then partial numeric match
      let item = items.find(i => i.caseNo === label.caseNo)
      // Also try matching against piNo (barcode may correspond to piNo in DB)
      if (!item) {
        const stripped = label.caseNo.replace(/\D/g, '')
        item = items.find(i => {
          const p = (i.piNo ?? '').replace(/\D/g, '')
          return p && stripped && (p.includes(stripped) || stripped.includes(p))
        })
      }
      if (item?.caseNo && item?.asn) {
        result.set(key, { asn: item.asn, caseNo: item.caseNo, desc: item.description ?? item.caseNo })
      }
      continue
    }

    // Legacy: match by carton barcode string against caseNo
    if (!label.asn) continue
    const asnItems = items.filter(i => i.asn === label.asn)
    if (!asnItems.length) continue
    if (!label.cartonNo) continue
    const stripped = label.cartonNo.replace(/\D/g, '')

    let matched: typeof asnItems[0] | undefined
    // 1. Exact numeric match
    matched = asnItems.find(item => item.caseNo?.replace(/\D/g, '') === stripped)
    // 2. Prefix/suffix
    if (!matched) {
      matched = asnItems.find(item => {
        const d = item.caseNo?.replace(/\D/g, '') ?? ''
        return d && (d.startsWith(stripped) || stripped.startsWith(d.slice(0, -1)))
      })
    }
    // 3. Ends-with (unique only)
    if (!matched) {
      const candidates = asnItems.filter(item => {
        const d = item.caseNo?.replace(/\D/g, '') ?? ''
        return d && (d.endsWith(stripped) || stripped.endsWith(d))
      })
      if (candidates.length === 1) matched = candidates[0]
    }

    if (matched?.caseNo) {
      result.set(key, { asn: matched.asn!, caseNo: matched.caseNo, desc: matched.description ?? matched.caseNo })
    }
  }

  return result
}

// ─── Match Claude labels to DB boxes ─────────────────────────────────────────

export async function matchLabelsToDB(labels: LabelInput[]): Promise<AnalysisResult> {
  try {
    if (!labels.length) return { ok: true, rows: [] }

    const matchMap = await batchMatchToBox(
      labels.map(l => ({ rowIndex: l.rowIndex, colIndex: l.colIndex, asn: l.asn, cartonNo: l.cartonNo, caseNo: l.caseNo }))
    )

    const rows: ExcelRow[] = labels.map(l => {
      const match = matchMap.get(photoKey(l.rowIndex, l.colIndex)) ?? null
      return {
        rowIndex:      l.rowIndex,
        colIndex:      l.colIndex,
        photoCount:    l.photoCount,
        aiAsn:         l.asn,
        aiCarton:      l.cartonNo,
        aiCaseNo:      l.caseNo,
        aiSo:          l.soNo,
        aiConfidence:  l.confidence,
        aiNote:        l.note,
        aiError:       l.error,
        matchedAsn:    match?.asn    ?? null,
        matchedCaseNo: match?.caseNo ?? null,
        matchedDesc:   match?.desc   ?? null,
      }
    })

    return { ok: true, rows }
  } catch (err) {
    console.error('[inspeccion] matchLabelsToDB error:', err)
    return { ok: false, error: String(err) }
  }
}

// ─── Save ONE box assignment ──────────────────────────────────────────────────

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

// ─── Returns unique physical boxes for an ASN ────────────────────────────────

export async function getBoxesForAsn(asn: string): Promise<BoxOption[]> {
  const items = await prisma.cIPLItem.findMany({
    where: { asn: { contains: asn } },
    select: { asn: true, caseNo: true, description: true },
    orderBy: [{ createdAt: 'desc' }, { sortOrder: 'asc' }],
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
