export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Download } from 'lucide-react'
import { getEmbarqueDetail } from '@/app/lib/embarques'
import { getMilestonesConfig } from '@/app/lib/milestones-config'
import { getMilestoneDateForEmbarque } from '@/app/lib/milestones-compute'
import { detectTipoTransporte, slaThresholdDays } from '@/app/lib/comex-internals'
import { StatusPill } from '@/components/shared/StatusPill'
import { DateRange } from '@/components/shared/DateRange'
import { MilestonesTimeline } from '@/components/shared/MilestonesTimeline'
import { EmbarqueDetailClient } from './EmbarqueDetailClient'

type Props = { params: Promise<{ embarqueNo: string }> }

export default async function EmbarqueDetailPage({ params }: Props) {
  const { embarqueNo: raw } = await params
  const detail = await getEmbarqueDetail(decodeURIComponent(raw))
  if (!detail) notFound()

  // Serialize Map -> array of entries for client. JSON-stringify cycle handles Date -> ISO string.
  const serializable = {
    embarqueNo: detail.embarqueNo,
    estado: detail.estado,
    etd: detail.etd,
    eta: detail.eta,
    awb: detail.awb,
    sos: detail.sos,
    totalItems: detail.totalItems,
    totalQty: detail.totalQty,
    totalCbm: detail.totalCbm,
    items: JSON.parse(JSON.stringify(detail.items)),
    compras: JSON.parse(JSON.stringify(detail.compras)),
    shipmentsBySO: Array.from(detail.shipmentsBySO.entries()),
    extraColumns: detail.extraColumns,
  }

  // ── Hitos del embarque (los configurados con showIn: 'embarques') ─────────
  const allMilestones = await getMilestonesConfig()
  const embarqueMilestones = allMilestones.filter(m => m.showIn.includes('embarques'))

  // Para el cálculo de hitos: necesitamos bySO formateado y firstCiplCreatedAt
  const bySORecord: Record<string, { so: string; shipments: { embarqueNo: string; extras: Record<string, string | null> }[] }> = {}
  for (const [so, ship] of detail.shipmentsBySO) {
    bySORecord[so] = { so, shipments: [ship] }
  }
  const firstCiplCreatedAt = detail.items.length > 0
    ? detail.items.reduce<string | null>((earliest, it) => {
        const created = (it as { createdAt?: Date | string | null }).createdAt
        if (!created) return earliest
        const iso = typeof created === 'string' ? created : (created as Date).toISOString()
        if (!earliest || iso < earliest) return iso
        return earliest
      }, null)
    : null

  const comprasPlain = JSON.parse(JSON.stringify(detail.compras)) as Record<string, unknown>[]
  const milestoneItems = embarqueMilestones.map(m => ({
    key: m.key,
    label: m.label,
    source: m.source,
    date: getMilestoneDateForEmbarque(m, comprasPlain, firstCiplCreatedAt, detail.sos, bySORecord),
  }))

  const tipo = detectTipoTransporte(detail.embarqueNo)
  const tipoLabel = tipo === 'AIR' ? 'AIR · vuelo' : tipo === 'FCL' ? 'FCL · barco' : tipo === 'LCL' ? 'LCL · consolidado' : 'Sin tipo'
  const slaDays = slaThresholdDays(tipo)

  return (
    <div className="px-8 py-10 max-w-[1500px] mx-auto">
      {/* Breadcrumb */}
      <Link
        href="/embarques"
        className="inline-flex items-center gap-1 text-[11px] text-white/35 hover:text-white/70 transition-colors mb-6"
      >
        <ChevronLeft className="w-3 h-3" />
        Embarques
      </Link>

      {/* Header editorial */}
      <header className="mb-10 fade-rise">
        <div className="flex items-baseline justify-between mb-3 gap-4 flex-wrap">
          <span className="eyebrow">Bidcom Agro · Embarque</span>
          <span className="eyebrow tabular-nums">{tipoLabel} · SLA {slaDays}d</span>
        </div>

        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="display-md text-white font-mono tracking-tight">{detail.embarqueNo}</h1>
            <StatusPill estado={detail.estado} />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <DateRange etd={detail.etd} eta={detail.eta} />
            {detail.awb && (
              <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-white/[0.04] text-white/55 border border-white/[0.06]">
                AWB {detail.awb}
              </span>
            )}
            <a
              href={`/api/embarques/${encodeURIComponent(detail.embarqueNo)}/export`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#31AF4F] hover:bg-[#44DA68] text-white transition-colors shadow-[0_0_18px_rgba(49,175,79,0.25)]"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CIPL consolidado
            </a>
          </div>
        </div>

        <div className="hairline mt-7" />
      </header>

      {milestoneItems.length > 0 && (
        <div className="mb-8 fade-rise fade-rise-1">
          <MilestonesTimeline items={milestoneItems} />
        </div>
      )}

      <EmbarqueDetailClient detail={serializable} />
    </div>
  )
}
