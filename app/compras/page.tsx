export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Plus, AlertTriangle } from 'lucide-react'
import { ComprasClient } from './ComprasClient'
import { getCompraStatus, getQtyRecibida, getQtyPedida } from './lib'
import type { CompraWithSOS } from './lib'
import { PageHeader } from '@/components/shared/PageHeader'

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 0 }).format(n)

const fmtN = new Intl.NumberFormat('es-AR')

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

  // eslint-disable-next-line react-hooks/purity -- server component renders once per request
  const nowMs = Date.now()

  const completadas30d = compras.filter(c => {
    const st = getCompraStatus(c)
    if (st !== 'Completada') return false
    const diff = nowMs - c.createdAt.getTime()
    return diff < 30 * 24 * 60 * 60 * 1000
  })

  const pagoSinPL = active.filter(c => {
    if (!c.fechaPago) return false
    if (c.ciplItems.length > 0) return false
    const daysSince = (nowMs - c.fechaPago.getTime()) / (1000 * 60 * 60 * 24)
    return daysSince > 30
  })

  return (
    <div className="px-8 py-10 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="Bidcom Agro · Procurement"
        title="Órdenes de compra."
        description="Seguimiento de la orden a la entrega, desde el pago al proveedor hasta el arribo del PL al depósito."
        meta={`${active.length} activas · ${compras.length} totales`}
        action={
          <Link
            href="/compras/nueva"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-semibold bg-[#31AF4F] text-white hover:bg-[#44DA68] transition-colors shadow-[0_0_18px_rgba(49,175,79,0.25)]"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva compra
          </Link>
        }
      />

      {/* KPIs estilo editorial — sin cards, solo tipografía */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        <ProcurementMetric eyebrow="FOB en proceso"      value={fmtUSD(fobActivo)}                       hint="órdenes abiertas"     delay={1} />
        <ProcurementMetric eyebrow="Unidades por recibir" value={fmtN.format(unidadesEnProceso)}         hint="vs qty pedida"        delay={2} />
        <ProcurementMetric eyebrow="Completadas (30d)"    value={completadas30d.length.toString()}       hint="últimos 30 días"      delay={3} />
        <ProcurementMetric eyebrow="Sin PL +30d"          value={pagoSinPL.length.toString()}            hint="pago sin recepción"  delay={4}
                           alert={pagoSinPL.length > 0} />
      </section>

      {pagoSinPL.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-500/[0.04] border border-amber-500/15 rounded-xl px-4 py-3 mb-6 fade-rise fade-rise-5">
          <AlertTriangle className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
          <span className="text-[12px] text-amber-200/90 leading-relaxed">
            <strong className="text-amber-200">{pagoSinPL.length} compra{pagoSinPL.length > 1 ? 's' : ''}</strong> pagada{pagoSinPL.length > 1 ? 's' : ''} sin PL hace más de 30 días —{' '}
            <span className="text-amber-100/70 font-mono text-[11px]">{pagoSinPL.map(c => c.piNo ?? c.id.slice(-6)).join(', ')}</span>
          </span>
        </div>
      )}

      <ComprasClient compras={compras} />
    </div>
  )
}

function ProcurementMetric({ eyebrow, value, hint, delay, alert = false }: {
  eyebrow: string; value: string; hint: string; delay: number; alert?: boolean
}) {
  return (
    <div className={`fade-rise fade-rise-${delay}`}>
      <p className="eyebrow mb-3">{eyebrow}</p>
      <p className={`text-[34px] font-display font-bold tabular-nums leading-none ${alert ? 'text-amber-300' : 'text-white'}`}>{value}</p>
      <p className="mt-2 text-[11px] text-white/35">{hint}</p>
    </div>
  )
}
