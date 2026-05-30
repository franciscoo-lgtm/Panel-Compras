'use client'

import Link from 'next/link'
import { ShoppingCart, ExternalLink } from 'lucide-react'
import type { EmbarqueCompra } from '../types'

function fmtDate(d: string | Date | null): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function ComprasTab({ compras, sos }: { compras: EmbarqueCompra[]; sos: string[] }) {
  if (compras.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] py-12 text-center">
        <ShoppingCart className="w-8 h-8 mx-auto text-zinc-700 mb-2" />
        <p className="text-zinc-500 text-[12px]">No hay compras vinculadas a los SOs de este embarque.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {compras.map(c => {
        const sosEnEmbarque = c.sos.filter(s => sos.includes(s.soNumber))
        return (
          <div key={c.id} className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
            <div className="px-4 py-3 bg-[#0d0d0d] border-b border-white/[0.06] flex items-center gap-3">
              <ShoppingCart className="w-4 h-4 text-purple-400" />
              <Link href={`/compras/${c.id}`} className="text-[13px] font-medium text-white hover:text-[#31AF4F] transition-colors">
                {c.piNo ?? c.id.slice(0, 8)}
              </Link>
              {c.supplierName && (
                <span className="text-[11px] text-zinc-500">· {c.supplierName}</span>
              )}
              <Link href={`/compras/${c.id}`} className="ml-auto text-zinc-500 hover:text-white">
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
              <div><p className="text-zinc-500 text-[9px] uppercase tracking-wide">Fecha pago</p><p className="text-zinc-200 tabular-nums">{fmtDate(c.fechaPago)}</p></div>
              <div><p className="text-zinc-500 text-[9px] uppercase tracking-wide">Fecha LMS</p><p className="text-zinc-200 tabular-nums">{fmtDate(c.fechaLMS)}</p></div>
              <div><p className="text-zinc-500 text-[9px] uppercase tracking-wide">Fecha envío</p><p className="text-zinc-200 tabular-nums">{fmtDate(c.fechaEnvio)}</p></div>
              <div><p className="text-zinc-500 text-[9px] uppercase tracking-wide">SOs en embarque</p><p className="text-zinc-200">{sosEnEmbarque.length} / {c.sos.length}</p></div>
            </div>
            {sosEnEmbarque.length > 0 && (
              <div className="px-4 pb-3 flex flex-wrap gap-1">
                {sosEnEmbarque.map(s => (
                  <span key={s.id} className="px-2 py-0.5 rounded font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {s.soNumber}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
