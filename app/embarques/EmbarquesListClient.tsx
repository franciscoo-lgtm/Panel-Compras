'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search, HelpCircle, Package } from 'lucide-react'
import { StatusPill, type EmbarqueEstado } from '@/components/shared/StatusPill'
import { DateRange } from '@/components/shared/DateRange'
import { cn } from '@/lib/utils'

type Summary = {
  embarqueNo: string
  estado: EmbarqueEstado
  etd: string | null
  eta: string | null
  awb: string | null
  sos: string[]
  totalItems: number
  totalQty: number
  totalCbm: number
}

const FILTERS: { id: EmbarqueEstado | 'todos'; label: string }[] = [
  { id: 'todos',       label: 'Todos' },
  { id: 'en-transito', label: 'En tránsito' },
  { id: 'pendiente',   label: 'Pendiente' },
  { id: 'arribado',    label: 'Arribado' },
  { id: 'desconocido', label: 'Sin tracking' },
]

export function EmbarquesListClient({ summaries }: { summaries: Summary[] }) {
  const [filter, setFilter] = useState<EmbarqueEstado | 'todos'>('todos')
  const [query, setQuery] = useState('')
  const [onlyWithCIPL, setOnlyWithCIPL] = useState(true)

  // Aplicamos primero el filtro "solo con CIPL" para todos los counts y rows
  const scoped = useMemo(() => {
    return onlyWithCIPL ? summaries.filter(s => s.totalItems > 0) : summaries
  }, [summaries, onlyWithCIPL])

  const counts = useMemo(() => {
    const c: Record<EmbarqueEstado | 'todos', number> = {
      todos: scoped.length,
      'en-transito': 0, pendiente: 0, arribado: 0, desconocido: 0,
    }
    for (const s of scoped) c[s.estado]++
    return c
  }, [scoped])

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    return scoped.filter(s => {
      if (filter !== 'todos' && s.estado !== filter) return false
      if (q) {
        if (s.embarqueNo.toUpperCase().includes(q)) return true
        if (s.sos.some(so => so.toUpperCase().includes(q))) return true
        if (s.awb?.toUpperCase().includes(q)) return true
        return false
      }
      return true
    })
  }, [scoped, filter, query])

  const hiddenCount = summaries.length - scoped.length

  return (
    <div>
      {/* Toggle "solo con CIPL" + help ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <button
          onClick={() => setOnlyWithCIPL(v => !v)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors',
            onlyWithCIPL
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : 'bg-transparent text-zinc-400 border-white/[0.08] hover:text-white',
          )}
          title="Mostrar solo embarques que tienen al menos un CIPL cargado en /comercial"
        >
          <Package className="w-3.5 h-3.5" />
          {onlyWithCIPL ? 'Solo con CIPL cargado' : 'Mostrando todos los embarques'}
        </button>

        {onlyWithCIPL && hiddenCount > 0 && (
          <span className="text-[10px] text-zinc-500">
            ({hiddenCount} embarque{hiddenCount === 1 ? '' : 's'} de Comex sin CIPL oculto{hiddenCount === 1 ? '' : 's'})
          </span>
        )}

        <details className="ml-auto group">
          <summary className="cursor-pointer inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 list-none [&::-webkit-details-marker]:hidden">
            <HelpCircle className="w-3 h-3" />
            ¿Cómo se calcula el estado?
          </summary>
          <div className="absolute mt-2 right-6 z-10 max-w-md p-3 rounded-md border border-white/[0.08] bg-[#0d0d0d] shadow-xl text-[11px] text-zinc-300 space-y-1.5">
            <p className="font-semibold text-white mb-1">El estado depende de las fechas de Comex:</p>
            <p><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" /><strong className="text-emerald-400">Arribado</strong>: hay fecha de Arribo WH cargada</p>
            <p><span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1" /><strong className="text-blue-400">En tránsito</strong>: ETD ya pasó, sin arribo aún</p>
            <p><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1" /><strong className="text-amber-400">Pendiente</strong>: ETD aún en el futuro</p>
            <p><span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-500 mr-1" /><strong className="text-zinc-400">Sin tracking</strong>: ninguna fecha cargada en Comex</p>
            <p className="text-zinc-500 pt-1.5 mt-1.5 border-t border-white/[0.06]">
              Si no ves arribados, probablemente tu fuente no mapea ninguna columna a <code className="text-[10px]">arriboWh</code>. Andá a <code className="text-[10px]">/configuracion</code>.
            </p>
          </div>
        </details>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors',
              filter === f.id
                ? 'bg-[#E30613]/10 text-white border-[#E30613]/40'
                : 'bg-transparent text-zinc-400 border-white/[0.08] hover:text-white hover:border-white/[0.2]',
            )}
          >
            {f.label} <span className="text-zinc-500 ml-1">({counts[f.id]})</span>
          </button>
        ))}

        <div className="ml-auto relative w-full md:w-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar N° Embarque, SO o AWB…"
            className="pl-8 pr-3 py-1.5 w-full md:w-72 rounded-md text-[11px] bg-[#0d0d0d] border border-white/[0.08] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#E30613]/50"
          />
        </div>
      </div>

      {/* Mobile: cards stackeadas */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-zinc-500 text-[12px] rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
            No hay embarques que coincidan con el filtro.
          </p>
        ) : filtered.map(s => (
          <Link
            key={s.embarqueNo}
            href={`/embarques/${encodeURIComponent(s.embarqueNo)}`}
            className="block rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-3 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono font-semibold text-white text-[13px]">{s.embarqueNo}</span>
              <StatusPill estado={s.estado} className="ml-auto" />
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <DateRange etd={s.etd} eta={s.eta} />
              {s.awb && <span className="font-mono text-[10px] text-zinc-500">· {s.awb}</span>}
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {s.sos.slice(0, 4).map(so => (
                <span key={so} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/[0.04] text-zinc-400">{so}</span>
              ))}
              {s.sos.length > 4 && <span className="text-[9px] text-zinc-500">+{s.sos.length - 4}</span>}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-zinc-500 pt-2 border-t border-white/[0.04]">
              <span>{s.totalQty.toLocaleString()} unidades</span>
              <span>{s.totalCbm.toFixed(2)} CBM</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
        <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full min-w-[640px] text-[12px]">
          <thead>
            <tr className="bg-[#0d0d0d] border-b border-white/[0.06]">
              <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">N° Embarque</th>
              <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">Estado</th>
              <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">ETD → ETA</th>
              <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">AWB</th>
              <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">SOs</th>
              <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">Unidades</th>
              <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">CBM</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-500 text-[12px]">
                  No hay embarques que coincidan con el filtro.
                </td>
              </tr>
            ) : filtered.map(s => (
              <tr key={s.embarqueNo} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/embarques/${encodeURIComponent(s.embarqueNo)}`} className="font-mono font-semibold text-white hover:text-[#E30613] transition-colors">
                    {s.embarqueNo}
                  </Link>
                </td>
                <td className="px-4 py-3"><StatusPill estado={s.estado} /></td>
                <td className="px-4 py-3"><DateRange etd={s.etd} eta={s.eta} /></td>
                <td className="px-4 py-3 font-mono text-[11px] text-zinc-500">{s.awb ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {s.sos.slice(0, 3).map(so => (
                      <span key={so} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] text-zinc-400">{so}</span>
                    ))}
                    {s.sos.length > 3 && <span className="text-[10px] text-zinc-500">+{s.sos.length - 3}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-zinc-300 tabular-nums">{s.totalQty.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-zinc-500 tabular-nums">{s.totalCbm.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
