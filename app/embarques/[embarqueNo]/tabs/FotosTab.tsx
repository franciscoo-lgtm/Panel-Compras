'use client'

import { useState } from 'react'
import { Image as ImageIcon, X } from 'lucide-react'
import type { EmbarqueItem } from '../types'

export function FotosTab({ items }: { items: EmbarqueItem[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null)

  const withPhotos = items.filter(i => (i.photos?.length ?? 0) > 0)

  if (withPhotos.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] py-12 text-center">
        <ImageIcon className="w-8 h-8 mx-auto text-zinc-700 mb-2" />
        <p className="text-zinc-500 text-[12px]">No hay fotos cargadas para este embarque todavía.</p>
        <p className="text-zinc-600 text-[10px] mt-1">Las fotos se suben desde el flujo de Carga CIPL.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {withPhotos.map(it => (
        <div key={it.id} className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
          <div className="px-4 py-2 bg-[#0d0d0d] border-b border-white/[0.06] flex items-center gap-3">
            <span className="font-mono text-[11px] font-semibold text-emerald-400">{it.soPrincipal ?? '—'}</span>
            <span className="text-[11px] text-zinc-300 truncate">{it.description ?? ''}</span>
            <span className="ml-auto text-[10px] text-zinc-500">{it.photos.length} foto{it.photos.length === 1 ? '' : 's'}</span>
          </div>
          <div className="p-3 grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {it.photos.map(p => (
              <button
                key={p.id}
                onClick={() => setLightbox(p.dataUrl)}
                className="aspect-square rounded-md overflow-hidden bg-black border border-white/[0.04] hover:border-[#E30613]/40 transition-colors group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg" alt="" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/70 hover:text-white"><X className="w-6 h-6" /></button>
        </div>
      )}
    </div>
  )
}
