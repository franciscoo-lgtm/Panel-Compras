'use client'

import Link from 'next/link'
import { CheckCircle2, Anchor, RotateCcw, FolderOpen, ExternalLink } from 'lucide-react'
import type { DriveLinks } from '@/app/lib/etl'

export function Step5Confirm({
  count, driveLinks, onNew,
}: {
  count: number
  driveLinks: DriveLinks
  onNew: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-6 text-center">
        <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
        <h3 className="text-lg font-display font-bold text-white mb-1">Guardado correctamente</h3>
        <p className="text-[12px] text-emerald-400/80">{count} ítem{count === 1 ? '' : 's'} cargado{count === 1 ? '' : 's'} al sistema</p>
      </div>

      {(driveLinks.excel || driveLinks.ci || driveLinks.pl) && (
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-4">
          <h3 className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2 flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" /> Archivos en Drive
          </h3>
          <div className="space-y-1">
            {driveLinks.excel && <a href={driveLinks.excel} target="_blank" rel="noopener" className="text-[11px] text-blue-400 hover:text-blue-300 inline-flex items-center gap-1.5"><ExternalLink className="w-3 h-3" /> Excel original</a>}
            {driveLinks.ci    && <a href={driveLinks.ci}    target="_blank" rel="noopener" className="text-[11px] text-blue-400 hover:text-blue-300 inline-flex items-center gap-1.5"><ExternalLink className="w-3 h-3" /> Commercial Invoice</a>}
            {driveLinks.pl    && <a href={driveLinks.pl}    target="_blank" rel="noopener" className="text-[11px] text-blue-400 hover:text-blue-300 inline-flex items-center gap-1.5"><ExternalLink className="w-3 h-3" /> Packing List</a>}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-2">
        <button onClick={onNew} className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 inline-flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5" /> Cargar otro PL
        </button>
        <Link href="/embarques" className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-[#31AF4F] hover:bg-[#31AF4F]/85 text-white inline-flex items-center gap-1.5">
          <Anchor className="w-3.5 h-3.5" /> Ir a Embarques
        </Link>
      </div>
    </div>
  )
}
