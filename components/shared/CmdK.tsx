'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Anchor, Package, ShoppingCart, FileText, Loader2 } from 'lucide-react'
import type { SearchResult } from '@/app/api/search/route'

export function CmdK() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function close() {
    setOpen(false)
    setQuery('')
    setResults(null)
  }

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) return
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res: SearchResult = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`).then(r => r.json())
        setResults(res)
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  function go(href: string) {
    close()
    router.push(href)
  }

  // Render results only when query is long enough; otherwise show placeholder
  const showingResults = query.trim().length >= 2 && results !== null

  if (!open) return null

  const total = results
    ? results.embarques.length + results.sos.length + results.asns.length + results.productos.length + results.compras.length
    : 0

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4" onClick={close}>
      <div className="w-full max-w-2xl bg-[#0a0a0a] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar embarque, SO, ASN, producto o compra…"
            className="flex-1 bg-transparent text-white text-[14px] placeholder:text-zinc-600 focus:outline-none"
          />
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />}
          <kbd className="text-[9px] font-mono text-zinc-600 border border-white/[0.08] rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim().length < 2 && (
            <p className="px-4 py-8 text-center text-zinc-500 text-[12px]">Escribí al menos 2 caracteres</p>
          )}

          {showingResults && total === 0 && (
            <p className="px-4 py-8 text-center text-zinc-500 text-[12px]">Sin resultados para &quot;{query}&quot;</p>
          )}

          {showingResults && total > 0 && results && (
            <div className="p-2 space-y-3">
              {results.embarques.length > 0 && (
                <Section title="Embarques" icon={Anchor}>
                  {results.embarques.map(e => (
                    <Row key={e.embarqueNo} onClick={() => go(`/embarques/${encodeURIComponent(e.embarqueNo)}`)}>
                      <span className="font-mono text-[12px] text-white">{e.embarqueNo}</span>
                      <span className="ml-auto text-[10px] text-zinc-500">{e.sos.length} SOs · {e.estado}</span>
                    </Row>
                  ))}
                </Section>
              )}

              {results.sos.length > 0 && (
                <Section title="SOs" icon={Package}>
                  {results.sos.map(s => (
                    <Row key={s.soNumber} onClick={() => go(`/embarques?q=${encodeURIComponent(s.soNumber)}`)}>
                      <span className="font-mono text-[12px] text-emerald-400">{s.soNumber}</span>
                      <span className="ml-auto text-[10px] text-zinc-500">{s.count} ítem{s.count === 1 ? '' : 's'}</span>
                    </Row>
                  ))}
                </Section>
              )}

              {results.asns.length > 0 && (
                <Section title="ASNs" icon={Package}>
                  {results.asns.map(a => (
                    <Row key={a.asn} onClick={() => go(`/embarques?q=${encodeURIComponent(a.asn)}`)}>
                      <span className="font-mono text-[12px] text-amber-400">{a.asn}</span>
                      <span className="ml-auto text-[10px] text-zinc-500">{a.count} ítem{a.count === 1 ? '' : 's'}</span>
                    </Row>
                  ))}
                </Section>
              )}

              {results.productos.length > 0 && (
                <Section title="Productos" icon={FileText}>
                  {results.productos.map(p => (
                    <Row key={p.id} onClick={() => go(p.soPrincipal ? `/embarques?q=${encodeURIComponent(p.soPrincipal)}` : '/embarques')}>
                      <span className="text-[12px] text-zinc-200 truncate">{p.description}</span>
                      <span className="ml-auto text-[10px] text-zinc-500 font-mono">{p.sku ?? p.codeEan ?? ''}</span>
                    </Row>
                  ))}
                </Section>
              )}

              {results.compras.length > 0 && (
                <Section title="Compras" icon={ShoppingCart}>
                  {results.compras.map(c => (
                    <Row key={c.id} onClick={() => go(`/compras/${c.id}`)}>
                      <span className="text-[12px] text-white">{c.piNo ?? c.id.slice(0, 8)}</span>
                      {c.supplierName && <span className="ml-2 text-[11px] text-zinc-500 truncate">{c.supplierName}</span>}
                    </Row>
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-white/[0.06] flex items-center gap-3 text-[10px] text-zinc-500">
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span className="ml-auto">⌘K / Ctrl+K para abrir</span>
        </div>
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-2 pb-1 text-[9px] uppercase tracking-wider text-zinc-600 font-semibold flex items-center gap-1.5">
        <Icon className="w-3 h-3" /> {title}
      </p>
      <div>{children}</div>
    </div>
  )
}

function Row({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/[0.04] text-left"
    >
      {children}
    </button>
  )
}
