export const dynamic = 'force-dynamic'

import { AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { gasGet } from '@/app/lib/gas'

type TicketRMA = {
  ticket_id: string
  serial_id: string
  cliente_id: string
  tipo_falla?: string
  descripcion?: string
  fecha_apertura: string
  fecha_cierre?: string
  estado: string
  resolucion?: string
  notas?: string
}

type ConsumoRMA = {
  consumo_id: string
  ticket_id: string
  producto_id: string
  cantidad: number
  costo_unitario_usd?: number
  fecha?: string
}

const TICKET_ESTADO: Record<string, { label: string; cls: string }> = {
  abierto:              { label: 'Abierto',           cls: 'bg-red-500/15     text-red-400     border-red-500/30'    },
  en_diagnostico:       { label: 'En diagnóstico',    cls: 'bg-blue-500/15    text-blue-400    border-blue-500/30'   },
  en_reparacion:        { label: 'En reparación',     cls: 'bg-purple-500/15  text-purple-400  border-purple-500/30' },
  esperando_repuestos:  { label: 'Esp. repuestos',    cls: 'bg-amber-500/15   text-amber-400   border-amber-500/30'  },
  resuelto:             { label: 'Resuelto',          cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'},
  cerrado:              { label: 'Cerrado',           cls: 'bg-zinc-500/10    text-zinc-400    border-zinc-500/20'   },
}

export default async function PostventaPage() {
  let tickets: TicketRMA[] = []
  let consumos: ConsumoRMA[] = []
  let error: string | null = null

  try {
    ;[tickets, consumos] = await Promise.all([
      gasGet<TicketRMA[]>('listarTicketsRMA'),
      gasGet<ConsumoRMA[]>('listarConsumoRMA'),
    ])
  } catch (err) {
    error = (err as Error).message
  }

  const abiertos   = tickets.filter(t => !['cerrado', 'resuelto'].includes(t.estado)).length
  const cerrados   = tickets.filter(t => t.estado === 'cerrado').length
  const costoTotal = consumos.reduce((s, c) => s + c.cantidad * (c.costo_unitario_usd ?? 0), 0)
  const garantiaDJI = tickets.filter(t => t.resolucion === 'credito_garantia').length

  return (
    <div className="px-8 py-10 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="ERP · Postventa"
        title="Postventa / RMA."
        description="Tickets de soporte técnico, reparaciones, consumo de repuestos y garantías DJI."
        meta={`${tickets.length} tickets`}
      />

      {error && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/[0.04] text-[12px] text-red-300 fade-rise">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Tickets abiertos',   value: abiertos.toString(),                               cls: abiertos > 0 ? 'text-red-300' : 'text-white', delay: 1 },
          { label: 'Tickets cerrados',   value: cerrados.toString(),                               cls: 'text-white', delay: 2 },
          { label: 'Costo repuestos',    value: `$${Math.round(costoTotal).toLocaleString()}`,     cls: 'text-white', delay: 3 },
          { label: 'Garantías DJI',      value: garantiaDJI.toString(),                           cls: 'text-white', delay: 4 },
        ].map(({ label, value, cls, delay }) => (
          <div key={label} className={`glass-card p-5 fade-rise fade-rise-${delay}`}>
            <p className="eyebrow mb-3">{label}</p>
            <p className={`text-[28px] font-display font-bold tabular-nums leading-none ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tickets */}
      <section className="mb-10 fade-rise fade-rise-3">
        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-4">Tickets RMA</h2>
        {tickets.length === 0 ? (
          <div className="glass-card p-10 text-center text-white/25 text-[13px]">
            {error ? 'Error al cargar' : 'Sin tickets registrados'}
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Ticket</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Serial</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Cliente</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Falla</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Estado</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Resolución</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Apertura</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Cierre</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t, i) => {
                  const est = TICKET_ESTADO[t.estado] ?? { label: t.estado, cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' }
                  return (
                    <tr key={t.ticket_id}
                      className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-[10px] text-white/40">{t.ticket_id}</td>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-white/55">{t.serial_id}</td>
                      <td className="px-4 py-2.5 text-white/80">{t.cliente_id}</td>
                      <td className="px-4 py-2.5 text-white/50 max-w-[140px] truncate" title={t.tipo_falla}>
                        {t.tipo_falla ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${est.cls}`}>
                          {est.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-white/40 text-[11px] capitalize">
                        {t.resolucion ? t.resolucion.replace(/_/g, ' ') : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-white/35 text-[11px]">
                        {t.fecha_apertura ? t.fecha_apertura.slice(0, 10) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-white/35 text-[11px]">
                        {t.fecha_cierre ? t.fecha_cierre.slice(0, 10) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Consumo de repuestos */}
      {consumos.length > 0 && (
        <section className="fade-rise fade-rise-4">
          <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-4">Consumo de Repuestos</h2>
          <div className="glass-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-white/35 font-medium">ID</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Ticket</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Producto</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Cantidad</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Costo unit. USD</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Total USD</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {consumos.map((c, i) => (
                  <tr key={c.consumo_id}
                    className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}
                  >
                    <td className="px-4 py-2.5 font-mono text-[10px] text-white/40">{c.consumo_id}</td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-white/55">{c.ticket_id}</td>
                    <td className="px-4 py-2.5 text-white/80">{c.producto_id}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white/70">{c.cantidad}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white/55">
                      {c.costo_unitario_usd != null ? `$${c.costo_unitario_usd.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white/85">
                      {c.costo_unitario_usd != null ? `$${(c.cantidad * c.costo_unitario_usd).toFixed(0)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-white/35 text-[11px]">
                      {c.fecha ? c.fecha.slice(0, 10) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
