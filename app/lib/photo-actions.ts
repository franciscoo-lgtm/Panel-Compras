'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import {
  getDriveAccessToken,
  driveFindOrCreateFolder,
  driveUploadBytes,
  decodeDataUrl,
} from '@/app/lib/drive-auth'

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
      // 3. partial match (algunos casos el barcode incluye guion: "...761-8" vs "...761")
      if (cartonUp) {
        for (const [storedCase, item] of byCarton) {
          // Compare digits only (ignore dashes / formatting)
          const a = cartonUp.replace(/[^A-Z0-9]/g, '')
          const b = storedCase.replace(/[^A-Z0-9]/g, '')
          if (a.length >= 10 && b.length >= 10 && (a === b || a.startsWith(b) || b.startsWith(a))) {
            return hit(c, item, 'box-carton')
          }
        }
      }
      // Si hay cartonNo detectado pero no matcheó, NO hacer fallback a ASN
      // (es engañoso — sugiere un ítem cuyo carton es DISTINTO al detectado).
      // Mejor dejar sin match para que el usuario decida.
      if (cartonUp) return none(c)

      // Sin cartonNo detectado (caja sin número legible): aceptar fallback
      // a ASN como "mejor adivinanza".
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
 * Persiste fotos a Drive + DB. Para cada foto:
 * 1. Decodifica el dataUrl (base64) a buffer
 * 2. Sube el buffer a Drive en una carpeta por ASN
 * 3. Guarda el link de Drive en CIPLPhoto.driveLink
 *
 * Fotos sin itemId, sin dataUrl válido, o que fallen el upload se
 * saltean. El resultado reporta cuántas se guardaron y errores
 * individuales si los hubo. Si Drive no está configurado, las fotos
 * se guardan con dataUrl como fallback (compat con setups viejos).
 */
export async function saveCIPLPhotos(
  photos: PhotoToSave[],
): Promise<{ ok: true; saved: number; errors?: string[] } | { ok: false; error: string }> {
  try {
    const valid = photos.filter(p => p.ciplItemId && p.dataUrl)
    if (valid.length === 0) return { ok: true, saved: 0 }

    // Lookup ASN + SO de cada ciplItem para nombrar el archivo y elegir folder.
    const itemIds = [...new Set(valid.map(p => p.ciplItemId))]
    const items = await prisma.cIPLItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, asn: true, soPrincipal: true, caseNo: true },
    })
    const itemInfo = new Map(items.map(i => [i.id, i] as const))

    // Drive setup: si falta config, fallback a guardar dataUrl (no rompe nada).
    const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
    const driveConfigured = !!(rootId && process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)

    if (!driveConfigured) {
      console.warn('[saveCIPLPhotos] Drive no configurado — guardando fotos como base64 inline')
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
    }

    const token = await getDriveAccessToken()

    // Carpeta dedicada: <root>/Inspeccion-Fotos/<ASN>
    const inspeccionFolderId = await driveFindOrCreateFolder(token, 'Inspeccion-Fotos', rootId!)
    const folderByAsn = new Map<string, string>()

    const errors: string[] = []
    const rows: { ciplItemId: string; driveLink: string; rowIndex: number; colIndex: number }[] = []

    for (const p of valid) {
      try {
        const decoded = decodeDataUrl(p.dataUrl)
        if (!decoded) {
          errors.push(`Foto rowIndex=${p.rowIndex}: dataUrl inválido`)
          continue
        }

        const info = itemInfo.get(p.ciplItemId)
        const asnKey = (info?.asn ?? 'sin-asn').trim() || 'sin-asn'

        let asnFolder = folderByAsn.get(asnKey)
        if (!asnFolder) {
          asnFolder = await driveFindOrCreateFolder(token, asnKey.replace(/[/\\?%*:|"<>]/g, '-'), inspeccionFolderId)
          folderByAsn.set(asnKey, asnFolder)
        }

        const ext = decoded.mimeType.split('/')[1] ?? 'jpg'
        const fileName = `${asnKey}_r${p.rowIndex}c${p.colIndex}_${Date.now()}.${ext}`

        const uploaded = await driveUploadBytes(
          token, decoded.bytes, fileName, decoded.mimeType, asnFolder,
          { makePublic: true },
        )
        rows.push({
          ciplItemId: p.ciplItemId,
          // Guardamos la URL de thumbnail (renderea directo en <img src>).
          // El webViewLink se puede reconstruir desde el id si hace falta.
          driveLink: uploaded.thumbnailUrl,
          rowIndex: p.rowIndex,
          colIndex: p.colIndex,
        })
      } catch (err) {
        errors.push(`Foto rowIndex=${p.rowIndex}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (rows.length === 0) {
      return { ok: false, error: errors.join(' | ') || 'No se subieron fotos a Drive' }
    }

    await prisma.cIPLPhoto.createMany({ data: rows })

    revalidatePath('/embarques', 'layout')
    return { ok: true, saved: rows.length, ...(errors.length > 0 ? { errors } : {}) }
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
