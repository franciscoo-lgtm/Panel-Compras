'use server'

import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { fetchComexData } from '@/app/lib/comex'

export async function generarConsolidado(
  compraId: string,
  embarqueNo: string,
): Promise<{ data: string; filename: string } | { error: string }> {
  try {
    const compra = await prisma.compra.findUnique({
      where: { id: compraId },
      include: { sos: true, ciplItems: true },
    })
    if (!compra) return { error: 'Compra no encontrada.' }

    const { bySO } = await fetchComexData()

    const matchingSOs = new Set(
      compra.sos
        .filter(so => bySO.get(so.soNumber.toUpperCase())?.shipments.some(s => s.embarqueNo === embarqueNo))
        .map(so => so.soNumber.toUpperCase())
    )

    const items = compra.ciplItems
      .filter(c => c.soPrincipal && matchingSOs.has(c.soPrincipal.toUpperCase()))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

    if (items.length === 0) return { error: `Sin productos para el embarque ${embarqueNo}.` }

    const soMap = new Map(compra.sos.map(so => [so.soNumber.toUpperCase(), so]))

    const headers1 = [
      'Dangerous Goods','Item','Supplier','FACTORY ADDRESS','Contact Name','Phone Number','e-mail',
      'Order Number','INCOTERM','PALLET or Container Number','SO-NUMBER','Bidcom Internal Code',
      'CTNS','DESCRIPTION','Quantity Per Carton','TOTAL','Weight/CTN (kg/CTN)',
      'Dimension (cm)','','','TOTAL CBM (M3)','TOTAL WEIGHT (kg)',
      'M3 por Bulto','Kg* Bulto Deposito','PL Original','Comments','Fecha Prioritaria','PA',
    ]
    const headers2 = Array(headers1.length).fill('')
    headers2[17] = 'W'; headers2[18] = 'L'; headers2[19] = 'H'

    const dataRows = items.map((item, i) => {
      const so = item.soPrincipal ? soMap.get(item.soPrincipal.toUpperCase()) : null
      const gwTotal = (item.gwKg ?? 0) * (item.qBultos ?? 1)
      return [
        item.isDangerousGood ? 'YES' : '',
        i + 1,
        compra.supplierName         ?? '',
        compra.supplierAddress      ?? '',
        compra.supplierContactName  ?? '',
        compra.supplierContactPhone ?? '',
        compra.supplierContactEmail ?? '',
        item.asn ?? item.piNo ?? '',
        so?.incoterm ?? '',
        item.caseNo ?? '',
        item.soPrincipal ?? '',
        so?.sku ?? '',
        item.qBultos ?? '',
        item.description ?? '',
        item.uniXBulto ?? '',
        item.qty ?? '',
        item.gwKg ?? '',
        item.w ?? '',
        item.l ?? '',
        item.h ?? '',
        item.cbm ?? '',
        gwTotal || '',
        item.cbmXBulto ?? '',
        item.gwKg ?? '',
        item.driveLinkPl ?? item.driveLinkExcel ?? '',
        '',
        '',
        so?.pa ?? '',
      ]
    })

    const totals = Array(headers1.length).fill('')
    totals[0]  = 'Total'
    totals[12] = items.reduce((s, c) => s + (c.qBultos ?? 0), 0)
    totals[15] = items.reduce((s, c) => s + (c.qty     ?? 0), 0)
    totals[16] = items.reduce((s, c) => s + (c.gwKg    ?? 0), 0)
    totals[20] = items.reduce((s, c) => s + (c.cbm     ?? 0), 0)
    totals[21] = items.reduce((s, c) => s + ((c.gwKg ?? 0) * (c.qBultos ?? 1)), 0)

    const aoa = [headers1, headers2, ...dataRows, totals]
    const ws  = XLSX.utils.aoa_to_sheet(aoa)

    ws['!cols'] = [
      {wch:12},{wch:5},{wch:24},{wch:32},{wch:16},{wch:14},{wch:28},
      {wch:20},{wch:14},{wch:22},{wch:12},{wch:16},
      {wch:8},{wch:40},{wch:16},{wch:10},{wch:16},
      {wch:8},{wch:8},{wch:8},{wch:12},{wch:14},
      {wch:12},{wch:16},{wch:36},{wch:20},{wch:14},{wch:16},
    ]

    ws['!merges'] = [
      { s: { r:0, c:17 }, e: { r:0, c:19 } },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'PL Consolidado Mercaderia')

    const dateStr  = new Date().toISOString().slice(0, 10)
    const filename = `PL_Consolidado_${embarqueNo}_${dateStr}.xlsx`
    const buffer   = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const data     = buffer.toString('base64')

    return { data, filename }
  } catch (err) {
    console.error('[generarConsolidado]', err)
    return { error: String(err) }
  }
}
