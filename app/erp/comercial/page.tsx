export const dynamic = 'force-dynamic'

import { AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { gasGet } from '@/app/lib/gas'

type Presupuesto = {
  presupuesto_id: string
  cliente_id: string
  fecha: string
  validez_dias?: number
  estado: string
  total_usd: number
  referencia?: string
  creado_por?: string
}

type Factura = {
  factura_id: string
  presupuesto_id?: string
  cliente_id: string
  entidad_legal_id?: string
  fecha: string
  total_usd: number
  tiene_iva?: boolean
  estado: string
  canal?: string
}

type Remito = {
  remito_id: string
  factura_id?: string
  cliente_id: string
  fecha?: string
  estado: string
}

const PPTO_ESTADO: Record<string, { label: string; cls: string }> = {
  borrador:  { label: 'Borrador',  cls: 'bg-zinc-500/10    text-zinc-400    border-zinc-500/20'   },
  enviado:   { label: 'Enviado',   cls: 'bg-blue-500/15    text-blue-400    border-blue-500/30'   },
  aprobado:  { label: 'Aprobado',  cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'},
  rechazado: { label: 'Rechazado', cls: 'bg-red-500/15     text-red-400     border-red-500/30'    },
  facturado: { label: 'Facturado', cls: 'bg-purple-500/15  text-purple-400  border-purple-500/30' },
  vencido:   { label: 'Vencido',   cls: 'bg-amber-500/15   text-amber-400   border-amber-500/30'  },
}

const REMITO_ESTADO: Record<string, { label: string; cls: string }> = {
  pendiente:  { label: 'Pendiente',  cls: 'bg-amber-500/15   text-amber-400   border-amber-500/30'  },
  entregado:  { label: 'Entregado',  cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'},
  cancelado:  { label: 'Cancelado',  cls: 'bg-red-500/15     text-red-400     border-red-500/30'    },
}

export default async function ComercialPage() {
  let presupuestos: Presupuesto[] = []
  let facturas: Factura[] = []
  let remitos: Remito[] = []
  let error: string | null = null

  try {
    ;[presupuestos, facturas, remitos] = await Promise.all([
      gasGet<Presupuesto[]>('listarPresupuestos'),
      gasGet<Factura[]>('listarFacturas'),
      gasGet<Remito[]>('listarRemitos'),
    ])
  } catch (err) {
    error = (err as Error).message
  }

  const pptoAprobados  = presupuestos.filter(p => p.estado === 'aprobado').length
  const totalFacturado = facturas.reduce((s, f) => s + (f.total_usd ?? 0), 0)
  const remitosPendientes = remitos.filter(r => r.estado === 'pendiente').length

  return (
    <div className="px-8 py-10 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="ERP · Comercial"
        title="Comercial."
        description="Presupuestos, facturas Canal A/B y remitos de entrega."
        meta={`${presupuestos.length} presupuestos · ${facturas.length} facturas`}
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
          { label: 'Presupuestos',     value: presupuestos.length.toString(),                       delay: 1 },
          { label: 'Aprobados',        value: pptoAprobados.toString(),                             delay: 2 },
          { label: 'Facturado USD',    value: `$${Math.round(totalFacturado).toLocaleString()}`,    delay: 3 },
          { label: 'Remitos pendientes', value: remitosPendientes.toString(),                       delay: 4 },
        ].map(({ label, value, delay }) => (
          <div key={label} className={`glass-card p-5 fade-rise fade-rise-${delay}`}>
            <p className="eyebrow mb-3">{label}</p>
            <p className="text-[28px] font-display font-bold text-white tabular-nums leading-none">{value}</p>
          </div>
        ))}
      </div>

      {/* Presupuestos */}
      <section className="mb-10 fade-rise fade-rise-3">
        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-4">Presupuestos</h2>
        {presupuestos.length === 0 ? (
          <div className="glass-card p-10 text-center text-white/25 text-[13px]">
            {error ? 'Error al cargar' : 'Sin presupuestos registrados'}
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-white/35 font-medium">ID</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Cliente</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Referencia</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Estado</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Total USD</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Fecha</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Validez</th>
                </tr>
              </thead>
              <tbody>
                {presupuestos.map((p, i) => {
                  const est = PPTO_ESTADO[p.estado] ?? { label: p.estado, cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' }
                  return (
                    <tr key={p.presupuesto_id}
                      className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-[10px] text-white/40">{p.presupuesto_id}</td>
                      <td className="px-4 py-2.5 text-white/80">{p.cliente_id}</td>
                      <td className="px-4 py-2.5 text-white/50 max-w-[160px] truncate">{p.referencia ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${est.cls}`}>
                          {est.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-white/85">
                        ${(p.total_usd ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right text-white/35 text-[11px]">{p.fecha ? p.fecha.slice(0, 10) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-white/35 text-[11px]">
                        {p.validez_dias != null ? `${p.validez_dias}d` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Facturas */}
      <section className="mb-10 fade-rise fade-rise-4">
        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-4">Facturas</h2>
        {facturas.length === 0 ? (
          <div className="glass-card p-10 text-center text-white/25 text-[13px]">
            {error ? 'Error al cargar' : 'Sin facturas emitidas'}
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-white/35 font-medium">ID</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Cliente</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Entidad</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Canal</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Estado</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Total USD</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((f, i) => {
                  const est = PPTO_ESTADO[f.estado] ?? { label: f.estado, cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' }
                  return (
                    <tr key={f.factura_id}
                      className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-[10px] text-white/40">{f.factura_id}</td>
                      <td className="px-4 py-2.5 text-white/80">{f.cliente_id}</td>
                      <td className="px-4 py-2.5 text-white/45 text-[11px]">{f.entidad_legal_id ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${f.canal === 'B' ? 'text-amber-400' : 'text-blue-400'}`}>
                          Canal {f.canal ?? 'A'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${est.cls}`}>
                          {est.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-white/85">
                        ${(f.total_usd ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right text-white/35 text-[11px]">{f.fecha ? f.fecha.slice(0, 10) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Remitos */}
      <section className="fade-rise fade-rise-5">
        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-4">Remitos</h2>
        {remitos.length === 0 ? (
          <div className="glass-card p-10 text-center text-white/25 text-[13px]">
            {error ? 'Error al cargar' : 'Sin remitos registrados'}
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-white/35 font-medium">ID</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Factura</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Cliente</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Estado</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {remitos.map((r, i) => {
                  const est = REMITO_ESTADO[r.estado] ?? { label: r.estado, cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' }
                  return (
                    <tr key={r.remito_id}
                      className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-[10px] text-white/40">{r.remito_id}</td>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-white/40">{r.factura_id ?? '—'}</td>
                      <td className="px-4 py-2.5 text-white/80">{r.cliente_id}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${est.cls}`}>
                          {est.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-white/35 text-[11px]">{r.fecha ? r.fecha.slice(0, 10) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
