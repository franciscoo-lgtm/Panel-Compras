'use client'

import { FileSpreadsheet, FileText, FolderOpen, ExternalLink } from 'lucide-react'
import { KPICard } from '@/components/shared/KPICard'
import type { DetailProp } from '../EmbarqueDetailClient'

type DriveLinkEntry = {
  asn: string | null
  url: string
  type: 'excel' | 'ci' | 'pl'
}

export function ResumenTab({ detail }: { detail: DetailProp }) {
  const photoCount = detail.items.reduce((s, i) => s + (i.photos?.length ?? 0), 0)
  const itemsConDiff = detail.items.filter(i =>
    i.diferenciaPiPl != null && i.diferenciaPiPl !== 0
  ).length
  const itemsSinFoto = detail.items.filter(i => (i.photos?.length ?? 0) === 0).length
  const okCount = detail.items.length - itemsConDiff - itemsSinFoto

  const firstShipment = detail.shipmentsBySO[0]?.[1]
  const extras = firstShipment?.extras ?? {}

  // Recolectar Drive links únicos por ASN (cada PL típicamente tiene los mismos
  // 3 links repetidos en todos sus items).
  const seen = new Set<string>()
  const driveLinks: DriveLinkEntry[] = []
  for (const it of detail.items) {
    const key = `${it.asn ?? ''}|${it.driveLinkExcel}|${it.driveLinkCi}|${it.driveLinkPl}`
    if (seen.has(key)) continue
    seen.add(key)
    if (it.driveLinkExcel) driveLinks.push({ asn: it.asn, url: it.driveLinkExcel, type: 'excel' })
    if (it.driveLinkCi)    driveLinks.push({ asn: it.asn, url: it.driveLinkCi,    type: 'ci'    })
    if (it.driveLinkPl)    driveLinks.push({ asn: it.asn, url: it.driveLinkPl,    type: 'pl'    })
  }
  const linksByAsn = new Map<string, DriveLinkEntry[]>()
  for (const l of driveLinks) {
    const k = l.asn ?? '(sin ASN)'
    if (!linksByAsn.has(k)) linksByAsn.set(k, [])
    linksByAsn.get(k)!.push(l)
  }

  const LINK_META: Record<DriveLinkEntry['type'], { label: string; icon: React.ElementType; color: string }> = {
    excel: { label: 'Excel original',     icon: FileSpreadsheet, color: 'text-emerald-400' },
    ci:    { label: 'Commercial Invoice', icon: FileText,        color: 'text-amber-400'   },
    pl:    { label: 'Packing List',       icon: FileText,        color: 'text-blue-400'    },
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="SOs incluidos" value={detail.sos.length.toString()} accent="red" />
        <KPICard label="Ítems del PL" value={detail.totalItems.toString()} accent="blue" />
        <KPICard label="Unidades" value={detail.totalQty.toLocaleString()} accent="zinc" />
        <KPICard label="CBM total" value={detail.totalCbm.toFixed(2)} accent="zinc" hint="m³" />
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-4">
        <h3 className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">Control rápido</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="px-3 py-2 rounded-md bg-emerald-500/[0.08] border border-emerald-500/20">
            <p className="text-[10px] uppercase text-emerald-400/80 font-semibold">OK</p>
            <p className="text-xl font-display font-bold text-emerald-400 tabular-nums">{okCount}</p>
          </div>
          <div className="px-3 py-2 rounded-md bg-amber-500/[0.08] border border-amber-500/20">
            <p className="text-[10px] uppercase text-amber-400/80 font-semibold">Diferencia qty</p>
            <p className="text-xl font-display font-bold text-amber-400 tabular-nums">{itemsConDiff}</p>
          </div>
          <div className="px-3 py-2 rounded-md bg-red-500/[0.08] border border-red-500/20">
            <p className="text-[10px] uppercase text-red-400/80 font-semibold">Sin foto</p>
            <p className="text-xl font-display font-bold text-red-400 tabular-nums">{itemsSinFoto}</p>
          </div>
          <div className="px-3 py-2 rounded-md bg-blue-500/[0.08] border border-blue-500/20">
            <p className="text-[10px] uppercase text-blue-400/80 font-semibold">Fotos cargadas</p>
            <p className="text-xl font-display font-bold text-blue-400 tabular-nums">{photoCount}</p>
          </div>
        </div>
      </div>

      {detail.extraColumns.length > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-4">
          <h3 className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">Datos de Comex</h3>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-[12px]">
            {detail.extraColumns.map(col => (
              <div key={col.fieldKey} className="flex items-baseline gap-2">
                <dt className="text-zinc-500 min-w-[100px]">{col.label}</dt>
                <dd className="text-zinc-200 truncate">{extras[col.fieldKey] ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {linksByAsn.size > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-4">
          <h3 className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-3 flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" />
            Archivos en Drive
          </h3>
          <div className="space-y-3">
            {Array.from(linksByAsn.entries()).map(([asn, links]) => (
              <div key={asn} className="border-l-2 border-white/[0.06] pl-3">
                <p className="font-mono text-[10px] text-zinc-400 mb-1.5">{asn}</p>
                <div className="flex flex-wrap gap-2">
                  {links.map((l, i) => {
                    const meta = LINK_META[l.type]
                    const Icon = meta.icon
                    return (
                      <a
                        key={i}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors"
                      >
                        <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                        <span className="text-zinc-300">{meta.label}</span>
                        <ExternalLink className="w-3 h-3 text-zinc-600" />
                      </a>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-zinc-600">
            Los links se guardan cuando subís el CIPL en <span className="font-mono">/comercial</span>. Si no aparecen, ese PL se cargó sin upload a Drive.
          </p>
        </div>
      )}
    </div>
  )
}
