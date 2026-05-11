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

  const total      = items.length
  const sinInicio  = items.filter(i => !i.avisoAgente && !i.etd && !i.arriboWh).length
  const enTransito = items.filter(i => i.etd && !i.arriboWh).length
  const llegados   = items.filter(i => i.arriboWh && !i.etaCaldas).length
  const entregados = items.filter(i => i.etaCaldas).length

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Módulo</p>
        <h1 className="text-2xl font-semibold text-zinc-900 flex items-center gap-2">
          <Anchor className="w-6 h-6 text-indigo-500" />
          Comex Tracking
        </h1>
        <p className="text-sm text-zinc-400 mt-1">Seguimiento de despachos — clic en ✏️ para actualizar etapas</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Sin iniciar',  value: sinInicio,  color: 'text-zinc-500' },
          { label: 'En tránsito',  value: enTransito, color: 'text-sky-600'  },
          { label: 'Llegados WH',  value: llegados,   color: 'text-amber-600'},
          { label: 'Entregados',   value: entregados, color: 'text-emerald-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-zinc-100 shadow-sm px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <Anchor className="w-10 h-10 text-zinc-200" />
          <p className="text-sm text-zinc-400">Sin datos. Cargá CIPLs desde Comercial primero.</p>
        </div>
      ) : (
        <ComexClient initialItems={items} liveData={liveData} extraColumns={extraColumns} />
      )}
    </div>
  )
}
