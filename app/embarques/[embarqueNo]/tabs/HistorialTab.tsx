'use client'

import { History, CheckCircle2, MessageSquare, Pencil } from 'lucide-react'
import type { EmbarqueItem } from '../types'

type Event = {
  ts: string
  kind: 'reviewed' | 'manual-qty' | 'nota'
  itemDesc: string
  detail: string
  by: string | null
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function HistorialTab({ items }: { items: EmbarqueItem[] }) {
  const events: Event[] = []

  for (const it of items) {
    const desc = it.description ?? it.soPrincipal ?? it.id.slice(0, 8)
    if (it.controlReviewed && it.controlReviewedAt) {
      events.push({
        ts: it.controlReviewedAt,
        kind: 'reviewed',
        itemDesc: desc,
        detail: 'marcó revisado',
        by: it.controlReviewedBy,
      })
    }
    if (it.controlManualQty != null) {
      events.push({
        ts: it.controlReviewedAt ?? new Date().toISOString(),
        kind: 'manual-qty',
        itemDesc: desc,
        detail: `qty manual ${it.controlManualQty} (original PL: ${it.qty ?? '—'})`,
        by: it.controlReviewedBy,
      })
    }
    if (it.controlNota) {
      events.push({
        ts: it.controlReviewedAt ?? new Date().toISOString(),
        kind: 'nota',
        itemDesc: desc,
        detail: `nota: "${it.controlNota}"`,
        by: it.controlReviewedBy,
      })
    }
  }

  events.sort((a, b) => b.ts.localeCompare(a.ts))

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] py-12 text-center">
        <History className="w-8 h-8 mx-auto text-zinc-700 mb-2" />
        <p className="text-zinc-500 text-[12px]">Sin actividad de control registrada en este embarque.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
      <div className="divide-y divide-white/[0.04]">
        {events.map((e, i) => {
          const Icon = e.kind === 'reviewed' ? CheckCircle2 : e.kind === 'manual-qty' ? Pencil : MessageSquare
          const cls = e.kind === 'reviewed' ? 'text-emerald-400' : e.kind === 'manual-qty' ? 'text-amber-400' : 'text-blue-400'
          return (
            <div key={i} className="px-4 py-3 flex items-start gap-3">
              <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cls}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-zinc-200 truncate">
                  <span className="text-zinc-500">{e.by ?? '—'}</span> {e.detail}
                </p>
                <p className="text-[10px] text-zinc-600 truncate">{e.itemDesc}</p>
              </div>
              <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">{fmtDate(e.ts)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
