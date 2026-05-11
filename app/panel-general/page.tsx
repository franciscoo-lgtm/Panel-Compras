import { prisma } from '@/lib/prisma'
import { LayoutDashboard } from 'lucide-react'
import PanelGeneralClient from './PanelGeneralClient'
import { getComexSources, fetchAllSourcesData } from '@/app/lib/comex-sources'

export default async function PanelGeneralPage() {
  const [rawItems, sources] = await Promise.all([
    prisma.cIPLItem.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { _count: { select: { photos: true } } },
    }),
    getComexSources(),
  ])
  const items = rawItems.map(({ _count, ...rest }) => ({ ...rest, photoCount: _count.photos }))
  const pgSources = sources.filter(s => !s.panels || s.panels.includes('panel-general'))
  const { liveData, extraColumns } = await fetchAllSourcesData(pgSources)

  const total = items.length

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <LayoutDashboard className="w-5 h-5 text-amber-500 shrink-0" />
        <h1 className="text-xl font-semibold text-zinc-900">Panel General</h1>
        <span className="text-xs text-zinc-400 font-mono">{total} ítems</span>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <LayoutDashboard className="w-10 h-10 text-zinc-200" />
          <p className="text-sm text-zinc-400">Sin datos todavía. Cargá tu primer CIPL desde Comercial.</p>
        </div>
      ) : (
        <PanelGeneralClient initialItems={items} liveData={liveData} extraColumns={extraColumns} />
      )}
    </div>
  )
}
