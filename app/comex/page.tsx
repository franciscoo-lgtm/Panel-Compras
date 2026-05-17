export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { Anchor } from 'lucide-react'
import ComexClient from './ComexClient'
import type { ComexKpis } from './ComexClient'
import { getComexSources, fetchAllSourcesData } from '@/app/lib/comex-sources'

function diffDays(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length)
}

export default async function ComexPage() {
  const [items, sources] = await Promise.all([
    prisma.cIPLItem.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
    getComexSources(),
  ])
  const cxSources = sources.filter(s => !s.panels || s.panels.includes('comex'))
  const { liveData, extraColumns } = await fetchAllSourcesData(cxSources)

  const today = new Date(); today.setHours(0, 0, 0, 0)

  // KPI calculations
  const leadDays = items
    .map(i => diffDays(i.etd, i.etaCaldas))
    .filter((d): d is number => d != null && d > 0)

  const transitDays = items
    .map(i => diffDays(i.etd, i.arriboWh))
    .filter((d): d is number => d != null && d > 0)

  const pendingConfirmations = items.filter(i => !!i.avisoAgente && !i.avisoConfirmacion).length

  // Count distinct delayed ASNs, not individual items
  const delayedAsns = new Set(
    items
      .filter(i => !i.arriboWh && !i.etaCaldas && i.eta && new Date(i.eta) < today)
      .map(i => i.asn ?? i.id)
  )
  const delayed = delayedAsns.size

  const kpis: ComexKpis = {
    avgLeadDays:          avg(leadDays),
    avgTransitDays:       avg(transitDays),
    pendingConfirmations,
    delayed,
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Módulo</p>
        <h1 className="text-2xl font-semibold text-zinc-900 flex items-center gap-2">
          <Anchor className="w-6 h-6 text-indigo-500" />
          Comex Tracking
        </h1>
        <p className="text-sm text-zinc-400 mt-1">Seguimiento de despachos — timeline por ASN con alertas de desvío</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <Anchor className="w-10 h-10 text-zinc-200" />
          <p className="text-sm text-zinc-400">Sin datos. Cargá CIPLs desde Comercial primero.</p>
        </div>
      ) : (
        <ComexClient initialItems={items} liveData={liveData} extraColumns={extraColumns} kpis={kpis} />
      )}
    </div>
  )
}
