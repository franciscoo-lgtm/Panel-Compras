'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Camera, CameraOff, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import type { EmbarqueItem } from '../types'

type Filter = 'todos' | 'con-diferencia' | 'sin-foto' | 'ok'

export function ControlTab({ items }: { items: EmbarqueItem[] }) {
  const [filter, setFilter] = useState<Filter>('todos')

  const summary = useMemo(() => {
    const conDiff = items.filter(i => i.diferenciaPiPl != null && i.diferenciaPiPl !== 0).length
    const sinFoto = items.filter(i => (i.photos?.length ?? 0) === 0).length
    const ok = items.length - conDiff - sinFoto
    return { conDiff, sinFoto, ok, total: items.length }
  }, [items])

  const visible = useMemo(() => {
    return items.filter(i => {
      const hasDiff = i.diferenciaPiPl != null && i.diferenciaPiPl !== 0
      const noPhoto = (i.photos?.length ?? 0) === 0
      const isOk = !hasDiff && !noPhoto
      switch (filter) {
        case 'todos':          return true
        case 'con-diferencia': return hasDiff
        case 'sin-foto':       return noPhoto
        case 'ok':             return isOk
      }
    })
  }, [items, filter])

  const filters: { id: Filter; label: string; count: number; cls: string }[] = [
    { id: 'todos',          label: 'Todos',           count: summary.total,   cls: 'border-white/[0.1]' },
    { id: 'ok',             label: 'OK',              count: summary.ok,      cls: 'border-emerald-500/30 text-emerald-400' },
    { id: 'con-diferencia', label: 'Diferencia qty',  count: summary.conDiff, cls: 'border-amber-500/30 text-amber-400' },
    { id: 'sin-foto',       label: 'Sin foto',        count: summary.sinFoto, cls: 'border-red-500/30 text-red-400' },
  ]

  return (
    <div>
      <div className="mb-3 p-3 rounded-md border border-blue-500/20 bg-blue-500/[0.04] flex items-start gap-2 text-[11px] text-blue-300">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>Fase 1: tab de Control en modo lectura. Las acciones (marcar revisado, editar qty, agregar nota) se habilitan en Fase 2.</span>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors',
              filter === f.id ? f.cls + ' bg-white/[0.04]' : 'border-white/[0.08] text-zinc-500 hover:text-zinc-300',
            )}
          >
            {f.label} <span className="ml-1 opacity-60">({f.count})</span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12px]">
            <thead>
              <tr className="bg-[#0d0d0d] border-b border-white/[0.06]">
                <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">SO</th>
                <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">Descripción</th>
                <th className="text-center text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">Foto</th>
                <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-blue-400 px-4 py-2.5">Qty PL</th>
                <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-purple-400 px-4 py-2.5">Qty PI</th>
                <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">Diferencia</th>
                <th className="text-center text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-500">Sin ítems para mostrar.</td></tr>
              ) : visible.map(it => {
                const photos = it.photos?.length ?? 0
                const diff = it.diferenciaPiPl ?? 0
                const hasDiff = diff !== 0
                const noPhoto = photos === 0
                const isOk = !hasDiff && !noPhoto
                return (
                  <tr key={it.id} className={cn(
                    'border-b border-white/[0.04] last:border-0',
                    hasDiff && noPhoto && 'bg-red-500/[0.04]',
                    hasDiff && !noPhoto && 'bg-amber-500/[0.04]',
                    !hasDiff && noPhoto && 'bg-red-500/[0.02]',
                  )}>
                    <td className="px-4 py-2 font-mono text-[11px] text-emerald-400">{it.soPrincipal ?? '—'}</td>
                    <td className="px-4 py-2 text-zinc-200">{it.description ?? '—'}</td>
                    <td className="px-4 py-2 text-center">
                      {photos > 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Camera className="w-3 h-3" /><span className="text-[10px]">{photos}</span>
                        </span>
                      ) : (
                        <CameraOff className="w-3.5 h-3.5 inline text-red-400" />
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-blue-300 font-semibold tabular-nums">{it.qty ?? 0}</td>
                    <td className="px-4 py-2 text-right text-purple-300 font-semibold tabular-nums">{it.qPi ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {hasDiff ? (
                        <span className={cn('px-1.5 py-0.5 rounded font-semibold', diff < 0 ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400')}>
                          {diff > 0 ? '+' : ''}{diff}
                        </span>
                      ) : (
                        <span className="text-emerald-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {isOk
                        ? <span className="inline-flex items-center gap-1 text-emerald-400 text-[10px]"><CheckCircle2 className="w-3 h-3" />OK</span>
                        : <span className="inline-flex items-center gap-1 text-amber-400 text-[10px]"><AlertTriangle className="w-3 h-3" />Revisar</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
