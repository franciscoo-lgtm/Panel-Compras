export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Anchor, AlertTriangle, ArrowRight, TrendingUp, BarChart3, Activity, PieChart, Plane, Boxes, Layers } from 'lucide-react'
import { listEmbarques } from '@/app/lib/embarques'
import { getExecutiveKPIs, getAlerts } from '@/app/lib/dashboard'
import { KPICard } from '@/components/shared/KPICard'
import { StatusPill } from '@/components/shared/StatusPill'
import { DateRange } from '@/components/shared/DateRange'
import { EmbarquesPorMesChart } from '@/components/dashboard/EmbarquesPorMesChart'
import { TipoCargaDonut } from '@/components/dashboard/TipoCargaDonut'
import { ProximosArribosChart } from '@/components/dashboard/ProximosArribosChart'
import { DiscrepanciasTrendChart } from '@/components/dashboard/DiscrepanciasTrendChart'
import { DiasEntreEtapasChart } from '@/components/dashboard/DiasEntreEtapasChart'
import { ThroughputCbmChart } from '@/components/dashboard/ThroughputCbmChart'

const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default async function HomePage() {
  const [{ summaries: allSummaries, errors }, kpis] = await Promise.all([listEmbarques(), getExecutiveKPIs()])
  const summaries = allSummaries.filter(s => s.totalItems > 0)
  const alerts = await getAlerts(allSummaries)

  return (
    <div className="px-6 py-5 max-w-[1600px]">
      <h1 className="text-2xl font-display font-bold text-white tracking-tight mb-1">Tablero ejecutivo</h1>
      <p className="text-[12px] text-zinc-500 mb-6">
        Resumen operativo · solo embarques con CIPL cargado · &quot;arribado&quot; = llegó al depósito final
      </p>

      {errors.length > 0 && (
        <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md border border-amber-500/20 bg-amber-500/[0.05] text-[12px] text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Hay {errors.length} aviso{errors.length === 1 ? '' : 's'} al leer la planilla Comex. Revisá <Link href="/configuracion" className="underline">Configuración</Link>.</span>
        </div>
      )}

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <KPICard label="Valor en tránsito"      value={fmtUSD.format(kpis.valorEnTransitoUSD)} hint={`${kpis.cbmEnTransito.toFixed(1)} CBM`}            accent="red"     />
        <KPICard label="Embarques activos"      value={kpis.embarquesActivos.toString()}        hint="pendiente + en tránsito"                          accent="blue"    />
        <KPICard label="Próximos 7 días"        value={kpis.proximosArribos7d.toString()}       hint="ETA próximos 7 días"                              accent="emerald" />
        <KPICard label="Retrasados"             value={kpis.embarquesRetrasados.toString()}     hint="ETA pasada hace +5 días"                          accent="red"     />
      </div>

      {/* KPIs secundarios - métricas de proceso */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KPICard label="Tránsito promedio"      value={`${kpis.tiempoMedioTransitoDias}d`}      hint="ETD → Depósito"           accent="zinc" />
        <KPICard label="SLA cumplimiento"       value={`${kpis.slaCumplimiento}%`}              hint="depósito ≤ 30 días"        accent="amber" />
        <KPICard label="Lead time total"        value={`${kpis.leadTimePagoArriboDias}d`}       hint="Pago → Depósito"           accent="zinc" />
        <KPICard label="Anticipación Comex"     value={`${kpis.anticipacionComexDias}d`}        hint="Instrucción → ETD"         accent="zinc" />
        <KPICard label="Demora vs plan"         value={`${kpis.pctDemoraVsPlan}%`}              hint="llegaron después de ETA"   accent="amber" />
        <KPICard label="Unidades del mes"       value={kpis.unidadesArribadasMes.toLocaleString()} hint="arribadas al depósito" accent="emerald" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <section className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Plane className="w-4 h-4 text-emerald-400" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Próximos arribos</h2>
            <span className="ml-auto text-[10px] text-zinc-500">próximas 4 semanas</span>
          </div>
          <div className="p-3"><ProximosArribosChart data={kpis.proximosArribos} /></div>
        </section>

        <section className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Días promedio por etapa</h2>
            <span className="ml-auto text-[10px] text-zinc-500">cuello de botella</span>
          </div>
          <div className="p-3"><DiasEntreEtapasChart data={kpis.diasEntreEtapas} /></div>
        </section>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <section className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#E30613]" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Embarques por mes</h2>
            <span className="ml-auto text-[10px] text-zinc-500">por ETD · últimos 12</span>
          </div>
          <div className="p-3"><EmbarquesPorMesChart data={kpis.embarquesPorMes} /></div>
        </section>

        <section className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Boxes className="w-4 h-4 text-blue-400" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">CBM arribado por mes</h2>
            <span className="ml-auto text-[10px] text-zinc-500">throughput operativo</span>
          </div>
          <div className="p-3"><ThroughputCbmChart data={kpis.throughputCbmPorMes} /></div>
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
            {summaries.length === 0 && <p className="px-4 py-8 text-center text-zinc-500 text-[12px]">Sin embarques con CIPL cargado.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
