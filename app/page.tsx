export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Anchor, AlertTriangle, ArrowRight, Building2, TrendingUp, BarChart3, Activity, PieChart } from 'lucide-react'
import { listEmbarques } from '@/app/lib/embarques'
import { getExecutiveKPIs, getAlerts } from '@/app/lib/dashboard'
import { KPICard } from '@/components/shared/KPICard'
import { StatusPill } from '@/components/shared/StatusPill'
import { DateRange } from '@/components/shared/DateRange'
import { EmbarquesPorMesChart } from '@/components/dashboard/EmbarquesPorMesChart'
import { TipoCargaDonut } from '@/components/dashboard/TipoCargaDonut'
import { TopProveedoresChart } from '@/components/dashboard/TopProveedoresChart'
import { DiscrepanciasTrendChart } from '@/components/dashboard/DiscrepanciasTrendChart'

const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default async function HomePage() {
  const [{ summaries, errors }, kpis] = await Promise.all([listEmbarques(), getExecutiveKPIs()])
  const alerts = await getAlerts(summaries)

  return (
    <div className="px-6 py-5 max-w-[1600px]">
      <h1 className="text-2xl font-display font-bold text-white tracking-tight mb-1">Tablero ejecutivo</h1>
      <p className="text-[12px] text-zinc-500 mb-6">Resumen operativo de importaciones DJI Argentina</p>

      {errors.length > 0 && (
        <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md border border-amber-500/20 bg-amber-500/[0.05] text-[12px] text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Hay {errors.length} aviso{errors.length === 1 ? '' : 's'} al leer la planilla Comex. Revisá <Link href="/configuracion" className="underline">Configuración</Link>.</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KPICard label="Valor en tránsito"   value={fmtUSD.format(kpis.valorEnTransitoUSD)} hint="FOB SOs activos"      accent="red"     />
        <KPICard label="Embarques activos"   value={kpis.embarquesActivos.toString()}        hint="pendiente + tránsito" accent="blue"    />
        <KPICard label="Unidades del mes"    value={kpis.unidadesArribadasMes.toLocaleString()} hint="arribadas este mes" accent="emerald" />
        <KPICard label="SLA cumplimiento"    value={`${kpis.slaCumplimiento}%`}              hint="arribo ≤ 21 días"    accent="amber"   />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <section className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#E30613]" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Embarques por mes</h2>
            <span className="ml-auto text-[10px] text-zinc-500">últimos 12</span>
          </div>
          <div className="p-3"><EmbarquesPorMesChart data={kpis.embarquesPorMes} /></div>
        </section>

        <section className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Building2 className="w-4 h-4 text-purple-400" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Top proveedores</h2>
            <span className="ml-auto text-[10px] text-zinc-500">por FOB total</span>
          </div>
          <div className="p-3"><TopProveedoresChart data={kpis.topProveedores} /></div>
        </section>

        <section className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Tendencia discrepancias</h2>
            <span className="ml-auto text-[10px] text-zinc-500">% ítems con dif. qty</span>
          </div>
          <div className="p-3"><DiscrepanciasTrendChart data={kpis.discrepanciasPorMes} /></div>
        </section>

        <section className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <PieChart className="w-4 h-4 text-blue-400" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Distribución tipo de carga</h2>
          </div>
          <div className="p-3"><TipoCargaDonut data={kpis.tipoCargaDist} /></div>
        </section>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Bandeja de alertas</h2>
            <span className="ml-auto text-[10px] text-zinc-500">{alerts.length}</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {alerts.length === 0 ? (
              <p className="px-4 py-8 text-center text-zinc-500 text-[12px]">Sin alertas. Todo en orden.</p>
            ) : alerts.slice(0, 12).map((a, i) => {
              const dot = a.kind === 'critical' ? 'bg-red-500' : a.kind === 'warn' ? 'bg-amber-500' : 'bg-blue-500'
              const body = (
                <div className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                  <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
                  <span className="text-[12px] text-zinc-300 flex-1 truncate">{a.text}</span>
                  {a.href && <ArrowRight className="w-3.5 h-3.5 text-zinc-600" />}
                </div>
              )
              return a.href
                ? <Link key={i} href={a.href}>{body}</Link>
                : <div key={i}>{body}</div>
            })}
          </div>
        </section>

        <section className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Anchor className="w-4 h-4 text-[#E30613]" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Últimos embarques</h2>
            <Link href="/embarques" className="ml-auto text-[10px] text-zinc-500 hover:text-white">Ver todos →</Link>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {summaries.slice(0, 6).map(s => (
              <Link key={s.embarqueNo} href={`/embarques/${encodeURIComponent(s.embarqueNo)}`} className="px-4 py-2.5 flex items-center gap-2 hover:bg-white/[0.02] transition-colors">
                <span className="font-mono text-[11px] font-semibold text-white">{s.embarqueNo}</span>
                <StatusPill estado={s.estado} className="text-[9px]" />
                <span className="ml-auto"><DateRange etd={s.etd} eta={s.eta} /></span>
              </Link>
            ))}
            {summaries.length === 0 && <p className="px-4 py-8 text-center text-zinc-500 text-[12px]">Sin embarques cargados.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
