export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Plus, ShoppingCart, TrendingUp, Package, AlertTriangle, Clock } from 'lucide-react'
import { ComprasClient } from './ComprasClient'
import { getCompraStatus, getQtyRecibida, getQtyPedida } from './lib'
import type { CompraWithSOS } from './lib'

export default async function ComprasPage() {
  const compras = await prisma.compra.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      sos: true,
      ciplItems: { select: { qty: true, soPrincipal: true } },
    },
  }) as CompraWithSOS[]

  const active      = compras.filter(c => getCompraStatus(c) !== 'Completada')
  const fobActivo   = active.reduce((s, c) => s + c.sos.reduce((ss, so) => ss + (so.fobTotal ?? 0), 0), 0)
  const unidadesEnProceso = active.reduce((s, c) => s + Math.max(0, getQtyPedida(c) - getQtyRecibida(c)), 0)

  const completadas30d = compras.filter(c => {
    const st = getCompraStatus(c)
    if (st !== 'Completada') return false
    const diff = Date.now() - c.createdAt.getTime()
    return diff < 30 * 24 * 60 * 60 * 1000
  })

  const pagoSinPL = active.filter(c => {
    if (!c.fechaPago) return false
    if (c.ciplItems.length > 0) return false
    const daysSince = (Date.now() - c.fechaPago.getTime()) / (1000 * 60 * 60 * 24)
    return daysSince > 30
  })

  const fmtUSD = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-white">Órdenes de Compra</h1>
          <p className="text-[11px] text-white/30 mt-0.5">Seguimiento de la orden a la entrega</p>
        </div>
        <Link href="/compras/nueva" className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold bg-[#E30613] text-white hover:bg-[#c00510] transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Nueva Compra
        </Link>
      </div>

      {/* KPI Grid */}
      <div className="px-6 py-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          {[
            { icon: ShoppingCart,  label: 'Compras activas',      value: active.length.toString(),              sub: `${compras.length} en total` },
            { icon: TrendingUp,    label: 'FOB en proceso',        value: fmtUSD(fobActivo),                     sub: 'órdenes abiertas' },
            { icon: Package,       label: 'Unidades por recibir',  value: unidadesEnProceso.toLocaleString(),    sub: 'vs qty pedida' },
            { icon: Clock,         label: 'Completadas este mes',  value: completadas30d.length.toString(),      sub: 'últimos 30 días' },
          ].map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-3.5 h-3.5 text-white/20" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/25">{label}</span>
              </div>
              <div className="text-[22px] font-bold text-white">{value}</div>
              <div className="text-[11px] text-white/30 mt-1">{sub}</div>
            </div>
          ))}
        </div>

        {pagoSinPL.length > 0 && (
          <div className="flex items-center gap-2.5 bg-amber-500/[0.08] border border-amber-500/20 rounded-xl px-4 py-2.5 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-[12px] text-amber-300">
              <strong>{pagoSinPL.length} compra{pagoSinPL.length > 1 ? 's' : ''}</strong> pagada{pagoSinPL.length > 1 ? 's' : ''} sin PL hace más de 30 días —{' '}
              {pagoSinPL.map(c => c.piNo ?? c.id.slice(-6)).join(', ')}
            </span>
          </div>
        )}
      </div>

      <ComprasClient compras={compras} />
    </div>
  )
}
