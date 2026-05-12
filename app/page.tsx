export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import {
  Package, Truck, AlertTriangle, ArrowUpRight,
  FileSpreadsheet, FileText, LayoutDashboard, Upload, Anchor,
} from 'lucide-react'
import Link from 'next/link'

export default async function HomePage() {
  const items = await prisma.cIPLItem.findMany({
    select: {
      tipoCarga: true,
      isDangerousGood: true,
      soPrincipal: true,
      etd: true,
      arriboWh: true,
      etaCaldas: true,
      createdAt: true,
      categoryName: true,
      description: true,
      piNo: true,
      asn: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  const total       = items.length
  const repuestos   = items.filter(i => i.tipoCarga === 'Repuesto').length
  const mercs       = items.filter(i => i.tipoCarga === 'Mercaderia').length
  const conSO       = items.filter(i => i.soPrincipal).length
  const dgs         = items.filter(i => i.isDangerousGood).length
  const enTransito  = items.filter(i => i.etd && !i.arriboWh).length
  const entregados  = items.filter(i => i.etaCaldas).length
  const sinSO       = total - conSO

  const recent = items.slice(0, 8)

  const fmtDate = (d: Date) =>
    new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Panel de Compras</p>
        <h1 className="text-2xl font-semibold text-zinc-900">Inicio</h1>
        <p className="text-sm text-zinc-400 mt-1">Resumen en tiempo real · {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total ítems',    value: total,       color: 'text-zinc-900',     icon: Package,       bg: 'bg-zinc-50' },
          { label: 'En tránsito',    value: enTransito,  color: 'text-sky-600',      icon: Truck,         bg: 'bg-sky-50' },
          { label: 'Sin SO asig.',   value: sinSO,       color: sinSO > 0 ? 'text-amber-600' : 'text-emerald-600', icon: AlertTriangle, bg: sinSO > 0 ? 'bg-amber-50' : 'bg-emerald-50' },
          { label: 'Dangerous GD',   value: dgs,         color: dgs > 0 ? 'text-red-600' : 'text-zinc-400',  icon: AlertTriangle, bg: dgs > 0 ? 'bg-red-50' : 'bg-zinc-50' },
        ].map(({ label, value, color, icon: Icon, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-zinc-100 shadow-sm px-5 py-4">
            <div className="flex items-start justify-between mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{label}</p>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${bg}`}>
                <Icon className={`w-3.5 h-3.5 ${color}`} />
              </div>
            </div>
            <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Two-col: tipo breakdown + entregados */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-zinc-100 shadow-sm px-5 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Repuestos</p>
            <p className="text-2xl font-bold font-mono text-emerald-700">{repuestos}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-zinc-100 shadow-sm px-5 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Mercadería</p>
            <p className="text-2xl font-bold font-mono text-red-600">{mercs}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-zinc-100 shadow-sm px-5 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <Anchor className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Entregados</p>
            <p className="text-2xl font-bold font-mono text-indigo-600">{entregados}</p>
          </div>
        </div>
      </div>

      {/* Quick access */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { href: '/panel-general', label: 'Panel General',   icon: LayoutDashboard, desc: 'Ver y editar todos los CIPLs', color: 'text-amber-500', border: 'hover:border-amber-200' },
          { href: '/comercial',     label: 'Carga Comercial', icon: Upload,           desc: 'Subir nuevo CIPL',             color: 'text-emerald-500', border: 'hover:border-emerald-200' },
          { href: '/comex',         label: 'Comex Tracking',  icon: Anchor,           desc: 'Actualizar estados de envío',  color: 'text-indigo-500', border: 'hover:border-indigo-200' },
        ].map(({ href, label, icon: Icon, desc, color, border }) => (
          <Link key={href} href={href}
            className={`bg-white rounded-xl border border-zinc-100 shadow-sm px-5 py-4 flex items-center gap-3 transition-all hover:shadow-md ${border}`}>
            <div className="shrink-0">
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-800">{label}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{desc}</p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-zinc-200 ml-auto shrink-0" />
          </Link>
        ))}
      </div>

      {/* Recent activity */}
      {recent.length > 0 && (
        <div className="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-700">Actividad reciente</p>
            <Link href="/panel-general" className="text-xs text-amber-500 hover:text-amber-600 font-medium">Ver todo →</Link>
          </div>
          <div className="divide-y divide-zinc-50">
            {recent.map((item, i) => {
              const isRep = item.tipoCarga === 'Repuesto'
              return (
                <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50/60 transition-colors">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                    isRep ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                  }`}>
                    {isRep ? <FileSpreadsheet className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                    {item.tipoCarga}
                  </span>
                  <p className="text-xs text-zinc-700 truncate flex-1">
                    {item.description ?? item.piNo ?? item.asn ?? '—'}
                  </p>
                  <p className="text-xs text-zinc-400 shrink-0">{item.categoryName ?? '—'}</p>
                  <p className="text-xs text-zinc-300 shrink-0">{fmtDate(item.createdAt)}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {total === 0 && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center">
            <Package className="w-7 h-7 text-zinc-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-700">Sin datos todavía</p>
            <p className="text-xs text-zinc-400 mt-1">Cargá tu primer CIPL desde Carga Comercial.</p>
          </div>
          <Link href="/comercial"
            className="h-9 px-5 rounded-xl bg-amber-400 hover:bg-amber-500 text-zinc-900 font-semibold text-sm flex items-center gap-2 transition-all">
            <Upload className="w-4 h-4" /> Ir a Carga Comercial
          </Link>
        </div>
      )}
    </div>
  )
}
