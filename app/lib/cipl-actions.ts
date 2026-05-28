'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getDriveAccessToken, deleteDriveFile, extractDriveFileId } from '@/app/lib/drive-auth'

export type DeleteCIPLResult = {
  ok: boolean
  itemsDeleted: number
  photosDeleted: number
  driveFilesDeleted: number
  driveErrors: string[]
  asn: string
  error?: string
}

/**
 * Elimina TODOS los CIPLItems de un ASN:
 * 1. Recolecta los drive links únicos (Excel/CI/PL)
 * 2. Borra los archivos de Google Drive (silenciando 404)
 * 3. Borra los CIPLItems del DB (cascade borra CIPLPhoto, libera FK a Compra)
 * 4. Revalida los paths afectados
 *
 * No toca otros CIPLItems que no compartan el ASN. La vinculación con Compra
 * se libera automáticamente (los CIPLItem.compraId desaparecen junto con el row).
 */
export async function deleteCIPLByAsn(asn: string): Promise<DeleteCIPLResult> {
  const result: DeleteCIPLResult = {
    ok: false,
    itemsDeleted: 0,
    photosDeleted: 0,
    driveFilesDeleted: 0,
    driveErrors: [],
    asn,
  }

  if (!asn.trim()) {
    result.error = 'ASN vacío'
    return result
  }

  try {
    // 1. Encontrar todos los items del ASN
    const items = await prisma.cIPLItem.findMany({
      where: { asn: asn.trim() },
      select: {
        id: true,
        driveLinkExcel: true,
        driveLinkCi: true,
        driveLinkPl: true,
        _count: { select: { photos: true } },
      },
    })

    if (items.length === 0) {
      result.error = `No hay items con ASN "${asn}"`
      return result
    }

    // 2. Recolectar drive file IDs únicos
    const fileIds = new Set<string>()
    for (const it of items) {
      for (const link of [it.driveLinkExcel, it.driveLinkCi, it.driveLinkPl]) {
        const id = extractDriveFileId(link)
        if (id) fileIds.add(id)
      }
    }

    // 3. Borrar de Drive (no abortar si falla, solo log)
    if (fileIds.size > 0) {
      try {
        const token = await getDriveAccessToken()
        for (const id of fileIds) {
          const r = await deleteDriveFile(id, token)
          if (r.ok) {
            result.driveFilesDeleted++
          } else {
            result.driveErrors.push(`${id}: ${r.error}`)
          }
        }
      } catch (err) {
        // Si el auth de Drive falla, registramos pero seguimos con el borrado de DB
        result.driveErrors.push(`Drive auth: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // 4. Borrar items de DB (cascade borra CIPLPhoto)
    const photosCount = items.reduce((s, i) => s + i._count.photos, 0)
    const del = await prisma.cIPLItem.deleteMany({
      where: { asn: asn.trim() },
    })

    result.itemsDeleted = del.count
    result.photosDeleted = photosCount
    result.ok = true

    // 5. Revalidar paths
    revalidatePath('/embarques', 'layout')
    revalidatePath('/compras',   'layout')
    revalidatePath('/',          'page')

    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    return result
  }
}
