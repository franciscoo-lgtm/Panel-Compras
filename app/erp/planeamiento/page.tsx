export const dynamic = 'force-dynamic'

import { AlertCircle, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { gasGet } from '@/app/lib/gas'

type AlertaProducto = {
  producto_id: string
  nombre?: string
  stockActual: number
  stockSeguridad: number
  alerta: 'COMPRAR_YA' | 'COMPRAR_PRONTO' | 'OK'
  cantidadSugerida: number
  diasHastaRuptura?: number
  leadTimeDias?: number
  ventaDiaria?: number
}

type ConfigReposicion = {
  producto_id: string
  nombre?: string
  stock_seguridad: number
  lote_minimo_compra: number
  lead_time_dias: number
  proveedor_preferido_id?: string
}

const ALERTA_CONFIG = {
  COMPRAR_YA: {
    label: 'Comprar ya',
    cls:   'bg-red-500/15 text-red-400 border-red-500/30',
    icon:  AlertCircle,
    iconCls: 'text-red-400',
  },
  COMPRAR_PRONTO: {
    label: 'Comprar pronto',
    cls:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
    icon:  Clock,
    iconCls: 'text-amber-400',
  },
  OK: {
    label: 'OK',
    cls:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    icon:  CheckCircle2,
    iconCls: 'text-emerald-400',
  },
}

export default async function PlaneamientoPage() {
  let alertas: AlertaProducto[] = []
  let configs: ConfigReposicion[] = []
  let error: string | null = null

  try {
    ;[alertas, configs] = await Promise.all([
      gasGet<AlertaProducto[]>('analizarTodosProductos'),
      gasGet<ConfigReposicion[]>('listarConfigReposicion'),
    ])
  } catch (err) {
    error = (err as Error).message
  }

  const comprarYa    = alertas.filter(a => a.alerta === 'COMPRAR_YA').length
  const comprarPronto = alertas.filter(a => a.alerta === 'COMPRAR_PRONTO').length
  const ok           = alertas.filter(a => a.alerta === 'OK').length

  // Sort: COMPRAR_YA first, then COMPRAR_PRONTO, then OK
  const alertasOrdenadas = [...alertas].sort((a, b) => {
    const order = { COMPRAR_YA: 0, COMPRAR_PRONTO: 1, OK: 2 }
    return order[a.alerta] - order[b.alerta]
  })

  return (
    <div className="px-8 py-10 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="ERP · Planeamiento"
        title="Planeamiento."
        description="Análisis de punto de reorden, proyección de ventas y alertas de reposición de stock."
        meta={`${alertas.length} productos analizados`}
      />

      {error && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/[0.04] text-[12px] text-red-300 fade-rise">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="glass-card p-5 fade-rise fade-rise-1 border-red-500/20">
          <p className="eyebrow mb-3">Comprar ya</p>
          <p className={`text-[32px] font-display font-bold tabular-nums leading-none ${comprarYa > 0 ? 'text-red-300' : 'text-white/30'}`}>
            {comprarYa}
          </p>
          <p className="mt-2 text-[11px] text-white/30">stock en o bajo el mínimo</p>
        </div>
        <div className="glass-card p-5 fade-rise fade-rise-2">
          <p className="eyebrow mb-3">Comprar pronto</p>
          <p className={`text-[32px] font-display font-bold tabular-nums leading-none ${comprarPronto > 0 ? 'text-amber-300' : 'text-white/30'}`}>
            {comprarPronto}
          </p>
          <p className="mt-2 text-[11px] text-white/30">≤ 30 días hasta ruptura</p>
        </div>
        <div className="glass-card p-5 fade-rise fade-rise-3">
          <p className="eyebrow mb-3">Sin alerta</p>
          <p className="text-[32px] font-display font-bold text-white tabular-nums leading-none">{ok}</p>
          <p className="mt-2 text-[11px] text-white/30">stock suficiente</p>
        </div>
      </div>

      {/* Alert urgente */}
      {comprarYa > 0 && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/[0.04] text-[12px] text-red-200 fade-rise fade-rise-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
          <span>
            <strong>{comprarYa} producto{comprarYa !== 1 ? 's' : ''}</strong> con stock en o bajo el punto de reorden.
            Verificar con proveedores para emitir OC inmediatamente.
          </span>
        </div>
      )}

      {/* Análisis por producto */}
      <section className="mb-10 fade-rise fade-rise-4">
        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-4">Análisis de Reposición</h2>
        {alertasOrdenadas.length === 0 ? (
          <div className="glass-card p-10 text-center text-white/25 text-[13px]">
            {error ? 'Error al cargar' : 'Sin productos configurados para planeamiento'}
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Producto</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Alerta</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Stock actual</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Stock mín.</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Días hasta ruptura</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Venta diaria</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Cantidad sugerida</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Lead time</th>
                </tr>
              </thead>
              <tbody>
                {alertasOrdenadas.map((a, i) => {
                  const cfg = ALERTA_CONFIG[a.alerta]
                  const Icon = cfg.icon
                  return (
                    <tr key={a.producto_id}
                      className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-white/85">{a.nombre ?? a.producto_id}</p>
                        <p className="text-[10px] text-white/30 font-mono">{a.producto_id}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.cls}`}>
                          <Icon className={`w-3 h-3 ${cfg.iconCls}`} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${a.alerta === 'COMPRAR_YA' ? 'text-red-300' : 'text-white/85'}`}>
                        {a.stockActual}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white/45">{a.stockSeguridad}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${
                        a.diasHastaRuptura == null ? 'text-white/25' :
                        a.diasHastaRuptura <= 0 ? 'text-red-300 font-semibold' :
                        a.diasHastaRuptura <= 30 ? 'text-amber-300' : 'text-white/60'
                      }`}>
                        {a.diasHastaRuptura != null ? (a.diasHastaRuptura <= 0 ? 'ROTO' : `${Math.ceil(a.diasHastaRuptura)}d`) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white/40 text-[11px]">
                        {a.ventaDiaria != null ? a.ventaDiaria.toFixed(1) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${a.cantidadSugerida > 0 ? 'text-[#31AF4F]' : 'text-white/25'}`}>
                        {a.cantidadSugerida > 0 ? a.cantidadSugerida : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white/40 text-[11px]">
                        {a.leadTimeDias != null ? `${a.leadTimeDias}d` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Config de reposición */}
      {configs.length > 0 && (
        <section className="fade-rise fade-rise-5">
          <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-4">Configuración de Reposición</h2>
          <div className="glass-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Producto</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Stock seg.</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Lote mínimo</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Lead time</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Proveedor pref.</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((c, i) => (
                  <tr key={c.producto_id}
                    className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}
                  >
                    <td className="px-4 py-2.5">
                      <p className="text-white/80">{c.nombre ?? c.producto_id}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white/70">{c.stock_seguridad}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white/70">{c.lote_minimo_compra}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white/55">{c.lead_time_dias}d</td>
                    <td className="px-4 py-2.5 text-white/40 text-[11px]">{c.proveedor_preferido_id ?? '—'}</td>
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
