export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { BarChart2 } from 'lucide-react'
import ReportesClient from './ReportesClient'
import { getComexSources, fetchAllSourcesData } from '@/app/lib/comex-sources'
import type { CIPLItemRow } from './ReportesClient'

export default async function ReportesPage() {
  const [rawItems, sources] = await Promise.all([
    prisma.cIPLItem.findMany({
      orderBy: [{ createdAt: 'desc' }, { sortOrder: 'asc' }],
      take: 2000,
    }),
    getComexSources(),
  ])

  const { liveData, extraColumns } = await fetchAllSourcesData(sources)

  const items: CIPLItemRow[] = rawItems.map(item => ({
    id:           item.id,
    asn:          item.asn,
    piNo:         item.piNo,
    caseNo:       item.caseNo,
    soPrincipal:  item.soPrincipal,
    tipoCarga:    item.tipoCarga,
    categoryName: item.categoryName,
    description:  item.description,
    qty:          item.qty,
    qBultos:      item.qBultos,
    cbm:          item.cbm,
    gwKg:         item.gwKg,
  }))

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <BarChart2 className="w-5 h-5 text-[#E30613] shrink-0" />
        <h1 className="text-xl font-semibold text-zinc-900">Reportes</h1>
      </div>
      <ReportesClient initialItems={items} liveData={liveData} extraColumns={extraColumns} />
    </div>
  )
}
