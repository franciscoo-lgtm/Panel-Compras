'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, AlertTriangle, Save, Loader2, Sparkles, X, AlertCircle } from 'lucide-react'
import { InspectionPhotoUploader, type PhotoExtractionResult } from '@/components/shared/InspectionPhotoUploader'
import { matchPhotosToItems, saveCIPLPhotos, type MatchedPhoto, type PhotoMatchCandidateLight } from '@/app/lib/photo-actions'
import { cn } from '@/lib/utils'

type Item = {
  id: string
  asn: string | null
  soPrincipal: string | null
  caseNo: string | null
  description: string | null
}

export function PhotosUploadClient({ items }: { items: Item[] }) {
  const [matched, setMatched] = useState<MatchedPhoto[]>([])
  const [matching, startMatching] = useTransition()
  const [saving, startSave] = useTransition()
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  async function handleAIComplete(photos: PhotoExtractionResult[]) {
    setSaveResult(null)
    startMatching(async () => {
      // Strip base64 before sending to server action (1MB body limit).
      // Keep base64 client-side and stitch back in.
      const light: PhotoMatchCandidateLight[] = photos.map(p => ({
        rowIndex: p.rowIndex,
        colIndex: p.colIndex,
        mediaType: p.mediaType,
        ai: p.ai,
      }))
      const matchedLight = await matchPhotosToItems(light)
      const merged: MatchedPhoto[] = matchedLight.map((m, i) => ({
        ...m,
        base64: photos[i]?.base64 ?? '',
      }))
      setMatched(merged)
    })
  }

  function overrideMatch(idx: number, itemId: string) {
    setMatched(prev => prev.map((m, i) => {
      if (i !== idx) return m
      const item = items.find(it => it.id === itemId)
      if (!item) return { ...m, matchedItemId: null, matchedItemDesc: null, matchedItemAsn: null, matchedItemSo: null, matchedItemCase: null, matchReason: 'none' as const }
      return {
        ...m,
        matchedItemId: item.id,
        matchedItemDesc: item.description,
        matchedItemAsn: item.asn,
        matchedItemSo: item.soPrincipal,
        matchedItemCase: item.caseNo,
        matchReason: 'asn' as const, // simplified — user override
      }
    }))
  }

  function handleSave() {
    setSaveResult(null)
    startSave(async () => {
      const toSave = matched
        .filter(m => m.matchedItemId)
        .map(m => ({
          ciplItemId: m.matchedItemId!,
          dataUrl: `data:${m.mediaType};base64,${m.base64}`,
          rowIndex: m.rowIndex,
          colIndex: m.colIndex,
        }))

      if (toSave.length === 0) {
        setSaveResult({ ok: false, msg: 'No hay fotos asignadas a ítems. Asigná al menos una.' })
        return
      }

      // Batch to stay under server-action 1MB body limit.
      // Each photo's dataUrl is ~150-300KB base64, so 3 per batch is safe.
      const BATCH_SIZE = 3
      let totalSaved = 0
      for (let i = 0; i < toSave.length; i += BATCH_SIZE) {
        const batch = toSave.slice(i, i + BATCH_SIZE)
        const res = await saveCIPLPhotos(batch)
        if (!res.ok) {
          setSaveResult({ ok: false, msg: `Falló al guardar batch ${i / BATCH_SIZE + 1}: ${res.error}` })
          return
        }
        totalSaved += res.saved
      }

      setSaveResult({ ok: true, msg: `${totalSaved} foto${totalSaved === 1 ? '' : 's'} guardada${totalSaved === 1 ? '' : 's'}.` })
      setMatched([])
    })
  }

  const matchedCount = matched.filter(m => m.matchedItemId).length
  const unmatchedCount = matched.length - matchedCount

  return (
    <div className="space-y-4">
      <InspectionPhotoUploader
        onExtracted={() => {}}
        onAIComplete={handleAIComplete}
      />

      {matching && (
        <p className="text-[11px] text-blue-400 inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Matcheando fotos con ítems en DB…
        </p>
      )}

      {matched.length > 0 && !matching && (
        <>
          <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-3 flex items-center gap-4 text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> {matchedCount} matcheada{matchedCount === 1 ? '' : 's'}
            </span>
            {unmatchedCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" /> {unmatchedCount} sin match (asignar manualmente)
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || matchedCount === 0}
              className="ml-auto px-3 py-1.5 rounded-md text-[11px] font-medium bg-[#31AF4F] hover:bg-[#31AF4F]/85 disabled:opacity-40 text-white inline-flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Guardar {matchedCount} foto{matchedCount === 1 ? '' : 's'}
            </button>
          </div>

          {saveResult && (
            <div className={cn(
              'rounded-md border p-3 text-[11px] inline-flex items-center gap-1.5',
              saveResult.ok ? 'border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-300' : 'border-red-500/30 bg-red-500/[0.05] text-red-300',
            )}>
              {saveResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {saveResult.msg}
            </div>
          )}

          <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-[12px]">
                <thead>
                  <tr className="bg-[#0d0d0d] border-b border-white/[0.06]">
                    <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Foto</th>
                    <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">IA detectó</th>
                    <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Asignar a ítem</th>
                    <th className="text-center text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {matched.map((m, idx) => {
                    // Detectar discrepancia: AI extrajo un cartonNo pero el item matcheado tiene un caseNo distinto
                    const normalizeNum = (s: string | null | undefined) => (s ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
                    const aiCarton = normalizeNum(m.ai?.cartonNo)
                    const itemCase = normalizeNum(m.matchedItemCase)
                    const cartonMismatch = aiCarton && itemCase && aiCarton !== itemCase &&
                      !aiCarton.startsWith(itemCase) && !itemCase.startsWith(aiCarton)
                    return (
                    <tr key={`${m.rowIndex}-${m.colIndex}`} className={cn(
                      'border-b border-white/[0.04] last:border-0',
                      cartonMismatch && 'bg-amber-500/[0.04]',
                    )}>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setLightbox(`data:${m.mediaType};base64,${m.base64}`)}
                          className="w-16 h-16 rounded overflow-hidden bg-black border border-white/[0.04] hover:border-[#31AF4F]/40 cursor-zoom-in transition-colors group block"
                          title="Click para agrandar"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`data:${m.mediaType};base64,${m.base64}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt="" />
                        </button>
                      </td>
                      <td className="px-3 py-2 text-[10px] text-zinc-400 font-mono">
                        {m.ai ? (
                          <div className="space-y-0.5">
                            {m.ai.labelType && (
                              <span className={cn(
                                'inline-block mb-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase',
                                m.ai.labelType === 'box'  && 'bg-blue-500/15 text-blue-400',
                                m.ai.labelType === 'part' && 'bg-purple-500/15 text-purple-400',
                                m.ai.labelType === 'unknown' && 'bg-zinc-500/15 text-zinc-400',
                              )}>{m.ai.labelType === 'box' ? '📦 Caja' : m.ai.labelType === 'part' ? '🔧 Repuesto' : '? Desconocido'}</span>
                            )}
                            {m.ai.cartonNo && <div><span className="text-zinc-600">Carton:</span> {m.ai.cartonNo}</div>}
                            {m.ai.partCode && <div><span className="text-zinc-600">Código:</span> {m.ai.partCode}</div>}
                            {m.ai.partDescription && <div className="text-zinc-300 truncate" title={m.ai.partDescription}><span className="text-zinc-600">Desc:</span> {m.ai.partDescription}</div>}
                            {m.ai.partQty != null && <div><span className="text-zinc-600">Qty:</span> {m.ai.partQty}</div>}
                            {m.ai.asn && <div><span className="text-zinc-600">ASN:</span> {m.ai.asn}</div>}
                            {m.ai.soNo && <div><span className="text-zinc-600">SO:</span> {m.ai.soNo}</div>}
                            {m.ai.modelo && <div><span className="text-zinc-600">Modelo:</span> {m.ai.modelo}</div>}
                            {m.ai.confidence && (
                              <span className={cn(
                                'inline-block mt-1 px-1 py-0.5 rounded text-[8px] font-bold uppercase',
                                m.ai.confidence === 'high'   && 'bg-emerald-500/15 text-emerald-400',
                                m.ai.confidence === 'medium' && 'bg-amber-500/15 text-amber-400',
                                m.ai.confidence === 'low'    && 'bg-red-500/15 text-red-400',
                              )}>{m.ai.confidence}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-600 italic">IA no analizó</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={m.matchedItemId ?? ''}
                          onChange={e => overrideMatch(idx, e.target.value)}
                          className={cn(
                            'w-full px-2 py-1 rounded bg-[#0d0d0d] border text-white text-[11px] focus:outline-none focus:border-[#31AF4F]/50',
                            cartonMismatch ? 'border-amber-500/50' : 'border-white/[0.08]',
                          )}
                        >
                          <option value="">— Sin asignar —</option>
                          {items.map(it => (
                            <option key={it.id} value={it.id}>
                              {it.asn ?? '?'} · {it.soPrincipal ?? '?'} · {it.caseNo ?? '?'} · {(it.description ?? '').slice(0, 30)}
                            </option>
                          ))}
                        </select>
                        {cartonMismatch && (
                          <div className="mt-1 text-[10px] text-amber-400 inline-flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Carton no coincide: leí <code className="font-mono">{m.ai?.cartonNo}</code>, ítem tiene <code className="font-mono">{m.matchedItemCase}</code>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {m.matchReason === 'box-carton' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">CARTON</span>}
                        {m.matchReason === 'part-code'  && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">CÓDIGO</span>}
                        {m.matchReason === 'part-desc'  && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">DESC</span>}
                        {m.matchReason === 'asn+case'   && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">ASN+CASE</span>}
                        {m.matchReason === 'asn+so'     && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">ASN+SO</span>}
                        {m.matchReason === 'asn'        && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-bold">ASN</span>}
                        {m.matchReason === 'so'         && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-bold">SO</span>}
                        {m.matchReason === 'none'       && <span className="text-[9px] text-zinc-500">—</span>}
                      </td>
                    </tr>
                  )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {matched.length === 0 && !matching && (
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-6 text-center text-[12px] text-zinc-500">
          <Sparkles className="w-6 h-6 mx-auto text-zinc-700 mb-2" />
          Subí un Excel arriba para empezar. La IA va a analizar cada foto y matchearla automáticamente.
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg"
            alt=""
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            aria-label="Cerrar"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  )
}
