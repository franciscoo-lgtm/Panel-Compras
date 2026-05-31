'use client'

import { useState } from 'react'
import { DiasEntreEtapasChart } from './DiasEntreEtapasChart'
import type { DashboardSegment } from '@/app/lib/dashboard-types'
import { DASHBOARD_SEGMENT_LABELS } from '@/app/lib/dashboard-types'

type Datum = { etapa: string; dias: number; n: number }

type Props = {
  data: Record<DashboardSegment, Datum[]>
}

// Orden de los segmentos en el selector. 'mixto' al final porque
// suele ser caso borde.
const SEGMENT_ORDER: DashboardSegment[] = [
  'todos',
  'repuesto',
  'mercaderia-air',
  'mercaderia-barco',
  'mixto',
]

export function DiasEntreEtapasSegmentado({ data }: Props) {
  const [segment, setSegment] = useState<DashboardSegment>('todos')

  const current = data[segment] ?? []
  // Contamos total de muestras del segmento — útil para mostrar al lado
  // del selector cuántos embarques componen el promedio.
  const totalN = current.reduce((acc, d) => acc + d.n, 0)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 pb-2">
        {SEGMENT_ORDER.map(seg => {
          const segData = data[seg] ?? []
          const segN = segData.reduce((a, d) => a + d.n, 0)
          const isActive = seg === segment
          return (
            <button
              key={seg}
              onClick={() => setSegment(seg)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium border transition-colors ${
                isActive
                  ? 'bg-[#31AF4F]/15 text-white border-[#31AF4F]/40'
                  : 'bg-white/[0.02] text-white/45 border-white/[0.06] hover:text-white/80 hover:border-white/[0.12]'
              }`}
              title={`${DASHBOARD_SEGMENT_LABELS[seg]} (${segN} mediciones)`}
            >
              {DASHBOARD_SEGMENT_LABELS[seg]}
              <span className={`tabular-nums text-[9px] ${isActive ? 'text-[#31AF4F]/90' : 'text-white/30'}`}>{segN}</span>
            </button>
          )
        })}

        {totalN === 0 && (
          <span className="ml-auto text-[10px] text-white/30">sin mediciones</span>
        )}
      </div>

      <DiasEntreEtapasChart data={current} />
    </div>
  )
}
