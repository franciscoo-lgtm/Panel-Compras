'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, AlertTriangle, Save, Loader2, Camera, Sparkles } from 'lucide-react'
import { InspectionPhotoUploader, type PhotoExtractionResult } from '@/components/shared/InspectionPhotoUploader'
import { matchPhotosToItems, saveCIPLPhotos, type MatchedPhoto } from '@/app/lib/photo-actions'
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

  async function handleAIComplete(photos: PhotoExtractionResult[]) {
    setSaveResult(null)
    startMatching(async () => {
      const matched = await matchPhotosToItems(photos)
      setMatched(matched)
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

      const res = await saveCIPLPhotos(toSave)
      if (res.ok) {
        setSaveResult({ ok: true, msg: `${res.saved} foto${res.saved === 1 ? '' : 's'} guardada${res.saved === 1 ? '' : 's'}.` })
        setMatched([])
      } else {
        setSaveResult({ ok: false, msg: res.error })
      }
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
              className="ml-auto px-3 py-1.5 rounded-md text-[11px] font-medium bg-[#E30613] hover:bg-[#E30613]/85 disabled:opacity-40 text-white inline-flex items-center gap-1.5"
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
                  {matched.map((m, idx) => (
                    <tr key={`${m.rowIndex}-${m.colIndex}`} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-3 py-2">
                        <div className="w-16 h-16 rounded overflow-hidden bg-black">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`data:${m.mediaType};base64,${m.base64}`} className="w-full h-full object-cover" alt="" />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[10px] text-zinc-400 font-mono">
                        {m.ai ? (
                          <div className="space-y-0.5">
                            {m.ai.asn && <div><span className="text-zinc-600">ASN:</span> {m.ai.asn}</div>}
                            {m.ai.soNo && <div><span className="text-zinc-600">SO:</span> {m.ai.soNo}</div>}
                            {m.ai.cartonNo && <div><span className="text-zinc-600">Carton:</span> {m.ai.cartonNo}</div>}
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
                          className="w-full px-2 py-1 rounded bg-[#0d0d0d] border border-white/[0.08] text-white text-[11px] focus:outline-none focus:border-[#E30613]/50"
                        >
                          <option value="">— Sin asignar —</option>
                          {items.map(it => (
                            <option key={it.id} value={it.id}>
                              {it.asn ?? '?'} · {it.soPrincipal ?? '?'} · {it.caseNo ?? '?'} · {(it.description ?? '').slice(0, 30)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {m.matchReason === 'asn+case' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">ASN+CASE</span>}
                        {m.matchReason === 'asn+so'   && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">ASN+SO</span>}
                        {m.matchReason === 'asn'      && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-bold">ASN</span>}
                        {m.matchReason === 'so'       && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-bold">SO</span>}
                        {m.matchReason === 'none'     && <span className="text-[9px] text-zinc-500">—</span>}
                      </td>
                    </tr>
                  ))}
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
    </div>
  )
}
