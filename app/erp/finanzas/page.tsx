export const dynamic = 'force-dynamic'

import { AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { gasGet } from '@/app/lib/gas'

type CuentaCobrar = {
  cc_id: string
  factura_id?: string
  cliente_id: string
  monto_usd: number
  tipo_cambio_emision?: number
  fecha_emision: string
  fecha_vencimiento?: string
  estado: string
  canal?: string
  notas?: string
}

type CuentaPagar = {
  cp_id: string
  proveedor_id: string
  monto_usd: number
  fecha_emision: string
  fecha_vencimiento?: string
  estado: string
  descripcion?: string
}

type TipoCambio = {
  tc_id: string
  tipo: string
  valor: number
  fecha: string
  fuente?: string
}

const CC_ESTADO: Record<string, { label: string; cls: string }> = {
  pendiente:  { label: 'Pendiente',   cls: 'bg-amber-500/15   text-amber-400   border-amber-500/30'  },
  parcial:    { label: 'Parcial',     cls: 'bg-blue-500/15    text-blue-400    border-blue-500/30'   },
  cobrada:    { label: 'Cobrada',     cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'},
  vencida:    { label: 'Vencida',     cls: 'bg-red-500/15     text-red-400     border-red-500/30'    },
  cancelada:  { label: 'Cancelada',   cls: 'bg-zinc-500/10    text-zinc-400    border-zinc-500/20'   },
}

export default async function FinanzasPage() {
  let cuentasCobrar: CuentaCobrar[] = []
  let cuentasPagar: CuentaPagar[] = []
  let tiposCambio: TipoCambio[] = []
  let error: string | null = null

  try {
    ;[cuentasCobrar, cuentasPagar, tiposCambio] = await Promise.all([
      gasGet<CuentaCobrar[]>('listarCuentasCobrar'),
      gasGet<CuentaPagar[]>('listarCuentasPagar'),
      gasGet<TipoCambio[]>('listarTiposCambio'),
    ])
  } catch (err) {
    error = (err as Error).message
  }

  const pendienteCobrar = cuentasCobrar
    .filter(c => c.estado === 'pendiente' || c.estado === 'parcial')
    .reduce((s, c) => s + (c.monto_usd ?? 0), 0)
  const pendientePagar = cuentasPagar
    .filter(c => c.estado === 'pendiente' || c.estado === 'parcial')
    .reduce((s, c) => s + (c.monto_usd ?? 0), 0)
  const tcActual = tiposCambio.length > 0
    ? [...tiposCambio].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
    : null

  return (
    <div className="px-8 py-10 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="ERP · Finanzas"
        title="Finanzas."
        description="Cuentas a cobrar y pagar en USD, pagos recibidos y evolución del tipo de cambio."
        meta={`${cuentasCobrar.length} CC · ${cuentasPagar.length} CP`}
      />

      {error && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/[0.04] text-[12px] text-red-300 fade-rise">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="glass-card p-5 fade-rise fade-rise-1">
          <p className="eyebrow mb-3">Por cobrar (USD)</p>
          <p className="text-[28px] font-display font-bold text-emerald-300 tabular-nums leading-none">
            ${Math.round(pendienteCobrar).toLocaleString()}
          </p>
          <p className="mt-2 text-[11px] text-white/30">
            {cuentasCobrar.filter(c => ['pendiente', 'parcial'].includes(c.estado)).length} cuentas activas
          </p>
        </div>
        <div className="glass-card p-5 fade-rise fade-rise-2">
          <p className="eyebrow mb-3">Por pagar (USD)</p>
          <p className="text-[28px] font-display font-bold text-amber-300 tabular-nums leading-none">
            ${Math.round(pendientePagar).toLocaleString()}
          </p>
          <p className="mt-2 text-[11px] text-white/30">
            {cuentasPagar.filter(c => ['pendiente', 'parcial'].includes(c.estado)).length} cuentas activas
          </p>
        </div>
        <div className="glass-card p-5 fade-rise fade-rise-3">
          <p className="eyebrow mb-3">TC oficial (ARS/USD)</p>
          <p className="text-[28px] font-display font-bold text-white tabular-nums leading-none">
            {tcActual ? `$${tcActual.valor.toLocaleString('es-AR')}` : '—'}
          </p>
          <p className="mt-2 text-[11px] text-white/30">
            {tcActual ? tcActual.fecha.slice(0, 10) : 'Sin datos'}
          </p>
        </div>
      </div>

      {/* Tipos de cambio recientes */}
      {tiposCambio.length > 0 && (
        <section className="mb-10 fade-rise fade-rise-3">
          <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-4">Tipos de Cambio Recientes</h2>
          <div className="glass-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Tipo</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Valor ARS/USD</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {[...tiposCambio].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 20).map((tc, i) => (
                  <tr key={tc.tc_id}
                    className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-white/70 capitalize">{tc.tipo.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-white/85">
                      ${tc.valor.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 text-right text-white/35 text-[11px]">{tc.fecha.slice(0, 10)}</td>
                    <td className="px-4 py-2.5 text-white/35 text-[11px]">{tc.fuente ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Cuentas por cobrar */}
      <section className="mb-10 fade-rise fade-rise-4">
        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-4">Cuentas por Cobrar</h2>
        {cuentasCobrar.length === 0 ? (
          <div className="glass-card p-10 text-center text-white/25 text-[13px]">
            {error ? 'Error al cargar' : 'Sin cuentas registradas'}
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-white/35 font-medium">ID</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Cliente</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Canal</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Estado</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Monto USD</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">TC emisión</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Emisión</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Vencimiento</th>
                </tr>
              </thead>
              <tbody>
                {cuentasCobrar.map((cc, i) => {
                  const est = CC_ESTADO[cc.estado] ?? { label: cc.estado, cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' }
                  const vencida = cc.estado === 'pendiente' && cc.fecha_vencimiento && cc.fecha_vencimiento < new Date().toISOString().slice(0, 10)
                  return (
                    <tr key={cc.cc_id}
                      className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-[10px] text-white/40">{cc.cc_id}</td>
                      <td className="px-4 py-2.5 text-white/80">{cc.cliente_id}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold uppercase ${cc.canal === 'B' ? 'text-amber-400' : 'text-blue-400'}`}>
                          {cc.canal ? `Canal ${cc.canal}` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${vencida ? CC_ESTADO.vencida.cls : est.cls}`}>
                          {vencida ? 'Vencida' : est.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-white/85">
                        ${(cc.monto_usd ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white/40 text-[11px]">
                        {cc.tipo_cambio_emision ? `$${cc.tipo_cambio_emision.toLocaleString('es-AR')}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-white/35 text-[11px]">
                        {cc.fecha_emision ? cc.fecha_emision.slice(0, 10) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right text-[11px] ${vencida ? 'text-red-400' : 'text-white/35'}`}>
                        {cc.fecha_vencimiento ? cc.fecha_vencimiento.slice(0, 10) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Cuentas por pagar */}
      <section className="fade-rise fade-rise-5">
        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-4">Cuentas por Pagar</h2>
        {cuentasPagar.length === 0 ? (
          <div className="glass-card p-10 text-center text-white/25 text-[13px]">
            {error ? 'Error al cargar' : 'Sin cuentas por pagar'}
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-white/35 font-medium">ID</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Proveedor</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Descripción</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Estado</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Monto USD</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Vencimiento</th>
                </tr>
              </thead>
              <tbody>
                {cuentasPagar.map((cp, i) => {
                  const est = CC_ESTADO[cp.estado] ?? { label: cp.estado, cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' }
                  return (
                    <tr key={cp.cp_id}
                      className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-[10px] text-white/40">{cp.cp_id}</td>
                      <td className="px-4 py-2.5 text-white/80">{cp.proveedor_id}</td>
                      <td className="px-4 py-2.5 text-white/50 max-w-[200px] truncate">{cp.descripcion ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${est.cls}`}>
                          {est.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-white/85">
                        ${(cp.monto_usd ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right text-white/35 text-[11px]">
                        {cp.fecha_vencimiento ? cp.fecha_vencimiento.slice(0, 10) : '—'}
                      </td>
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
