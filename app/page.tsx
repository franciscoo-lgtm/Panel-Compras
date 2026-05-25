export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import {
  Package, AlertTriangle, ArrowUpRight,
  FileSpreadsheet, FileText, LayoutDashboard, Upload, Anchor,
  Clock, MapPin, ShoppingCart,
} from 'lucide-react'
import Link from 'next/link'

export default async function HomePage() {
  const items = await prisma.cIPLItem.findMany({
    select: {
      tipoCarga: true,
      isDangerousGood: true,
      soPrincipal: true,
      createdAt: true,
      categoryName: true,
      description: true,
      piNo: true,
      asn: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  const total     = items.length
  const repuestos = items.filter(i => i.tipoCarga === 'Repuesto').length
  const mercs     = items.filter(i => i.tipoCarga === 'Mercaderia').length
  const conSO     = items.filter(i => i.soPrincipal).length
  const dgs       = items.filter(i => i.isDangerousGood).length
  const sinSO     = total - conSO
  const recent    = items.slice(0, 8)

  // Compras KPIs
  const compras = await prisma.compra.findMany({
    select: {
      id: true, fechaPago: true, fechaLMS: true, fechaInstruccionCat: true, fechaEnvio: true,
      sos: { select: { fobTotal: true } },
      ciplItems: { select: { id: true } },
    },
  })
  const comprasActivas = compras.filter(c => !c.fechaLMS).length
  const comprasSinPL   = compras.filter(c => c.fechaPago && c.ciplItems.length === 0).length
  const fobActivo      = compras.filter(c => !c.fechaLMS).reduce((s, c) => s + c.sos.reduce((ss, so) => ss + (so.fobTotal ?? 0), 0), 0)

  const fmtDate = (d: Date) =>
    new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })

  const now = new Date()
  const dateStr = now.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen">

      {/* ── Hero banner ──────────────────────────────────────────────────────── */}
      <div className="relative bg-[#0A0A0A] overflow-hidden">
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />
        {/* Red glow accent top-right */}
        <div className="absolute -top-20 right-0 w-96 h-96 bg-[#E30613] opacity-10 blur-[80px] pointer-events-none" />

        <div className="relative px-8 py-8 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px w-8 bg-[#E30613]" />
              <span
                className="text-[#E30613] text-[10px] font-bold uppercase tracking-[0.35em]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                DJI Argentina · Importaciones
              </span>
            </div>
            <h1
              className="text-white font-display font-bold leading-none mb-1"
              style={{ fontFamily: 'var(--font-display)', fontSize: '2.6rem', letterSpacing: '-0.01em' }}
            >
              SEGUIMIENTO DE ENVÍOS
            </h1>
            <p className="text-white/30 text-sm capitalize">{dateStr}</p>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white/30 text-xs uppercase tracking-widest">Sistema activo</span>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 max-w-6xl">

        {/* ── KPI grid ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            {
              label: 'Total ítems', value: total, sub: 'en sistema',
              icon: Package, accent: '#E30613',
              bg: 'bg-[#0A0A0A]', textColor: 'text-white', subColor: 'text-white/30',
            },
            {
              label: 'Sin SO asig.', value: sinSO, sub: sinSO > 0 ? 'requieren acción' : 'todo asignado',
              icon: AlertTriangle, accent: sinSO > 0 ? '#F59E0B' : '#10B981',
              bg: 'bg-white', textColor: 'text-zinc-900', subColor: 'text-zinc-400',
            },
            {
              label: 'Repuestos', value: repuestos, sub: `${mercs} mercadería`,
              icon: Package, accent: '#8B5CF6',
              bg: 'bg-white', textColor: 'text-zinc-900', subColor: 'text-zinc-400',
            },
            {
              label: 'DG', value: dgs, sub: 'dangerous goods',
              icon: AlertTriangle, accent: '#EF4444',
              bg: 'bg-white', textColor: 'text-zinc-900', subColor: 'text-zinc-400',
            },
          ].map(({ label, value, sub, icon: Icon, accent, bg, textColor, subColor }) => (
            <div key={label} className={`${bg} rounded-xl border border-black/[0.06] shadow-sm px-5 py-4`}>
              <div className="flex items-start justify-between mb-3">
                <p className={`text-[10px] font-bold uppercase tracking-widest ${subColor === 'text-white/30' ? 'text-white/40' : 'text-zinc-400'}`}>
                  {label}
                </p>
                <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: `${accent}18` }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
                </div>
              </div>
              <p className={`text-[2rem] font-bold font-mono leading-none ${textColor}`}>{value}</p>
              <p className={`text-[10px] mt-1.5 ${subColor}`}>{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Tipo breakdown ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm px-5 py-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#10B98118' }}>
              <FileSpreadsheet className="w-4.5 h-4.5 text-emerald-600" style={{ width: '1.1rem', height: '1.1rem' }} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Repuestos</p>
              <p className="text-2xl font-bold font-mono text-zinc-900 leading-tight">{repuestos}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm px-5 py-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#E3061318' }}>
              <FileText style={{ width: '1.1rem', height: '1.1rem', color: '#E30613' }} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Mercadería</p>
              <p className="text-2xl font-bold font-mono text-zinc-900 leading-tight">{mercs}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm px-5 py-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#E3061308' }}>
              <AlertTriangle style={{ width: '1.1rem', height: '1.1rem', color: dgs > 0 ? '#E30613' : '#d1d5db' }} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Dangerous GD</p>
              <p className="text-2xl font-bold font-mono text-zinc-900 leading-tight">{dgs}</p>
            </div>
          </div>
        </div>

        {/* ── Quick access ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            {
              href: '/panel-general',
              label: 'Panel General',
              icon: LayoutDashboard,
              desc: 'Ver y editar todos los CIPLs',
              accent: '#E30613',
            },
            {
              href: '/comercial',
              label: 'Carga Comercial',
              icon: Upload,
              desc: 'Subir nuevo CIPL al sistema',
              accent: '#10B981',
            },
            {
              href: '/comex',
              label: 'Comex Tracking',
              icon: Anchor,
              desc: 'Actualizar estados de envío',
              accent: '#3B82F6',
            },
          ].map(({ href, label, icon: Icon, desc, accent }) => (
            <Link
              key={href}
              href={href}
              className="group bg-white rounded-xl border border-black/[0.06] shadow-sm px-5 py-4 flex items-center gap-3.5 transition-all hover:shadow-md hover:border-black/10"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                style={{ backgroundColor: `${accent}12` }}
              >
                <Icon className="w-4.5 h-4.5 transition-colors" style={{ color: accent, width: '1.1rem', height: '1.1rem' }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-800 leading-tight">{label}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{desc}</p>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-200 ml-auto shrink-0 group-hover:text-zinc-400 transition-colors" />
            </Link>
          ))}
        </div>

        {/* ── Compras KPI ───────────────────────────────────────────────────── */}
        {compras.length > 0 && (
          <Link href="/compras" className="block bg-[#0A0A0A] rounded-xl border border-white/[0.06] shadow-sm p-5 mb-5 hover:border-white/10 transition-colors group">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-3.5 h-3.5 text-[#E30613]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Órdenes de Compra</span>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-white/15 group-hover:text-white/40 transition-colors" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><div className="text-[20px] font-bold text-white">{comprasActivas}</div><div className="text-[11px] text-white/30 mt-0.5">activas</div></div>
              <div><div className="text-[20px] font-bold text-amber-400">{comprasSinPL}</div><div className="text-[11px] text-white/30 mt-0.5">sin PL</div></div>
              <div><div className="text-[13px] font-bold text-white">{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:0}).format(fobActivo)}</div><div className="text-[11px] text-white/30 mt-0.5">FOB abierto</div></div>
            </div>
          </Link>
        )}

        {/* ── Recent activity ───────────────────────────────────────────────── */}
        {recent.length > 0 && (
          <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-zinc-300" />
                <p className="text-xs font-semibold text-zinc-700">Actividad reciente</p>
              </div>
              <Link href="/panel-general" className="text-xs font-semibold text-[#E30613] hover:opacity-80 transition-opacity">
                Ver todo →
              </Link>
            </div>
            <div className="divide-y divide-zinc-50/80">
              {recent.map((item, i) => {
                const isRep = item.tipoCarga === 'Repuesto'
                return (
                  <div key={i} className="flex items-center gap-3 px-5 py-2.5 hover:bg-zinc-50/60 transition-colors">
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      isRep ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {isRep ? <FileSpreadsheet className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                      {item.tipoCarga}
                    </span>
                    <p className="text-xs text-zinc-700 truncate flex-1">
                      {item.description ?? item.piNo ?? item.asn ?? '—'}
                    </p>
                    <p className="text-[11px] text-zinc-400 shrink-0">{item.categoryName ?? '—'}</p>
                    <p className="text-[11px] text-zinc-300 shrink-0 tabular-nums">{fmtDate(item.createdAt)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {total === 0 && (
          <div className="flex flex-col items-center gap-5 py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#0A0A0A] flex items-center justify-center shadow-xl">
              <Package className="w-7 h-7 text-[#E30613]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-800">Sin datos todavía</p>
              <p className="text-xs text-zinc-400 mt-1">Cargá tu primer CIPL desde Carga Comercial.</p>
            </div>
            <Link
              href="/comercial"
              className="h-9 px-6 rounded-lg text-white text-sm font-semibold flex items-center gap-2 transition-all hover:opacity-90 shadow-md"
              style={{ backgroundColor: '#E30613' }}
            >
              <Upload className="w-4 h-4" /> Ir a Carga Comercial
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
