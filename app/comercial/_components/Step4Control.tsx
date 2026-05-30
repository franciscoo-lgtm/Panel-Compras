'use client'

import { ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Package, Camera } from 'lucide-react'
import type { ExtractedItem } from '@/app/lib/etl'
import type { PhotoExtractionResult } from '@/components/shared/InspectionPhotoUploader'

export function Step4Control({
  items, sos, photos, onBack, onContinue,
}: {
  items: ExtractedItem[]
  sos: string[]
  photos: PhotoExtractionResult[]
  onBack: () => void
  onContinue: () => void
}) {
  const conSO     = sos.filter(s => s.trim()).length
  const sinSO     = items.length - conSO
  const totalQty  = items.reduce((s, i) => s + (i.qty ?? 0), 0)
  const totalCbm  = items.reduce((s, i) => s + (i.cbm ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-4">
        <h3 className="text-[12px] font-display font-semibold text-white mb-3 uppercase tracking-wide">Resumen previo</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="px-3 py-2 rounded-md bg-blue-500/[0.08] border border-blue-500/20">
            <p className="text-[10px] uppercase text-blue-400/80 font-semibold flex items-center gap-1"><Package className="w-3 h-3" /> Ítems</p>
            <p className="text-xl font-display font-bold text-blue-400 tabular-nums">{items.length}</p>
          </div>
          <div className={`px-3 py-2 rounded-md border ${sinSO === 0 ? 'bg-emerald-500/[0.08] border-emerald-500/20' : 'bg-amber-500/[0.08] border-amber-500/20'}`}>
            <p className={`text-[10px] uppercase font-semibold flex items-center gap-1 ${sinSO === 0 ? 'text-emerald-400/80' : 'text-amber-400/80'}`}>
              {sinSO === 0 ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              SOs asignados
            </p>
            <p className={`text-xl font-display font-bold tabular-nums ${sinSO === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>{conSO} / {items.length}</p>
          </div>
          <div className={`px-3 py-2 rounded-md border ${photos.length > 0 ? 'bg-emerald-500/[0.08] border-emerald-500/20' : 'bg-red-500/[0.08] border-red-500/20'}`}>
            <p className={`text-[10px] uppercase font-semibold flex items-center gap-1 ${photos.length > 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
              <Camera className="w-3 h-3" /> Fotos
            </p>
            <p className={`text-xl font-display font-bold tabular-nums ${photos.length > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{photos.length}</p>
          </div>
          <div className="px-3 py-2 rounded-md bg-zinc-500/[0.06] border border-zinc-500/20">
            <p className="text-[10px] uppercase text-zinc-400/80 font-semibold">Unidades</p>
            <p className="text-xl font-display font-bold text-white tabular-nums">{totalQty.toLocaleString()}</p>
            <p className="text-[9px] text-zinc-500 mt-0.5">{totalCbm.toFixed(2)} CBM</p>
          </div>
        </div>

        {sinSO > 0 && (
          <div className="mt-4 p-3 rounded-md border border-amber-500/20 bg-amber-500/[0.04] text-[11px] text-amber-300 inline-flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{sinSO} ítems no tienen SO asignado. Podés volver al paso anterior para completarlos, o seguir y editarlos después desde Embarques.</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button onClick={onBack} className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 inline-flex items-center gap-1.5">
          <ChevronLeft className="w-3.5 h-3.5" /> Volver
        </button>
        <button onClick={onContinue} className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-[#31AF4F] hover:bg-[#31AF4F]/85 text-white inline-flex items-center gap-1.5">
          Confirmar y guardar <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
