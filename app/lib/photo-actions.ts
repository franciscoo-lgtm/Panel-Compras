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
    asn?: string | null
    cartonNo?: string | null
    caseNo?: string | null
    soNo?: string | null
    modelo?: string | null
    qty?: number | null
    confidence?: 'high' | 'medium' | 'low' | null
  } | null
}

export type MatchedPhotoLight = PhotoMatchCandidateLight & {
  matchedItemId: string | null
  matchedItemDesc: string | null
  matchedItemAsn: string | null
  matchedItemSo: string | null
  matchedItemCase: string | null
  matchReason: 'asn+case' | 'asn+so' | 'asn' | 'so' | 'none'
}

/** Same as MatchedPhotoLight plus base64 (only used client-side). */
export type MatchedPhoto = MatchedPhotoLight & {
  base64: string
}

/**
 * Run AI matches against CIPLItems in DB, return enriched photos with itemId where possible.
 * The user can later override before saving.
 */
export async function matchPhotosToItems(
  candidates: PhotoMatchCandidateLight[],
): Promise<MatchedPhotoLight[]> {
  // Collect all keys we might need to look up
  const asns = new Set<string>()
  const sos = new Set<string>()
  for (const c of candidates) {
    if (c.ai?.asn) asns.add(c.ai.asn.trim().toUpperCase())
    if (c.ai?.soNo) sos.add(c.ai.soNo.trim().toUpperCase())
  }

  if (asns.size === 0 && sos.size === 0) {
    return candidates.map(c => ({
      ...c,
      matchedItemId: null,
      matchedItemDesc: null,
      matchedItemAsn: null,
      matchedItemSo: null,
      matchedItemCase: null,
      matchReason: 'none' as const,
    }))
  }

  const items = await prisma.cIPLItem.findMany({
    where: {
      OR: [
        ...(asns.size > 0 ? [{ asn: { in: Array.from(asns) } }] : []),
        ...(sos.size > 0  ? [{ soPrincipal: { in: Array.from(sos) } }] : []),
      ],
    },
    select: { id: true, asn: true, soPrincipal: true, caseNo: true, description: true },
  })

  // Index items for fast lookup
  const byAsnCase = new Map<string, typeof items[number]>()
  const byAsn = new Map<string, typeof items[number][]>()
  const bySo = new Map<string, typeof items[number][]>()
  for (const it of items) {
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

  return candidates.map(c => {
    const ai = c.ai
    if (!ai) {
      return {
        ...c,
        matchedItemId: null, matchedItemDesc: null, matchedItemAsn: null,
        matchedItemSo: null, matchedItemCase: null, matchReason: 'none' as const,
      }
    }

    const asnUp = ai.asn?.trim().toUpperCase() ?? null
    const caseUp = (ai.cartonNo ?? ai.caseNo)?.trim().toUpperCase() ?? null
    const soUp = ai.soNo?.trim().toUpperCase() ?? null

    // Try asn + case (highest precision)
    if (asnUp && caseUp) {
      const hit = byAsnCase.get(`${asnUp}|${caseUp}`)
      if (hit) {
        return {
          ...c,
          matchedItemId: hit.id, matchedItemDesc: hit.description,
          matchedItemAsn: hit.asn, matchedItemSo: hit.soPrincipal, matchedItemCase: hit.caseNo,
          matchReason: 'asn+case' as const,
        }
      }
    }
    // Try asn + so
    if (asnUp && soUp) {
      const asnItems = byAsn.get(asnUp)
      const hit = asnItems?.find(i => i.soPrincipal?.trim().toUpperCase() === soUp)
      if (hit) {
        return {
          ...c,
          matchedItemId: hit.id, matchedItemDesc: hit.description,
          matchedItemAsn: hit.asn, matchedItemSo: hit.soPrincipal, matchedItemCase: hit.caseNo,
          matchReason: 'asn+so' as const,
        }
      }
    }
    // Try asn alone (pick first)
    if (asnUp) {
      const hit = byAsn.get(asnUp)?.[0]
      if (hit) {
        return {
          ...c,
          matchedItemId: hit.id, matchedItemDesc: hit.description,
          matchedItemAsn: hit.asn, matchedItemSo: hit.soPrincipal, matchedItemCase: hit.caseNo,
          matchReason: 'asn' as const,
        }
      }
    }
    // Try so alone (pick first)
    if (soUp) {
      const hit = bySo.get(soUp)?.[0]
      if (hit) {
        return {
          ...c,
          matchedItemId: hit.id, matchedItemDesc: hit.description,
          matchedItemAsn: hit.asn, matchedItemSo: hit.soPrincipal, matchedItemCase: hit.caseNo,
          matchReason: 'so' as const,
        }
      }
    }

    return {
      ...c,
      matchedItemId: null, matchedItemDesc: null, matchedItemAsn: null,
      matchedItemSo: null, matchedItemCase: null, matchReason: 'none' as const,
    }
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
