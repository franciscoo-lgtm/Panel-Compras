'use client'

import type { LiveDataMap, ExtraColumn } from '@/app/lib/comex-sources'

export type CIPLItemRow = {
  id: string; asn: string | null; piNo: string | null; caseNo: string | null
  soPrincipal: string | null; tipoCarga: string; categoryName: string | null
  description: string | null; qty: number | null; qBultos: number | null
  cbm: number | null; gwKg: number | null
  etd: string | null; eta: string | null
  arriboWh: string | null; etaCaldas: string | null
  awb: string | null; avisoAgente: string | null
}

export default function ReportesClient({
  initialItems,
  liveData,
  extraColumns,
}: {
  initialItems: CIPLItemRow[]
  liveData: LiveDataMap
  extraColumns: ExtraColumn[]
}) {
  return (
    <div className="text-zinc-400 py-12 text-center text-sm">
      Panel de reportes — en construcción ({initialItems.length} ítems cargados)
    </div>
  )
}
