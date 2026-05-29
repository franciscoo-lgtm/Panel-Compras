'use client'

import { CheckCircle2, Circle } from 'lucide-react'

type Item = {
  key: string
  label: string
  date: string | null            // ISO o null si no cumplido
  source: 'manual' | 'comex' | 'auto'
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function MilestonesTimeline({
  title = 'Hitos del proceso',
  items,
}: {
  title?: string
  items: Item[]
}) {
  if (items.length === 0) return null

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-5">{title}</p>

      <div className="flex items-start gap-0 overflow-x-auto pb-2">
        {items.map((it, idx) => {
          const done = !!it.date
          const isLast = idx === items.length - 1
          return (
            <div key={it.key} className="flex items-start shrink-0">
              <div className="flex flex-col items-center min-w-[110px]">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  done
                    ? 'bg-emerald-500/15 text-emerald-400 border-2 border-emerald-500/40'
                    : 'bg-zinc-500/[0.05] text-zinc-600 border-2 border-zinc-500/20'
                }`}>
                  {done
                    ? <CheckCircle2 className="w-5 h-5" />
                    : <Circle className="w-5 h-5" />
                  }
                </div>
                <p className={`text-[10px] mt-2 text-center font-medium leading-tight max-w-[100px] ${
                  done ? 'text-zinc-200' : 'text-zinc-500'
                }`}>
                  {it.label}
                </p>
                <p className={`text-[9px] mt-1 ${done ? 'text-zinc-500' : 'text-zinc-700 italic'}`}>
                  {fmtDate(it.date) ?? (it.source === 'comex' ? 'desde Comex' : 'pendiente')}
                </p>
              </div>
              {!isLast && (
                <div className={`h-[2px] w-8 mt-5 ${done && !!items[idx + 1]?.date ? 'bg-emerald-500/40' : 'bg-zinc-500/20'}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
