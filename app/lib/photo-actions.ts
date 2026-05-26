'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export type PhotoToSave = {
  ciplItemId: string
  dataUrl: string
  rowIndex: number
  colIndex: number
}

/**
 * Light candidate for the matching server action — does NOT include base64 to stay
 * under the 1MB server-action body limit. The client keeps base64 locally and stitches
 * it back into the matched result after the server call returns.
 */
export type PhotoMatchCandidateLight = {
  rowIndex: number
  colIndex: number
  mediaType: string
  ai?: {
    labelType?: 'box' | 'part' | 'unknown' | null
    asn?: string | null
    cartonNo?: string | null
    caseNo?: string | null
    soNo?: string | null
    modelo?: string | null
    qty?: number | null
    partCode?: string | null
    partDescription?: string | null
    partQty?: number | null
    confidence?: 'high' | 'medium' | 'low' | null
  } | null
}

export type MatchReason =
  | 'box-carton'        // box label → caseNo == cartonNo
  | 'part-code'         // part label → codeEan == partCode
  | 'part-desc'         // part label → description fuzzy match
  | 'asn+case'
  | 'asn+so'
  | 'asn'
  | 'so'
  | 'none'

export type MatchedPhotoLight = PhotoMatchCandidateLight & {
  matchedItemId: string | null
  matchedItemDesc: string | null
  matchedItemAsn: string | null
  matchedItemSo: string | null
  matchedItemCase: string | null
  matchReason: MatchReason
}

/** Same as MatchedPhotoLight plus base64 (only used client-side). */
export type MatchedPhoto = MatchedPhotoLight & {
  base64: string
}

/**
 * Run AI matches against CIPLItems in DB, return enriched photos with itemId where possible.
 * The user can later override before saving.
 */
function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3)
}

function fuzzyScore(query: string, target: string): number {
  if (!query || !target) return 0
  const qt = tokens(query)
  const tt = tokens(target)
  if (qt.length === 0 || tt.length === 0) return 0
  let hits = 0
  for (const q of qt) if (tt.some(t => t.includes(q) || q.includes(t))) hits++
  return hits / qt.length
}

export async function matchPhotosToItems(
  candidates: PhotoMatchCandidateLight[],
): Promise<MatchedPhotoLight[]> {
  // Pull a wide net of CIPLItems — recent loads, all fields needed for matching
  const items = await prisma.cIPLItem.findMany({
    select: { id: true, asn: true, soPrincipal: true, caseNo: true, description: true, codeEan: true },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  })

  // Index items for fast lookup
  const byCarton = new Map<string, typeof items[number]>()
  const byCode = new Map<string, typeof items[number]>()
  const byAsnCase = new Map<string, typeof items[number]>()
  const byAsn = new Map<string, typeof items[number][]>()
  const bySo = new Map<string, typeof items[number][]>()

  for (const it of items) {
    if (it.caseNo) {
      byCarton.set(it.caseNo.trim().toUpperCase(), it)
    }
    if (it.codeEan) {
      byCode.set(it.codeEan.trim().toUpperCase(), it)
    }
    if (it.asn) {
      const a = it.asn.trim().toUpperCase()
      if (!byAsn.has(a)) byAsn.set(a, [])
      byAsn.get(a)!.push(it)
      if (it.caseNo) {
        const ac = `${a}|${it.caseNo.trim().toUpperCase()}`
        byAsnCase.set(ac, it)
      }
    }
    if (it.soPrincipal) {
      const s = it.soPrincipal.trim().toUpperCase()
      if (!bySo.has(s)) bySo.set(s, [])
      bySo.get(s)!.push(it)
    }
  }

  function none(c: PhotoMatchCandidateLight): MatchedPhotoLight {
    return {
      ...c,
      matchedItemId: null, matchedItemDesc: null, matchedItemAsn: null,
      matchedItemSo: null, matchedItemCase: null, matchReason: 'none',
    }
  }
  function hit(c: PhotoMatchCandidateLight, it: typeof items[number], reason: MatchReason): MatchedPhotoLight {
    return {
      ...c,
      matchedItemId: it.id, matchedItemDesc: it.description,
      matchedItemAsn: it.asn, matchedItemSo: it.soPrincipal, matchedItemCase: it.caseNo,
      matchReason: reason,
    }
  }

  return candidates.map(c => {
    const ai = c.ai
    if (!ai) return none(c)

    const labelType = ai.labelType ?? 'unknown'
    const asnUp = ai.asn?.trim().toUpperCase() ?? null
    const cartonUp = ai.cartonNo?.trim().toUpperCase() ?? null
    const caseUp = ai.caseNo?.trim().toUpperCase() ?? null
    const soUp = ai.soNo?.trim().toUpperCase() ?? null
    const partCodeUp = ai.partCode?.trim().toUpperCase() ?? null

    // ── BOX: priorizar match por número de caja ───────────────────────────────
    if (labelType === 'box') {
      // 1. carton number exact match against caseNo
      if (cartonUp) {
        const h = byCarton.get(cartonUp)
        if (h) return hit(c, h, 'box-carton')
      }
      // 2. caseNo extra (a veces IA pone también caseNo)
      if (caseUp) {
        const h = byCarton.get(caseUp)
        if (h) return hit(c, h, 'box-carton')
      }
      // 3. fall back: asn + case
      if (asnUp && cartonUp) {
        const h = byAsnCase.get(`${asnUp}|${cartonUp}`)
        if (h) return hit(c, h, 'asn+case')
      }
      // 4. fall back: asn solo (cualquier item del ASN)
      if (asnUp) {
        const h = byAsn.get(asnUp)?.[0]
        if (h) return hit(c, h, 'asn')
      }
      return none(c)
    }

    // ── PART: match por código exacto, luego descripción fuzzy ────────────────
    if (labelType === 'part') {
      // 1. EAN/SKU exact match
      if (partCodeUp) {
        const h = byCode.get(partCodeUp)
        if (h) return hit(c, h, 'part-code')
      }
      // 2. fuzzy match by description within ASN scope (if known)
      if (ai.partDescription) {
        const candidates = asnUp ? (byAsn.get(asnUp) ?? []) : items
        let best: { it: typeof items[number]; score: number } | null = null
        for (const it of candidates) {
          if (!it.description) continue
          const score = fuzzyScore(ai.partDescription, it.description)
          if (score >= 0.5 && (!best || score > best.score)) best = { it, score }
        }
        if (best) return hit(c, best.it, 'part-desc')
      }
      // 3. SO match
      if (soUp) {
        const h = bySo.get(soUp)?.[0]
        if (h) return hit(c, h, 'so')
      }
      // 4. ASN match
      if (asnUp) {
        const h = byAsn.get(asnUp)?.[0]
        if (h) return hit(c, h, 'asn')
      }
      return none(c)
    }

    // ── UNKNOWN / fallback: lógica genérica anterior ──────────────────────────
    if (partCodeUp) {
      const h = byCode.get(partCodeUp)
      if (h) return hit(c, h, 'part-code')
    }
    if (cartonUp) {
      const h = byCarton.get(cartonUp)
      if (h) return hit(c, h, 'box-carton')
    }
    if (asnUp && cartonUp) {
      const h = byAsnCase.get(`${asnUp}|${cartonUp}`)
      if (h) return hit(c, h, 'asn+case')
    }
    if (asnUp && soUp) {
      const asnItems = byAsn.get(asnUp)
      const h = asnItems?.find(i => i.soPrincipal?.trim().toUpperCase() === soUp)
      if (h) return hit(c, h, 'asn+so')
    }
    if (asnUp) {
      const h = byAsn.get(asnUp)?.[0]
      if (h) return hit(c, h, 'asn')
    }
    if (soUp) {
      const h = bySo.get(soUp)?.[0]
      if (h) return hit(c, h, 'so')
    }
    return none(c)
  })
}

/**
 * Persist photos to DB. Photos without itemId are skipped.
 */
export async function saveCIPLPhotos(
  photos: PhotoToSave[],
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  try {
    const valid = photos.filter(p => p.ciplItemId && p.dataUrl)
    if (valid.length === 0) return { ok: true, saved: 0 }

    await prisma.cIPLPhoto.createMany({
      data: valid.map(p => ({
        ciplItemId: p.ciplItemId,
        dataUrl: p.dataUrl,
        rowIndex: p.rowIndex,
        colIndex: p.colIndex,
      })),
    })

    revalidatePath('/embarques', 'layout')
    return { ok: true, saved: valid.length }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Return all CIPLItems with their summary (used for manual override in the photo upload UI).
 */
export async function listAllItemsForPhotoAssignment(): Promise<
  { id: string; asn: string | null; soPrincipal: string | null; caseNo: string | null; description: string | null }[]
> {
  return prisma.cIPLItem.findMany({
    select: { id: true, asn: true, soPrincipal: true, caseNo: true, description: true },
    orderBy: [{ createdAt: 'desc' }],
    take: 1000,
  })
}
