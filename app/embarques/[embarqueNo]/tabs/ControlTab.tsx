'use client'

import { useState, useMemo, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Camera, CameraOff, CheckCircle2, MessageSquare, Pencil, Loader2 } from 'lucide-react'
import { markReviewed, setManualQty, setNota } from '@/app/lib/control-actions'
import type { EmbarqueItem } from '../types'

type Filter = 'todos' | 'con-diferencia' | 'sin-foto' | 'pendientes' | 'revisados'

function effectiveQty(it: EmbarqueItem): number {
  return it.controlManualQty ?? it.qty ?? 0
}

export function ControlTab({ items: initialItems }: { items: EmbarqueItem[] }) {
  const [items, setItems] = useState<EmbarqueItem[]>(initialItems)
  const [filter, setFilter] = useState<Filter>('todos')
  const [editing, setEditing] = useState<{ id: string; field: 'qty' | 'nota' } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [, start] = useTransition()
  const [savingId, setSavingId] = useState<string | null>(null)

  const summary = useMemo(() => {
    const conDiff = items.filter(i =>
      i.qPi != null && effectiveQty(i) !== i.qPi
    ).length
    const sinFoto = items.filter(i => i.photos.length === 0).length
    const revisados = items.filter(i => i.controlReviewed).length
    const pendientes = items.length - revisados
    const ok = items.length - conDiff - sinFoto
    return { conDiff, sinFoto, ok, total: items.length, revisados, pendientes }
  }, [items])

  const visible = useMemo(() => {
    return items.filter(i => {
      const eqty = effectiveQty(i)
      const hasDiff = i.qPi != null && eqty !== i.qPi
      const noPhoto = i.photos.length === 0
      switch (filter) {
        case 'todos':          return true
        case 'con-diferencia': return hasDiff
        case 'sin-foto':       return noPhoto
        case 'pendientes':     return !i.controlReviewed
        case 'revisados':      return i.controlReviewed
      }
    })
  }, [items, filter])

  const filters: { id: Filter; label: string; count: number; cls: string }[] = [
    { id: 'todos',          label: 'Todos',           count: summary.total,      cls: 'border-white/[0.1]' },
    { id: 'pendientes',     label: 'Pendientes',      count: summary.pendientes, cls: 'border-amber-500/30 text-amber-400' },
    { id: 'revisados',      label: 'Revisados',       count: summary.revisados,  cls: 'border-emerald-500/30 text-emerald-400' },
    { id: 'con-diferencia', label: 'Diferencia qty',  count: summary.conDiff,    cls: 'border-amber-500/30 text-amber-400' },
    { id: 'sin-foto',       label: 'Sin foto',        count: summary.sinFoto,    cls: 'border-red-500/30 text-red-400' },
  ]

  function patch(id: string, patch: Partial<EmbarqueItem>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  function toggleReview(it: EmbarqueItem) {
    const next = !it.controlReviewed
    const prevState = {
      controlReviewed: it.controlReviewed,
      controlReviewedAt: it.controlReviewedAt,
      controlReviewedBy: it.controlReviewedBy,
    }
    patch(it.id, {
      controlReviewed: next,
      controlReviewedAt: next ? new Date().toISOString() : null,
      controlReviewedBy: next ? 'tú' : null,
    })
    setSavingId(it.id)
    start(async () => {
      const res = await markReviewed(it.id, next)
      if (!res.ok) {
        patch(it.id, prevState)
      }
      setSavingId(null)
    })
  }

  function startEdit(id: string, field: 'qty' | 'nota', current: string) {
    setEditing({ id, field })
    setEditValue(current)
  }

  function commitEdit() {
    if (!editing) return
    const { id, field } = editing
    setEditing(null)
    setSavingId(id)
    const trimmed = editValue.trim()
    if (field === 'qty') {
      const num = trimmed ? parseInt(trimmed, 10) : null
      if (num != null && isNaN(num)) { setSavingId(null); return }
      patch(id, { controlManualQty: num })
      start(async () => {
        const res = await setManualQty(id, num)
        if (!res.ok) console.error(res.error)
        setSavingId(null)
      })
    } else {
      patch(id, { controlNota: trimmed || null })
      start(async () => {
        const res = await setNota(id, trimmed)
        if (!res.ok) console.error(res.error)
        setSavingId(null)
      })
    }
  }

  return (
    <div>
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
          <table className="w-full min-w-[800px] text-[12px]">
            <thead>
              <tr className="bg-[#0d0d0d] border-b border-white/[0.06]">
                <th className="text-center text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-2 py-2.5 w-10">✓</th>
                <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">SO</th>
                <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Descripción</th>
                <th className="text-center text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Foto</th>
                <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-blue-400 px-3 py-2.5">Qty PL</th>
                <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-purple-400 px-3 py-2.5">Qty PI</th>
                <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Dif.</th>
                <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Nota</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0
                ? <tr><td colSpan={8} className="px-4 py-10 text-center text-zinc-500">Sin ítems para mostrar.</td></tr>
                : visible.map(it => {
                  const eqty = effectiveQty(it)
                  const diff = it.qPi != null ? eqty - it.qPi : 0
                  const hasDiff = diff !== 0
                  const isManual = it.controlManualQty != null
                  const isSaving = savingId === it.id
                  return (
                    <tr key={it.id} className={cn(
                      'border-b border-white/[0.04] last:border-0 group',
                      it.controlReviewed && 'opacity-60',
                    )}>
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => toggleReview(it)}
                          disabled={isSaving}
                          className={cn(
                            'w-5 h-5 rounded border flex items-center justify-center transition-colors',
                            it.controlReviewed
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                              : 'border-white/[0.15] hover:border-emerald-500/50',
                          )}
                          title={it.controlReviewed ? `Revisado por ${it.controlReviewedBy ?? '—'}` : 'Marcar como revisado'}
                        >
                          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : it.controlReviewed && <CheckCircle2 className="w-3 h-3" />}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-emerald-400">{it.soPrincipal ?? '—'}</td>
                      <td className="px-3 py-2 text-zinc-200 max-w-[280px] truncate">{it.description ?? '—'}</td>
                      <td className="px-3 py-2 text-center">
                        {it.photos.length > 0
                          ? <span className="inline-flex items-center gap-1 text-emerald-400"><Camera className="w-3 h-3" /><span className="text-[10px]">{it.photos.length}</span></span>
                          : <CameraOff className="w-3.5 h-3.5 inline text-red-400" />
                        }
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {editing?.id === it.id && editing?.field === 'qty' ? (
                          <input
                            autoFocus
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null) }}
                            className="w-16 px-1 py-0.5 rounded bg-[#0d0d0d] border border-[#E30613]/40 text-white text-right tabular-nums"
                          />
                        ) : (
                          <button
                            onClick={() => startEdit(it.id, 'qty', String(eqty))}
                            className={cn(
                              'text-blue-300 font-semibold hover:text-white transition-colors inline-flex items-center gap-1',
                              isManual && 'text-amber-400',
                            )}
                            title={isManual ? `Manual (original PL: ${it.qty})` : 'Click para editar'}
                          >
                            {eqty}
                            {isManual && <Pencil className="w-2.5 h-2.5 opacity-50" />}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-purple-300 font-semibold tabular-nums">{it.qPi ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {hasDiff
                          ? <span className={cn('px-1.5 py-0.5 rounded font-semibold', diff < 0 ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400')}>{diff > 0 ? '+' : ''}{diff}</span>
                          : <span className="text-emerald-400">0</span>
                        }
                      </td>
                      <td className="px-3 py-2 max-w-[200px]">
                        {editing?.id === it.id && editing?.field === 'nota' ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null) }}
                            className="w-full px-2 py-0.5 rounded bg-[#0d0d0d] border border-[#E30613]/40 text-white text-[11px]"
                          />
                        ) : (
                          <button
                            onClick={() => startEdit(it.id, 'nota', it.controlNota ?? '')}
                            className="text-left w-full text-[11px] text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-1.5 truncate"
                          >
                            {it.controlNota
                              ? <><MessageSquare className="w-3 h-3 text-amber-400 shrink-0" /><span className="truncate">{it.controlNota}</span></>
                              : <span className="text-zinc-600 italic">+ nota</span>
                            }
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
