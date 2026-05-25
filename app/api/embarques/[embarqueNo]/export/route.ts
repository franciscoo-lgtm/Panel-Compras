import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getEmbarqueDetail } from '@/app/lib/embarques'
import { buildCiplWorkbook, type ExportItem } from '@/lib/exportCipl'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ embarqueNo: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { embarqueNo: raw } = await ctx.params
  const detail = await getEmbarqueDetail(decodeURIComponent(raw))
  if (!detail) return new NextResponse('Embarque no encontrado', { status: 404 })

  const items: ExportItem[] = detail.items.map(i => ({
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
  }))

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
