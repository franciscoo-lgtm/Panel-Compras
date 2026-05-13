'use server'

import { prisma } from '@/lib/prisma'

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

// ─── Input type from edge route ──────────────────────────────────────────────

type LabelInput = {
  rowIndex:   number
  photoCount: number
  asn:        string | null
  cartonNo:   string | null
  soNo:       string | null
  error:      string | null
}

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
      // 1. Exact numeric match (most precise)
      matched = asnItems.find(item => {
        if (!item.caseNo) return false
        return item.caseNo.replace(/\D/g, '') === stripped
      })
      // 2. The caseNo may have a "-N" suffix (e.g. "7312...166-1") — strip suffix digit and retry
      if (!matched) {
        matched = asnItems.find(item => {
          if (!item.caseNo) return false
          const d = item.caseNo.replace(/\D/g, '')
          // d ends with the suffix number, stripped is the barcode without it
          return d.startsWith(stripped) || stripped.startsWith(d.slice(0, -1))
        })
      }
      // 3. Ends-with match as last resort (only if unique — avoids wrong fallback)
      if (!matched) {
        const candidates = asnItems.filter(item => {
          if (!item.caseNo) return false
          const d = item.caseNo.replace(/\D/g, '')
          return d && (d.endsWith(stripped) || stripped.endsWith(d))
        })
        if (candidates.length === 1) matched = candidates[0]
      }
    }
    // NO fallback — if no match, leave unassigned so user picks manually
    if (matched?.caseNo) {
      result.set(label.rowIndex, { asn: matched.asn!, caseNo: matched.caseNo, desc: matched.description ?? matched.caseNo })
    }
  }
  return result
}

// ─── Match Claude labels to DB boxes ─────────────────────────────────────────
// Called after the edge route returns Claude's label readings.

export async function matchLabelsToDB(labels: LabelInput[]): Promise<AnalysisResult> {
  try {
    if (!labels.length) return { ok: true, rows: [] }

    const matchMap = await batchMatchToBox(
      labels.map(l => ({ rowIndex: l.rowIndex, asn: l.asn, cartonNo: l.cartonNo }))
    )

    const rows: ExcelRow[] = labels.map(l => {
      const match = matchMap.get(l.rowIndex) ?? null
      return {
        rowIndex:      l.rowIndex,
        photoCount:    l.photoCount,
        aiAsn:         l.asn,
        aiCarton:      l.cartonNo,
        aiSo:          l.soNo,
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

// ─── Returns unique physical boxes (asn+caseNo combos) for an ASN ─────────────

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
