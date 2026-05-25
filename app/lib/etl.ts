'use server'

import { prisma } from '@/lib/prisma'
import { buildGSOMap } from '@/app/lib/sheets'

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
    const driveLinks    = JSON.parse(formData.get('driveLinks')    as string ?? '{}') as Partial<DriveLinks>
    const categoryName  = (formData.get('categoryName') as string)?.trim() || 'Sin nombre'
    const tipoCarga     = formData.get('tipoCarga') as string

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
        ...gso,
      }
    })

    const result = await prisma.cIPLItem.createMany({ data: rows })

    // Auto-link new CIPLItems to a Compra if SO matches
    const savedSOs = [...new Set(sosPrincipal.filter(Boolean).map(s => s.trim().toUpperCase()))]
    if (savedSOs.length > 0) {
      const compraSOItems = await prisma.compraSOItem.findMany({
        where: { soNumber: { in: savedSOs } },
        select: { compraId: true, soNumber: true },
      })
      if (compraSOItems.length > 0) {
        const soToCompra = new Map(compraSOItems.map(c => [c.soNumber.toUpperCase(), c.compraId]))
        for (const [so, compraId] of soToCompra) {
          await prisma.cIPLItem.updateMany({
            where: { soPrincipal: { equals: so, mode: 'insensitive' }, compraId: null },
            data:  { compraId },
          })
        }
        console.log(`[ETL] Auto-linked CIPLItems to compras for SOs: ${[...soToCompra.keys()].join(', ')}`)
      }
    }

    return { success: true, count: result.count }
  } catch (err) {
    console.error('[ETL] guardarCIPL error:', err)
    return { success: false, error: String(err) }
  }
}
