'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Check, X, Loader2 } from 'lucide-react'
import { eliminarCompra } from './actions'
import { getCompraStatus, getStatusBadgeClass, getQtyRecibida, getQtyPedida } from './lib'
import type { CompraWithSOS } from './lib'

const TABS: Array<{ label: string; filter: (c: CompraWithSOS) => boolean }> = [
  { label: 'Todas',         filter: () => true },
  { label: 'En proceso',    filter: c => !['Borrador', 'Completada'].includes(getCompraStatus(c)) },
  { label: 'Esperando PL',  filter: c => { const st = getCompraStatus(c); return st === 'Pagada' || st === 'PA Validada' } },
  { label: 'Completadas',   filter: c => getCompraStatus(c) === 'Completada' },
]

const fmtDate = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export function ComprasClient({ compras }: { compras: CompraWithSOS[] }) {
  const router = useRouter()
  const [tab, setTab] = useState(0)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [, startT] = useTransition()
  const filtered = compras.filter(TABS[tab]!.filter)

  function handleDelete(compraId: string) {
    setErrorMsg(null)
    setPendingId(compraId)
    startT(async () => {
      const res = await eliminarCompra(compraId)
      setPendingId(null)
      if (res.ok) {
        setConfirmId(null)
        router.refresh()
      } else {
        setErrorMsg(`No se pudo eliminar: ${res.error}`)
      }
    })
  }

  return (
    <div className="px-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] mb-4">
        {TABS.map((t, i) => {
          const count = compras.filter(t.filter).length
          return (
            <button
              key={t.label}
              onClick={() => setTab(i)}
              className={`px-4 py-2.5 text-[12px] font-medium border-b-2 transition-colors ${
                tab === i
                  ? 'border-[#31AF4F] text-white'
                  : 'border-transparent text-white/35 hover:text-white/60'
              }`}
            >
              {t.label} <span className="ml-1 text-[10px] opacity-60">({count})</span>
            </button>
          )
        })}
      </div>

      {errorMsg && (
        <div className="mb-3 text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {errorMsg}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              {['Orden / Fecha', 'SOs', 'Estado', 'Progreso', 'PLs', 'FOB Total', ''].map(h => (
                <th key={h} className="text-left pb-3 text-[10px] font-bold uppercase tracking-[0.1em] text-white/20 border-b border-white/[0.06] pr-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const status   = getCompraStatus(c)
              const qPedida  = getQtyPedida(c)
              const qRecibida= getQtyRecibida(c)
              const pct      = qPedida > 0 ? Math.round((qRecibida / qPedida) * 100) : 0
              const fobTotal = c.sos.reduce((s, so) => s + (so.fobTotal ?? 0), 0)
              const modelos  = [...new Set(c.sos.map(s => s.modelo).filter(Boolean))].slice(0, 2)
              const plCount  = c.ciplItems.length

              return (
                <tr key={c.id} className="border-b border-white/[0.04] hover:bg-white/[0.015] transition-colors group">
                  <td className="py-3 pr-4">
                    <div className="font-mono text-[12px] text-white font-medium">{c.piNo ?? `OC-${c.id.slice(-6).toUpperCase()}`}</div>
                    <div className="text-[11px] text-white/30 mt-0.5">{fmtDate(c.fechaOrden)}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-white/70 tabular-nums">{c.sos.length}</span>
                      <span className="text-[11px] text-white/25">SO{c.sos.length !== 1 ? 's' : ''}</span>
                    </div>
                    {modelos.length > 0 && <div className="text-[11px] text-white/30 mt-0.5 truncate max-w-[180px]">{modelos.join(' · ')}</div>}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${getStatusBadgeClass(status)}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 min-w-[120px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-teal-400' : pct > 0 ? 'bg-orange-400' : 'bg-white/10'}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-white/35 w-8 text-right">{pct}%</span>
                    </div>
                    <div className="text-[10px] text-white/25 mt-1">{qRecibida.toLocaleString()} / {qPedida.toLocaleString()} un.</div>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-[13px] font-semibold text-white">{plCount > 0 ? plCount : '—'}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-[13px] text-white">{fmtUSD(fobTotal)}</span>
                  </td>
                  <td className="py-3">
                    {confirmId === c.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-red-300 mr-1">¿Eliminar?</span>
                        <button
                          onClick={() => handleDelete(c.id)}
                          disabled={pendingId === c.id}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-red-500/20 text-red-300 hover:bg-red-500/30"
                          title="Confirmar eliminación"
                        >
                          {pendingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Sí
                        </button>
                        <button
                          onClick={() => { setConfirmId(null); setErrorMsg(null) }}
                          disabled={pendingId === c.id}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-white/50 hover:text-white/80"
                          title="Cancelar"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 justify-end">
                        <Link
                          href={`/compras/${c.id}`}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.04] border border-white/[0.06] text-white/60 hover:bg-white/[0.08] hover:text-white transition-colors"
                        >
                          Ver →
                        </Link>
                        <button
                          onClick={() => setConfirmId(c.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/40 hover:bg-red-500/15 hover:border-red-500/40 hover:text-red-300 transition-colors"
                          title="Eliminar compra"
                          aria-label="Eliminar compra"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-[13px] text-white/20">Sin órdenes en esta categoría</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
