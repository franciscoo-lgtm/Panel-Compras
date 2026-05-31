export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Anchor, AlertTriangle, ArrowUpRight, Plane, Boxes, Layers, Activity, TrendingUp, BarChart3 } from 'lucide-react'
import { listEmbarques } from '@/app/lib/embarques'
import { getExecutiveKPIs, getAlerts, type AlertItem } from '@/app/lib/dashboard'
import { AlertasBandeja } from '@/components/dashboard/AlertasBandeja'
import { StatusPill } from '@/components/shared/StatusPill'
import { DateRange } from '@/components/shared/DateRange'
import { EmbarquesPorMesChart } from '@/components/dashboard/EmbarquesPorMesChart'
import { ProximosArribosChart } from '@/components/dashboard/ProximosArribosChart'
import { DiscrepanciasTrendChart } from '@/components/dashboard/DiscrepanciasTrendChart'
import { DiasEntreEtapasChart } from '@/components/dashboard/DiasEntreEtapasChart'
import { ThroughputCbmChart } from '@/components/dashboard/ThroughputCbmChart'

const fmtUSD       = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtUSDCompact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })
const fmtN         = new Intl.NumberFormat('es-AR')

const MONTH_NAMES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export default async function HomePage() {
  const [{ summaries: allSummaries, errors }, kpis] = await Promise.all([listEmbarques(), getExecutiveKPIs()])
  const summaries = allSummaries.filter(s => s.totalItems > 0)
  const alerts = await getAlerts(allSummaries)

  const now = new Date()
  const monthLabel = `${MONTH_NAMES_ES[now.getMonth()]} ${now.getFullYear()}`

  return (
    <div className="px-8 py-10 max-w-[1500px] mx-auto">

      {/* ── Eyebrow + Hero header ────────────────────────────────────────── */}
      <header className="mb-12 fade-rise">
        <div className="flex items-baseline justify-between mb-3">
          <span className="eyebrow">Bidcom Agro · Panel de Compras</span>
          <span className="eyebrow tabular-nums">{monthLabel}</span>
        </div>
        <h1 className="display-lg text-white">Panel ejecutivo.</h1>
        <p className="mt-3 text-[13px] text-white/45 max-w-2xl leading-relaxed">
          Resumen operativo de embarques activos con CIPL cargado. Un embarque se considera <em className="text-white/70 not-italic">arribado</em> cuando alcanza el depósito final.
        </p>
        <div className="hairline mt-8" />
      </header>

      {errors.length > 0 && (
        <div className="mb-8 flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.03] text-[12px] text-amber-200/90 fade-rise fade-rise-1">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errors.length} aviso{errors.length === 1 ? '' : 's'} al leer la planilla Comex. Revisá <Link href="/configuracion" className="underline decoration-amber-500/40 hover:decoration-amber-300">Configuración</Link>.</span>
        </div>
      )}

      {/* ── HERO KPIs: asymmetric, 2/3 vs 1/3 split ──────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">

        {/* Hero: Valor en tránsito — el más importante, dos columnas */}
        <article className="lg:col-span-2 glass-card p-8 relative overflow-hidden fade-rise fade-rise-1">
          <div className="absolute -top-32 -right-32 w-64 h-64 rounded-full bg-[#31AF4F]/10 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <span className="eyebrow">FOB en tránsito</span>
              <span className="text-[10px] text-white/30 tabular-nums">{kpis.cbmEnTransito.toFixed(1)} CBM</span>
            </div>
            <div className="flex items-baseline gap-3 mb-6">
              <span className="display-xl text-white tabular-nums">{fmtUSDCompact.format(kpis.valorEnTransitoUSD)}</span>
              <span className="text-[15px] text-white/40 mb-2 tabular-nums">{fmtUSD.format(kpis.valorEnTransitoUSD)}</span>
            </div>
            <div className="flex items-center gap-8 text-[12px]">
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-white/35 mb-1">Activos</p>
                <p className="text-[20px] font-display font-semibold text-white tabular-nums">{kpis.embarquesActivos}</p>
              </div>
              <div className="h-10 w-px bg-white/[0.06]" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-white/35 mb-1">Próximos 7d</p>
                <p className="text-[20px] font-display font-semibold text-emerald-300 tabular-nums">{kpis.proximosArribos7d}</p>
              </div>
              <div className="h-10 w-px bg-white/[0.06]" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-white/35 mb-1">Retrasados</p>
                <p className={`text-[20px] font-display font-semibold tabular-nums ${kpis.embarquesRetrasados > 0 ? 'text-red-300' : 'text-white/30'}`}>{kpis.embarquesRetrasados}</p>
              </div>
            </div>
          </div>
        </article>

        {/* Side: SLA Global */}
        <article className="glass-card p-7 fade-rise fade-rise-2">
          <span className="eyebrow">SLA global</span>
          <div className="mt-4 mb-6">
            <span className="display-lg text-white tabular-nums">{kpis.slaCumplimientoGlobal}</span>
            <span className="text-[24px] font-display text-white/40 ml-1">%</span>
          </div>
          <div className="space-y-3 text-[12px]">
            <SLABar label="AIR ≤ 30d" value={kpis.slaAir} mean={kpis.tiempoMedioAirDias} />
            <SLABar label="FCL ≤ 65d" value={kpis.slaFcl} mean={kpis.tiempoMedioFclDias} />
          </div>
        </article>
      </section>

      {/* ── Tira de métricas de proceso ──────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
        <MetricBlock eyebrow="Tránsito promedio" value={`${kpis.tiempoMedioTransitoDias}`} unit="días" hint="ETD → depósito" delay={3} />
        <MetricBlock eyebrow="Lead time pago"    value={`${kpis.leadTimePagoArriboDias}`}    unit="días" hint="pago → depósito" delay={4} />
        <MetricBlock eyebrow="Anticipación Comex" value={`${kpis.anticipacionComexDias}`}    unit="días" hint="instrucción → ETD" delay={5} />
        <MetricBlock eyebrow="Unidades del mes"  value={fmtN.format(kpis.unidadesArribadasMes)} unit="" hint="arribadas al depósito" delay={6} />
      </section>

      {/* ── Charts: layout asimétrico ────────────────────────────────────── */}
      <section className="space-y-5 mb-12">
        <div className="flex items-baseline gap-3">
          <h2 className="display-md text-white">Flujo operativo</h2>
          <div className="hairline flex-1 mb-2" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <ChartCard icon={<Plane className="w-3.5 h-3.5" />}  title="Próximos arribos"          subtitle="próximas 4 semanas" className="lg:col-span-5">
            <ProximosArribosChart data={kpis.proximosArribos} />
          </ChartCard>
          <ChartCard icon={<Layers className="w-3.5 h-3.5" />} title="Días promedio por etapa"   subtitle="cuello de botella"  className="lg:col-span-7">
            <DiasEntreEtapasChart data={kpis.diasEntreEtapas} />
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <ChartCard icon={<BarChart3 className="w-3.5 h-3.5" />} title="Embarques por mes"      subtitle="por ETD · últimos 12" className="lg:col-span-7">
            <EmbarquesPorMesChart data={kpis.embarquesPorMes} />
          </ChartCard>
          <ChartCard icon={<Boxes className="w-3.5 h-3.5" />}    title="CBM arribado por mes"   subtitle="throughput operativo" className="lg:col-span-5">
            <ThroughputCbmChart data={kpis.throughputCbmPorMes} />
          </ChartCard>
        </div>

        <ChartCard icon={<TrendingUp className="w-3.5 h-3.5" />} title="Tendencia de discrepancias" subtitle="% ítems con diferencia de qty">
          <DiscrepanciasTrendChart data={kpis.discrepanciasPorMes} />
        </ChartCard>
      </section>

      {/* ── Bottom: Alertas + últimos embarques ──────────────────────────── */}
      <section className="space-y-5">
        <div className="flex items-baseline gap-3">
          <h2 className="display-md text-white">Atención</h2>
          <div className="hairline flex-1 mb-2" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <article className="lg:col-span-2 glass-card overflow-hidden">
            <AlertasBandeja alerts={alerts} />
          </article>

          <article className="glass-card overflow-hidden">
            <div className="px-6 py-4 flex items-center gap-3 border-b border-white/[0.04]">
              <Anchor className="w-3.5 h-3.5 text-[#31AF4F]" />
              <span className="text-[11px] font-medium text-white/70 tracking-wide">Últimos embarques</span>
              <Link href="/embarques" className="ml-auto text-[10px] text-white/40 hover:text-white transition-colors">Ver todos →</Link>
            </div>
            <div className="divide-y divide-white/[0.03]">
              {summaries.slice(0, 6).map(s => (
                <Link key={s.embarqueNo} href={`/embarques/${encodeURIComponent(s.embarqueNo)}`} className="px-6 py-3 flex items-center gap-2 hover:bg-white/[0.02] transition-colors">
                  <span className="font-mono text-[11px] font-semibold text-white">{s.embarqueNo}</span>
                  <StatusPill estado={s.estado} className="text-[9px]" />
                  <span className="ml-auto"><DateRange etd={s.etd} eta={s.eta} /></span>
                </Link>
              ))}
              {summaries.length === 0 && <p className="px-6 py-12 text-center text-white/30 text-[12px]">Sin embarques con CIPL cargado.</p>}
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}

// ─── Sub-components (locales del home) ───────────────────────────────────────

function MetricBlock({ eyebrow, value, unit, hint, delay }: {
  eyebrow: string; value: string; unit: string; hint: string; delay: number
}) {
  return (
    <div className={`fade-rise fade-rise-${delay}`}>
      <p className="eyebrow mb-3">{eyebrow}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[36px] font-display font-bold text-white tabular-nums leading-none">{value}</span>
        {unit && <span className="text-[13px] text-white/35 tabular-nums">{unit}</span>}
      </div>
      <p className="mt-2 text-[11px] text-white/35">{hint}</p>
    </div>
  )
}

function SLABar({ label, value, mean }: { label: string; value: number; mean: number }) {
  const ok = value >= 80
  const warn = value >= 60 && value < 80
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-white/55 text-[11px]">{label}</span>
        <span className="tabular-nums text-white/80 font-semibold">{value}<span className="text-white/40 font-normal">%</span></span>
      </div>
      <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${ok ? 'bg-emerald-400/80' : warn ? 'bg-amber-300/70' : 'bg-red-400/70'}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] text-white/30 tabular-nums">{mean}d promedio</p>
    </div>
  )
}

function ChartCard({ icon, title, subtitle, className = '', children }: {
  icon: React.ReactNode; title: string; subtitle?: string; className?: string; children: React.ReactNode
}) {
  return (
    <article className={`glass-card overflow-hidden ${className}`}>
      <div className="px-5 py-3.5 flex items-center gap-3 border-b border-white/[0.04]">
        <span className="text-[#31AF4F]/80">{icon}</span>
        <span className="text-[11px] font-medium text-white/70 tracking-wide">{title}</span>
        {subtitle && <span className="ml-auto text-[10px] text-white/30">{subtitle}</span>}
      </div>
      <div className="p-4">{children}</div>
    </article>
  )
}
