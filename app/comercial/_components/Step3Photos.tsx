'use client'

import { useState } from 'react'
import { ChevronRight, ChevronLeft, SkipForward } from 'lucide-react'
import { InspectionPhotoUploader, type PhotoExtractionResult } from '@/components/shared/InspectionPhotoUploader'

export function Step3Photos({
  onBack, onContinue,
}: {
  onBack: () => void
  onContinue: (photos: PhotoExtractionResult[]) => void
}) {
  const [photos, setPhotos] = useState<PhotoExtractionResult[]>([])

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.04] p-3 text-[11px] text-blue-300">
        <strong>Paso opcional.</strong> Si tenés un Excel con fotos de inspección, subilo acá. La IA extrae las etiquetas y matchea cada foto contra los ítems del PL recién cargado. Si no, hacé click en &quot;Saltar&quot;.
      </div>

      <InspectionPhotoUploader
        onExtracted={() => {}}
        onAIComplete={setPhotos}
      />

      {photos.length > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-3">
          <p className="text-[11px] text-zinc-400 mb-2">{photos.length} fotos analizadas. Próximamente: matching automático con los ítems del PL.</p>
          <div className="grid grid-cols-6 md:grid-cols-10 gap-1.5">
            {photos.slice(0, 30).map((p, i) => (
              <div key={i} className="aspect-square rounded overflow-hidden bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:${p.mediaType};base64,${p.base64}`} className="w-full h-full object-cover" alt="" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button onClick={onBack} className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 inline-flex items-center gap-1.5">
          <ChevronLeft className="w-3.5 h-3.5" /> Volver
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => onContinue([])} className="px-3 py-1.5 rounded-md text-[11px] font-medium text-zinc-400 hover:text-white inline-flex items-center gap-1.5">
            <SkipForward className="w-3.5 h-3.5" /> Saltar
          </button>
          <button onClick={() => onContinue(photos)} className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-[#E30613] hover:bg-[#E30613]/85 text-white inline-flex items-center gap-1.5">
            Continuar <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
