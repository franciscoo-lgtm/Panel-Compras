export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Download, Anchor } from 'lucide-react'
import { getEmbarqueDetail } from '@/app/lib/embarques'
import { StatusPill } from '@/components/shared/StatusPill'
import { DateRange } from '@/components/shared/DateRange'
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

  return (
    <div className="px-6 py-5">
      <div className="flex items-center gap-2 mb-3 text-[11px] text-zinc-500">
        <Link href="/embarques" className="hover:text-white transition-colors inline-flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" />
          Embarques
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Anchor className="w-5 h-5 text-[#E30613] shrink-0" />
        <h1 className="text-2xl font-display font-bold text-white tracking-tight">{detail.embarqueNo}</h1>
        <StatusPill estado={detail.estado} />

        <div className="ml-auto flex items-center gap-2">
          <DateRange etd={detail.etd} eta={detail.eta} />
          {detail.awb && (
            <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
              AWB {detail.awb}
            </span>
          )}
          <a
            href={`/api/embarques/${encodeURIComponent(detail.embarqueNo)}/export`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium bg-[#E30613] hover:bg-[#E30613]/85 text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CIPL consolidado
          </a>
        </div>
      </div>

      <EmbarqueDetailClient detail={serializable} />
    </div>
  )
}
