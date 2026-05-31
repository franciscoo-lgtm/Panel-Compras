'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowUpRight, ChevronDown } from 'lucide-react'
import type { AlertItem } from '@/app/lib/dashboard'

const INITIAL_VISIBLE = 8

/**
 * Bandeja de alertas con expand/collapse. Antes el home mostraba
 * 8 fijas con un slice silencioso; si había más, no se veían. Ahora
 * el contador refleja el total real y se puede expandir.
 */
export function AlertasBandeja({ alerts }: { alerts: AlertItem[] }) {
  const [expanded, setExpanded] = useState(false)

  const hasMore = alerts.length > INITIAL_VISIBLE
  const visible = expanded ? alerts : alerts.slice(0, INITIAL_VISIBLE)

  return (
    <>
      <div className="px-6 py-4 flex items-center gap-3 border-b border-white/[0.04]">
        <Activity className="w-3.5 h-3.5 text-amber-300/80" />
        <span className="text-[11px] font-medium text-white/70 tracking-wide">Bandeja de alertas</span>
        <span className="ml-auto text-[10px] text-white/30 tabular-nums">
          {alerts.length}
        </span>
      </div>

      <div className="divide-y divide-white/[0.03]">
        {alerts.length === 0 ? (
          <p className="px-6 py-12 text-center text-white/30 text-[12px]">Sin alertas. Todo en orden.</p>
        ) : visible.map((a, i) => {
          const dotColor = a.kind === 'critical' ? 'bg-red-400' : a.kind === 'warn' ? 'bg-amber-300' : 'bg-emerald-400'
          const body = (
            <div className="px-6 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors group">
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />
              <span className="text-[12px] text-white/75 flex-1 truncate">{a.text}</span>
              {a.href && <ArrowUpRight className="w-3.5 h-3.5 text-white/20 group-hover:text-[#31AF4F] transition-colors" />}
            </div>
          )
          return a.href
            ? <Link key={`${a.text}-${i}`} href={a.href}>{body}</Link>
            : <div key={`${a.text}-${i}`}>{body}</div>
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full px-6 py-3 border-t border-white/[0.04] text-[11px] text-white/45 hover:text-white/80 hover:bg-white/[0.02] transition-colors flex items-center justify-center gap-1.5"
        >
          {expanded
            ? `Ocultar (${alerts.length - INITIAL_VISIBLE} ocultas)`
            : `Ver ${alerts.length - INITIAL_VISIBLE} más`}
          <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </>
  )
}
