export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Anchor, AlertTriangle, ArrowRight } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { listEmbarques } from '@/app/lib/embarques'
import { KPICard } from '@/components/shared/KPICard'
import { StatusPill } from '@/components/shared/StatusPill'
import { DateRange } from '@/components/shared/DateRange'

export default async function HomePage() {
  const { summaries, errors } = await listEmbarques()

  const activos      = summaries.filter(s => s.estado === 'en-transito' || s.estado === 'pendiente').length
  const enTransito   = summaries.filter(s => s.estado === 'en-transito').length
  const arribados    = summaries.filter(s => s.estado === 'arribado').length
  const unidades     = summaries.reduce((s, e) => s + e.totalQty, 0)

  const itemsSinFoto = await prisma.cIPLItem.count({ where: { photos: { none: {} } } })

  const alerts: { kind: 'critical' | 'warn' | 'info'; text: string; href?: string }[] = []
  const now = new Date()
  for (const s of summaries.slice(0, 30)) {
    if (s.eta) {
      const eta = new Date(s.eta)
      if (!isNaN(eta.getTime())) {
        const days = Math.round((eta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (s.estado === 'en-transito' && days >= 0 && days <= 7) {
          alerts.push({ kind: 'info', text: `${s.embarqueNo} llega en ${days} día${days === 1 ? '' : 's'}`, href: `/embarques/${encodeURIComponent(s.embarqueNo)}` })
        } else if (s.estado === 'en-transito' && days < 0) {
          alerts.push({ kind: 'critical', text: `${s.embarqueNo} ETA pasada hace ${-days} días sin arribo`, href: `/embarques/${encodeURIComponent(s.embarqueNo)}` })
        }
      }
    }
  }
  if (itemsSinFoto > 0) {
    alerts.push({ kind: 'warn', text: `${itemsSinFoto} ítems sin foto cargada`, href: '/comercial' })
  }

  return (
    <div className="px-6 py-5 max-w-7xl">
      <h1 className="text-2xl font-display font-bold text-white tracking-tight mb-1">Panel de seguimiento</h1>
      <p className="text-[12px] text-zinc-500 mb-6">Resumen operativo en tiempo real</p>

      {errors.length > 0 && (
        <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md border border-amber-500/20 bg-amber-500/[0.05] text-[12px] text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Hay {errors.length} aviso{errors.length === 1 ? '' : 's'} al leer la planilla Comex. Revisá <Link href="/embarques" className="underline">Embarques</Link>.</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KPICard label="Embarques activos"  value={activos.toString()}             hint={`${enTransito} en tránsito`}     accent="red"     />
        <KPICard label="Arribados"           value={arribados.toString()}           hint="histórico total"                  accent="emerald" />
        <KPICard label="Unidades en juego"   value={unidades.toLocaleString()}      hint="suma todos los embarques"        accent="blue"    />
        <KPICard label="Ítems sin foto"      value={itemsSinFoto.toString()}        hint="requieren inspección"            accent="amber"   />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Bandeja de alertas</h2>
            <span className="ml-auto text-[10px] text-zinc-500">{alerts.length}</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {alerts.length === 0 ? (
              <p className="px-4 py-8 text-center text-zinc-500 text-[12px]">Sin alertas. Todo en orden.</p>
            ) : alerts.slice(0, 12).map((a, i) => {
              const dot = a.kind === 'critical' ? 'bg-red-500' : a.kind === 'warn' ? 'bg-amber-500' : 'bg-blue-500'
              const Body = (
                <div className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                  <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
                  <span className="text-[12px] text-zinc-300 flex-1 truncate">{a.text}</span>
                  {a.href && <ArrowRight className="w-3.5 h-3.5 text-zinc-600" />}
                </div>
              )
              return a.href
                ? <Link key={i} href={a.href}>{Body}</Link>
                : <div key={i}>{Body}</div>
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
