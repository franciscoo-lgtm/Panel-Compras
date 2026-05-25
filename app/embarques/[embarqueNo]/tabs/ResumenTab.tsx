'use client'

import { KPICard } from '@/components/shared/KPICard'
import type { DetailProp } from '../EmbarqueDetailClient'

export function ResumenTab({ detail }: { detail: DetailProp }) {
  const photoCount = detail.items.reduce((s, i) => s + (i.photos?.length ?? 0), 0)
  const itemsConDiff = detail.items.filter((i: any) =>
    i.diferenciaPiPl != null && i.diferenciaPiPl !== 0
  ).length
  const itemsSinFoto = detail.items.filter((i: any) => (i.photos?.length ?? 0) === 0).length
  const okCount = detail.items.length - itemsConDiff - itemsSinFoto

  const firstShipment = detail.shipmentsBySO[0]?.[1]
  const extras = firstShipment?.extras ?? {}

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="SOs incluidos" value={detail.sos.length.toString()} accent="red" />
        <KPICard label="Ítems del PL" value={detail.totalItems.toString()} accent="blue" />
        <KPICard label="Unidades" value={detail.totalQty.toLocaleString()} accent="zinc" />
        <KPICard label="CBM total" value={detail.totalCbm.toFixed(2)} accent="zinc" hint="m³" />
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-4">
        <h3 className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">Control rápido</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="px-3 py-2 rounded-md bg-emerald-500/[0.08] border border-emerald-500/20">
            <p className="text-[10px] uppercase text-emerald-400/80 font-semibold">OK</p>
            <p className="text-xl font-display font-bold text-emerald-400 tabular-nums">{okCount}</p>
          </div>
          <div className="px-3 py-2 rounded-md bg-amber-500/[0.08] border border-amber-500/20">
            <p className="text-[10px] uppercase text-amber-400/80 font-semibold">Diferencia qty</p>
            <p className="text-xl font-display font-bold text-amber-400 tabular-nums">{itemsConDiff}</p>
          </div>
          <div className="px-3 py-2 rounded-md bg-red-500/[0.08] border border-red-500/20">
            <p className="text-[10px] uppercase text-red-400/80 font-semibold">Sin foto</p>
            <p className="text-xl font-display font-bold text-red-400 tabular-nums">{itemsSinFoto}</p>
          </div>
          <div className="px-3 py-2 rounded-md bg-blue-500/[0.08] border border-blue-500/20">
            <p className="text-[10px] uppercase text-blue-400/80 font-semibold">Fotos cargadas</p>
            <p className="text-xl font-display font-bold text-blue-400 tabular-nums">{photoCount}</p>
          </div>
        </div>
      </div>

      {detail.extraColumns.length > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-4">
          <h3 className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">Datos de Comex</h3>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-[12px]">
            {detail.extraColumns.map(col => (
              <div key={col.fieldKey} className="flex items-baseline gap-2">
                <dt className="text-zinc-500 min-w-[100px]">{col.label}</dt>
                <dd className="text-zinc-200 truncate">{extras[col.fieldKey] ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
