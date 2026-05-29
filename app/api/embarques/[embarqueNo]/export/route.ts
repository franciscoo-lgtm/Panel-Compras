import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getEmbarqueDetail } from '@/app/lib/embarques'
import { buildCiplWorkbook, type ExportItem } from '@/lib/exportCipl'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ embarqueNo: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { embarqueNo: raw } = await ctx.params
  const detail = await getEmbarqueDetail(decodeURIComponent(raw))
  if (!detail) return new NextResponse('Embarque no encontrado', { status: 404 })

  // Las relaciones de Compra y CompraSOItem.incoterm no vienen en getEmbarqueDetail.
  // Hacemos un fetch adicional indexado por SO/itemId para enriquecer.
  const itemIds = detail.items.map(i => i.id)
  const itemsWithCompra = await prisma.cIPLItem.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      soPrincipal: true,
      compra: {
        select: {
          supplierName:         true,
          supplierAddress:      true,
          supplierContactName:  true,
          supplierContactPhone: true,
          supplierContactEmail: true,
        },
      },
    },
  })
  const compraByItemId = new Map(itemsWithCompra.map(x => [x.id, x.compra ?? null]))

  // Incoterm por SO (de CompraSOItem)
  const uniqueSOs = Array.from(new Set(detail.items.map(i => i.soPrincipal).filter((s): s is string => !!s)))
  const compraSOItems = uniqueSOs.length > 0
    ? await prisma.compraSOItem.findMany({
        where: { soNumber: { in: uniqueSOs } },
        select: { soNumber: true, incoterm: true },
      })
    : []
  const incotermBySO = new Map<string, string | null>()
  for (const x of compraSOItems) {
    if (!incotermBySO.has(x.soNumber)) incotermBySO.set(x.soNumber, x.incoterm ?? null)
  }

  const items: ExportItem[] = detail.items.map(i => {
    const compra = compraByItemId.get(i.id)
    return {
      isDangerousGood: i.isDangerousGood,
      categoryName:    i.categoryName ?? null,
      piNo:            i.piNo ?? null,
      caseNo:          i.caseNo ?? null,
      qBultos:         i.qBultos ?? null,
      qty:             i.qty ?? null,
      description:     i.description ?? null,
      w:               i.w ?? null,
      l:               i.l ?? null,
      h:               i.h ?? null,
      cbm:             i.cbm ?? null,
      gwKg:            i.gwKg ?? null,
      cbmXBulto:       i.cbmXBulto ?? null,
      uniXBulto:       i.uniXBulto ?? null,
      soPrincipal:     i.soPrincipal ?? null,
      sku:             i.sku ?? null,
      pa:              i.pa ?? null,
      driveLinkPl:     i.driveLinkPl ?? null,
      driveLinkExcel:  i.driveLinkExcel ?? null,
      supplierName:         compra?.supplierName ?? null,
      supplierAddress:      compra?.supplierAddress ?? null,
      supplierContactName:  compra?.supplierContactName ?? null,
      supplierContactPhone: compra?.supplierContactPhone ?? null,
      supplierContactEmail: compra?.supplierContactEmail ?? null,
      incoterm:             i.soPrincipal ? (incotermBySO.get(i.soPrincipal) ?? null) : null,
    }
  })

  const wb = buildCiplWorkbook(items)
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  const filename = `CIPL-${detail.embarqueNo}-${new Date().toISOString().slice(0, 10)}.xlsx`
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
