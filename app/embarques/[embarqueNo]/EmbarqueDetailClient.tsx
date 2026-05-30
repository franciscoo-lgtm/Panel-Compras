'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ResumenTab } from './tabs/ResumenTab'
import { ItemsTab } from './tabs/ItemsTab'
import { ControlTab } from './tabs/ControlTab'
import { FotosTab } from './tabs/FotosTab'
import { ComprasTab } from './tabs/ComprasTab'
import { HistorialTab } from './tabs/HistorialTab'
import type { EmbarqueItem, EmbarqueCompra } from './types'

export type DetailProp = {
  embarqueNo: string
  estado: string
  etd: string | null
  eta: string | null
  awb: string | null
  sos: string[]
  totalItems: number
  totalQty: number
  totalCbm: number
  items: EmbarqueItem[]
  compras: EmbarqueCompra[]
  shipmentsBySO: [string, { embarqueNo: string; extras: Record<string, string | null> }][]
  extraColumns: { fieldKey: string; label: string }[]
}

type TabId = 'resumen' | 'items' | 'control' | 'fotos' | 'compras' | 'historial'

export function EmbarqueDetailClient({ detail }: { detail: DetailProp }) {
  const [tab, setTab] = useState<TabId>('resumen')

  const photoCount = detail.items.reduce((sum, i) => sum + (i.photos?.length ?? 0), 0)
  const controlIssues = detail.items.filter(i =>
    (i.diferenciaPiPl != null && i.diferenciaPiPl !== 0) || (i.photos?.length ?? 0) === 0
  ).length

  const TABS: { id: TabId; label: string; count?: number; badge?: boolean }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'items',   label: 'Ítems',   count: detail.items.length },
    { id: 'control', label: 'Control', count: controlIssues, badge: controlIssues > 0 },
    { id: 'fotos',   label: 'Fotos',   count: photoCount },
    { id: 'compras',   label: 'Compras',  count: detail.compras.length },
    { id: 'historial', label: 'Historial' },
  ]

  return (
    <div>
      <div className="border-b border-white/[0.06] mb-4 flex items-center gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'relative px-3 py-2 text-[12px] font-medium transition-colors whitespace-nowrap',
              tab === t.id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            <span>{t.label}</span>
            {t.count != null && (
              <span className={cn(
                'ml-1.5 text-[10px] px-1.5 py-0.5 rounded',
                t.badge ? 'bg-amber-500/15 text-amber-400' : 'bg-white/[0.06] text-zinc-500',
              )}>
                {t.count}
              </span>
            )}
            {tab === t.id && <span className="absolute bottom-0 left-0 right-0 h-px bg-[#31AF4F]" />}
          </button>
        ))}
      </div>

      {tab === 'resumen' && <ResumenTab detail={detail} />}
      {tab === 'items'   && <ItemsTab items={detail.items} />}
      {tab === 'control' && <ControlTab items={detail.items} />}
      {tab === 'fotos'   && <FotosTab items={detail.items} />}
      {tab === 'compras'   && <ComprasTab compras={detail.compras} sos={detail.sos} />}
      {tab === 'historial' && <HistorialTab items={detail.items} />}
    </div>
  )
}
