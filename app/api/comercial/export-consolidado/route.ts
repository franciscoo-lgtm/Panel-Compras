import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { buildCiplWorkbook, type ExportItem } from '@/lib/exportCipl'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Exporta un PL Consolidado de N ASNs en un solo Excel.
 *
 * Uso: GET /api/comercial/export-consolidado?asns=JDS260428M24N,HYS260413X5T2
 * El query param `asns` es una lista coma-separada de ASNs.
 *
 * El Excel resultante tiene una fila por cada CIPLItem de cualquiera de esos
 * ASNs, ordenado por ASN luego por sortOrder. Usado por Comex/Comercial para
 * mandar instrucción al forwarder.
 *
 * Los datos del proveedor (supplier, dirección, contacto, etc.) e incoterm
 * vienen de la Compra vinculada por SO. Si el item no tiene compra vinculada
 * esos campos quedan vacíos.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const asnsParam = url.searchParams.get('asns') ?? ''
  const asns = asnsParam.split(',').map(s => s.trim()).filter(Boolean)

  if (asns.length === 0) {
    return new NextResponse('Falta query param ?asns=A,B,C', { status: 400 })
  }

  const dbItems = await prisma.cIPLItem.findMany({
    where: { asn: { in: asns } },
    orderBy: [{ asn: 'asc' }, { sortOrder: 'asc' }],
    include: {
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

  if (dbItems.length === 0) {
    return new NextResponse(`No hay items para los ASNs: ${asns.join(', ')}`, { status: 404 })
  }

  // Para cada SO, obtener el incoterm del CompraSOItem (uno por SO).
  // Lo cacheamos en un map para evitar N queries.
  const uniqueSOs = Array.from(new Set(dbItems.map(i => i.soPrincipal).filter((s): s is string => !!s)))
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

  const items: ExportItem[] = dbItems.map(i => ({
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
    supplierName:         i.compra?.supplierName ?? null,
    supplierAddress:      i.compra?.supplierAddress ?? null,
    supplierContactName:  i.compra?.supplierContactName ?? null,
    supplierContactPhone: i.compra?.supplierContactPhone ?? null,
    supplierContactEmail: i.compra?.supplierContactEmail ?? null,
    incoterm:             i.soPrincipal ? (incotermBySO.get(i.soPrincipal) ?? null) : null,
  }))

  const wb = buildCiplWorkbook(items)
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  const dateStr = new Date().toISOString().slice(0, 10)
  const filename = asns.length === 1
    ? `CIPL-Consolidado-${asns[0]}-${dateStr}.xlsx`
    : `CIPL-Consolidado-${asns.length}PLs-${dateStr}.xlsx`

  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
