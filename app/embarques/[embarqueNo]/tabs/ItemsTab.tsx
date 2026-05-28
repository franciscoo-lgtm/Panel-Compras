'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Trash2, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { deleteCIPLByAsn, type DeleteCIPLResult } from '@/app/lib/cipl-actions'
import type { EmbarqueItem } from '../types'

export function ItemsTab({ items }: { items: EmbarqueItem[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [confirmAsn, setConfirmAsn] = useState<string | null>(null)
  const [deleting, startDelete] = useTransition()
  const [deletingAsn, setDeletingAsn] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<DeleteCIPLResult | null>(null)

  const grouped = useMemo(() => {
    const q = query.trim().toUpperCase()
    const filtered = items.filter(i => {
      if (!q) return true
      return (
        i.soPrincipal?.toUpperCase().includes(q) ||
        i.description?.toUpperCase().includes(q) ||
        i.asn?.toUpperCase().includes(q) ||
        i.codeEan?.toUpperCase().includes(q)
      )
    })
    const map = new Map<string, EmbarqueItem[]>()
    for (const it of filtered) {
      const key = it.asn ?? '(sin ASN)'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    return Array.from(map.entries())
  }, [items, query])

  function handleDelete(asn: string) {
    if (asn === '(sin ASN)') return  // no se puede borrar grupo sin ASN
    setDeletingAsn(asn)
    setLastResult(null)
    startDelete(async () => {
      const res = await deleteCIPLByAsn(asn)
      setLastResult(res)
      setDeletingAsn(null)
      setConfirmAsn(null)
      if (res.ok) {
        // Refrescar la página para que desaparezcan los ítems
        router.refresh()
      }
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-[11px] text-zinc-500">{items.length} ítems en este embarque</p>
        <div className="relative w-full md:w-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar SO, descripción, EAN…"
            className="pl-8 pr-3 py-1.5 w-full md:w-72 rounded-md text-[11px] bg-[#0d0d0d] border border-white/[0.08] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#E30613]/50"
          />
        </div>
      </div>

      {lastResult && (
        <div className={`mb-3 rounded-md border p-3 text-[11px] flex items-start gap-2 ${
          lastResult.ok
            ? 'border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-300'
            : 'border-red-500/30 bg-red-500/[0.05] text-red-300'
        }`}>
          {lastResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <div>
            {lastResult.ok ? (
              <>
                <p className="font-semibold">
                  PL {lastResult.asn} eliminado: {lastResult.itemsDeleted} ítems, {lastResult.photosDeleted} fotos, {lastResult.driveFilesDeleted} archivos de Drive
                </p>
                {lastResult.driveErrors.length > 0 && (
                  <p className="text-[10px] text-amber-400 mt-1">
                    Algunos archivos de Drive no se pudieron borrar: {lastResult.driveErrors.join(' · ')}
                  </p>
                )}
              </>
            ) : (
              <p>Error al eliminar PL {lastResult.asn}: {lastResult.error}</p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {grouped.map(([asn, rows]) => {
          const isDeleting = deletingAsn === asn
          const isConfirming = confirmAsn === asn
          const isSinAsn = asn === '(sin ASN)'
          return (
            <div key={asn} className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
              <div className="px-4 py-2 bg-[#0d0d0d] border-b border-white/[0.06] flex items-center gap-3">
                <span className="font-mono text-[11px] font-semibold text-zinc-300">{asn}</span>
                <span className="text-[10px] text-zinc-500">{rows.length} ítems</span>

                {!isSinAsn && !isConfirming && (
                  <button
                    onClick={() => setConfirmAsn(asn)}
                    className="ml-auto text-zinc-500 hover:text-red-400 text-[10px] inline-flex items-center gap-1 transition-colors"
                    title="Eliminar todo este PL (DB + Drive)"
                  >
                    <Trash2 className="w-3 h-3" />
                    Eliminar PL
                  </button>
                )}

                {isConfirming && (
                  <div className="ml-auto inline-flex items-center gap-2">
                    <span className="text-[10px] text-red-400">¿Borrar {rows.length} ítems + archivos Drive?</span>
                    <button
                      onClick={() => handleDelete(asn)}
                      disabled={isDeleting || deleting}
                      className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500 hover:bg-red-500/85 disabled:opacity-40 text-white inline-flex items-center gap-1"
                    >
                      {isDeleting ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Trash2 className="w-2.5 h-2.5" />}
                      Sí
                    </button>
                    <button
                      onClick={() => setConfirmAsn(null)}
                      disabled={isDeleting || deleting}
                      className="px-2 py-0.5 rounded text-[10px] font-medium border border-white/[0.15] hover:bg-white/[0.06] text-zinc-300"
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[12px]">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2">SO</th>
                      <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2">Descripción</th>
                      <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2">SKU</th>
                      <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2">EAN</th>
                      <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2">Qty</th>
                      <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2">CBM</th>
                      <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2">GW kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(it => (
                      <tr key={it.id} className="border-b border-white/[0.04] last:border-0">
                        <td className="px-4 py-2 font-mono text-[11px] text-emerald-400">{it.soPrincipal ?? '—'}</td>
                        <td className="px-4 py-2 text-zinc-200">{it.description ?? '—'}</td>
                        <td className="px-4 py-2 font-mono text-[10px] text-zinc-500">{it.sku ?? '—'}</td>
                        <td className="px-4 py-2 font-mono text-[10px] text-zinc-500">{it.codeEan ?? '—'}</td>
                        <td className="px-4 py-2 text-right text-zinc-300 tabular-nums">{it.qty ?? 0}</td>
                        <td className="px-4 py-2 text-right text-zinc-500 tabular-nums">{(it.cbm ?? 0).toFixed(3)}</td>
                        <td className="px-4 py-2 text-right text-zinc-500 tabular-nums">{(it.gwKg ?? 0).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
