'use client'

import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import type { EmbarqueItem } from '../types'

export function ItemsTab({ items }: { items: EmbarqueItem[] }) {
  const [query, setQuery] = useState('')

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

      <div className="space-y-4">
        {grouped.map(([asn, rows]) => (
          <div key={asn} className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
            <div className="px-4 py-2 bg-[#0d0d0d] border-b border-white/[0.06] flex items-center gap-3">
              <span className="font-mono text-[11px] font-semibold text-zinc-300">{asn}</span>
              <span className="text-[10px] text-zinc-500">{rows.length} ítems</span>
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
        ))}
      </div>
    </div>
  )
}
