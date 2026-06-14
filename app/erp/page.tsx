export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { LayoutGrid, Package, Plane, FileText, DollarSign, Wrench, BarChart2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'

const modules = [
  {
    href: '/erp/inventario',
    label: 'Inventario',
    icon: Package,
    description: 'Stock granel por ubicación y unidades serializadas (drones, baterías, generadores)',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  {
    href: '/erp/importaciones',
    label: 'Importaciones',
    icon: Plane,
    description: 'Órdenes de importación y compras locales — desde PO hasta recepción en almacén',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
  {
    href: '/erp/comercial',
    label: 'Comercial',
    icon: FileText,
    description: 'Presupuestos, tramos de facturación, facturas Canal A/B y remitos',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
  },
  {
    href: '/erp/finanzas',
    label: 'Finanzas',
    icon: DollarSign,
    description: 'Cuentas a cobrar/pagar, pagos recibidos, tipos de cambio y diferencia cambiaria',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  {
    href: '/erp/postventa',
    label: 'Postventa / RMA',
    icon: Wrench,
    description: 'Tickets de soporte técnico, reparaciones, consumo de repuestos y garantías DJI',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
  },
  {
    href: '/erp/planeamiento',
    label: 'Planeamiento',
    icon: BarChart2,
    description: 'Proyección de ventas, análisis de reposición y alertas de stock crítico',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
  },
]

export default function ERPPage() {
  return (
    <div className="px-8 py-10 max-w-[1200px] mx-auto">
      <PageHeader
        eyebrow="Bidcom Agro · ERP"
        title="Panel ERP."
        description="Gestión integrada de inventario, abastecimiento, comercial, finanzas y postventa para Bidcom Agtech."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map(({ href, label, icon: Icon, description, color, bg }, i) => (
          <Link
            key={href}
            href={href}
            className={`glass-card p-6 flex flex-col gap-4 fade-rise fade-rise-${i + 1} group`}
          >
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-white group-hover:text-[#31AF4F] transition-colors leading-snug">
                {label}
              </h3>
              <p className="text-[12px] text-white/40 mt-1.5 leading-relaxed">{description}</p>
            </div>
            <div className="mt-auto pt-2">
              <span className="text-[11px] text-[#31AF4F]/60 group-hover:text-[#31AF4F] transition-colors font-medium">
                Ver módulo →
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick links section */}
      <div className="mt-10 glass-card p-6 fade-rise fade-rise-6">
        <div className="flex items-center gap-3 mb-4">
          <LayoutGrid className="w-4 h-4 text-[#31AF4F]" />
          <h2 className="text-[13px] font-semibold text-white">Accesos rápidos</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: '/erp/importaciones', label: 'Nueva importación' },
            { href: '/erp/comercial',     label: 'Nuevo presupuesto' },
            { href: '/erp/postventa',     label: 'Nuevo ticket RMA' },
            { href: '/erp/planeamiento',  label: 'Ver alertas stock' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-[#31AF4F]/20 transition-all text-[12px] text-white/60 hover:text-white/90 text-center"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
