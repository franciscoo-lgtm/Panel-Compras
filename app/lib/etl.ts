'use server'

import { prisma } from '@/lib/prisma'
import { buildGSOMap } from '@/app/lib/sheets'
import {
  getDriveAccessToken,
  deleteDriveFile,
  extractDriveFileId,
} from '@/app/lib/drive-auth'

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

export type SaveResult =
  | { success: true;  count: number }
  | { success: false; error: string }

export type SOSuggestion = { so: string; reason: string; confidence?: 'high' | 'medium' | 'low' } | null
export type SOSuggestionResult = { suggestions: SOSuggestion[]; error?: string; soCount: number }

export async function guardarCIPL(formData: FormData): Promise<SaveResult> {
  try {
    const items         = JSON.parse(formData.get('items')         as string) as ExtractedItem[]
    const sosPrincipal  = JSON.parse(formData.get('sosPrincipal')  as string) as string[]
    const sosSecundario = JSON.parse(formData.get('sosSecundario') as string) as string[]
    const driveLinksRaw = formData.get('driveLinks')
    const driveLinks    = JSON.parse((driveLinksRaw as string) ?? '{}') as Partial<DriveLinks>
    const categoryName  = (formData.get('categoryName') as string)?.trim() || 'Sin nombre'
    const tipoCarga     = formData.get('tipoCarga') as string

    console.log('[guardarCIPL] received driveLinks:', JSON.stringify(driveLinks))
    console.log('[guardarCIPL] items count:', items.length, 'tipoCarga:', tipoCarga)

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
      // El gsoMap puede contener campos que NO existen en CIPLItem (incoterm,
      // puertoSalida, fobUnit, fobTotal — removidos en Fase 1). Extraemos solo
      // los 4 campos válidos del schema para evitar PrismaClientValidationError.
      const skuFromGso     = typeof gso.sku    === 'string' ? gso.sku    : null
      const paFromGso      = typeof gso.pa     === 'string' ? gso.pa     : null
      const modeloFromGso  = typeof gso.modelo === 'string' ? gso.modelo : null
      const qPiFromGso     = typeof gso.qPi    === 'number' ? gso.qPi    : null
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
        sku:    skuFromGso,
        pa:     paFromGso,
        modelo: modeloFromGso,
        qPi:    qPiFromGso,
      }
    })

    console.log('[guardarCIPL] first row driveLinkExcel/Ci/Pl:', {
      excel: rows[0]?.driveLinkExcel ?? 'NULL',
      ci:    rows[0]?.driveLinkCi    ?? 'NULL',
      pl:    rows[0]?.driveLinkPl    ?? 'NULL',
    })

    // Transacción atómica: createMany + auto-linking en una sola operación.
    // Si falla el linking a Compra, no quedan CIPLItems huérfanos (sin
    // compraId) — todo se revierte o todo queda. Antes era 1 createMany +
    // 1 findMany + N updateMany sin transaction, y un fallo a mitad
    // dejaba data inconsistente.
    const savedSOs = [...new Set(sosPrincipal.filter(Boolean).map(s => s.trim().toUpperCase()))]
    const count = await prisma.$transaction(async (tx) => {
      const result = await tx.cIPLItem.createMany({ data: rows })

      if (savedSOs.length > 0) {
        const compraSOItems = await tx.compraSOItem.findMany({
          where: { soNumber: { in: savedSOs } },
          select: { compraId: true, soNumber: true },
        })
        if (compraSOItems.length > 0) {
          const soToCompra = new Map(compraSOItems.map(c => [c.soNumber.toUpperCase(), c.compraId]))
          for (const [so, compraId] of soToCompra) {
            await tx.cIPLItem.updateMany({
              where: { soPrincipal: { equals: so, mode: 'insensitive' }, compraId: null },
              data:  { compraId },
            })
          }
        }
      }
      return result.count
    })

    console.log('[guardarCIPL] created', count, 'rows; auto-linked SOs:', savedSOs.join(', ') || 'ninguno')

    return { success: true, count }
  } catch (err) {
    console.error('[ETL] guardarCIPL error:', err)

    // Rollback: si la DB falló y ya teníamos archivos subidos a Drive,
    // borrarlos para no dejarlos huérfanos. Si el rollback también falla
    // (Drive token expirado, red caída, etc), reportamos los links al
    // user en el error para que pueda borrarlos manualmente.
    let rollbackNote = ''
    try {
      const driveLinksRaw = formData.get('driveLinks')
      const driveLinks    = JSON.parse((driveLinksRaw as string) ?? '{}') as Partial<DriveLinks>
      const links: (string | null | undefined)[] = [driveLinks.excel, driveLinks.ci, driveLinks.pl]
      const fileIds = links
        .map(l => extractDriveFileId(l))
        .filter((id): id is string => !!id)

      if (fileIds.length > 0) {
        const token = await getDriveAccessToken()
        const failed: string[] = []
        for (const id of fileIds) {
          const r = await deleteDriveFile(id, token)
          if (!r.ok) failed.push(`${id} (${r.error})`)
        }
        if (failed.length > 0) {
          rollbackNote = ` Drive rollback parcial: ${failed.length}/${fileIds.length} no pudieron borrarse: ${failed.join(', ')}`
        } else {
          rollbackNote = ` (Drive rollback OK: ${fileIds.length} archivo${fileIds.length === 1 ? '' : 's'} borrado${fileIds.length === 1 ? '' : 's'})`
        }
        console.log('[ETL] rollback Drive', { fileIds, failed })
      }
    } catch (rbErr) {
      console.error('[ETL] rollback Drive failed:', rbErr)
      rollbackNote = ` ATENCIÓN: rollback Drive falló — los archivos quedan en Drive. Error: ${String(rbErr)}`
    }

    return { success: false, error: String(err) + rollbackNote }
  }
}
