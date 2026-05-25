export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { Anchor } from 'lucide-react'
import ComexClient from './ComexClient'
import { getComexSources, fetchAllSourcesData } from '@/app/lib/comex-sources'

export default async function ComexPage() {
  const [items, sources] = await Promise.all([
    prisma.cIPLItem.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
    getComexSources(),
  ])
  const cxSources = sources.filter(s => !s.panels || s.panels.includes('comex'))
  const { liveData, extraColumns } = await fetchAllSourcesData(cxSources)

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1">Módulo</p>
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <Anchor className="w-6 h-6 text-indigo-400" />
          Comex Tracking
        </h1>
        <p className="text-sm text-white/30 mt-1">Seguimiento de despachos — timeline por ASN con alertas de desvío</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <Anchor className="w-10 h-10 text-white/10" />
          <p className="text-sm text-white/30">Sin datos. Cargá CIPLs desde Comercial primero.</p>
        </div>
      ) : (
        <ComexClient initialItems={items} liveData={liveData} extraColumns={extraColumns} />
      )}
    </div>
  )
}
