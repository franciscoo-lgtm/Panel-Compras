'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
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

  const counts = useMemo(() => {
    const c: Record<EmbarqueEstado | 'todos', number> = {
      todos: summaries.length,
      'en-transito': 0, pendiente: 0, arribado: 0, desconocido: 0,
    }
    for (const s of summaries) c[s.estado]++
    return c
  }, [summaries])

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    return summaries.filter(s => {
      if (filter !== 'todos' && s.estado !== filter) return false
      if (q) {
        if (s.embarqueNo.toUpperCase().includes(q)) return true
        if (s.sos.some(so => so.toUpperCase().includes(q))) return true
        if (s.awb?.toUpperCase().includes(q)) return true
        return false
      }
      return true
    })
  }, [summaries, filter, query])

  return (
    <div>
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

      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
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
