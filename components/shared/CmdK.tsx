'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Anchor, Package, ShoppingCart, FileText, Loader2 } from 'lucide-react'
import type { SearchResult } from '@/app/api/search/route'

/**
 * Eventos para abrir CmdK desde cualquier lado del UI (ej: botón del
 * sidebar). El componente ya escucha al keydown global, este custom
 * event es para triggers programáticos.
 */
const OPEN_CMDK_EVENT = 'panel:open-cmdk'

export function openCmdK() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_CMDK_EVENT))
  }
}

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
    function programmaticOpen() {
      setOpen(true)
    }
    window.addEventListener('keydown', handler)
    window.addEventListener(OPEN_CMDK_EVENT, programmaticOpen)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener(OPEN_CMDK_EVENT, programmaticOpen)
    }
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

  const showingResults = query.trim().length >= 2 && results !== null

  if (!open) return null

  const total = results
    ? results.embarques.length + results.sos.length + results.asns.length + results.productos.length + results.compras.length
    : 0

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-start justify-center pt-[12vh] px-4"
      onClick={close}
    >
      <div
        className="w-full max-w-2xl glass-card overflow-hidden shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.04]">
          <Search className="w-4 h-4 text-[#31AF4F]/80 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar embarque, SO, ASN, producto o compra…"
            className="flex-1 bg-transparent text-white text-[14px] placeholder:text-white/30 focus:outline-none"
          />
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40" />}
          <kbd className="text-[10px] font-mono text-white/35 border border-white/[0.08] rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim().length < 2 && (
            <div className="px-5 py-12 text-center">
              <p className="text-white/40 text-[12px] mb-3">Empezá a tipear para buscar</p>
              <p className="text-[10px] text-white/25">
                Embarques · SOs · ASNs · Productos · Compras
              </p>
            </div>
          )}

          {showingResults && total === 0 && (
            <p className="px-5 py-12 text-center text-white/40 text-[12px]">
              Sin resultados para &quot;{query}&quot;
            </p>
          )}

          {showingResults && total > 0 && results && (
            <div className="p-2 space-y-3">
              {results.embarques.length > 0 && (
                <Section title="Embarques" icon={Anchor}>
                  {results.embarques.map(e => (
                    <Row key={e.embarqueNo} onClick={() => go(`/embarques/${encodeURIComponent(e.embarqueNo)}`)}>
                      <span className="font-mono text-[12px] text-white">{e.embarqueNo}</span>
                      <span className="ml-auto text-[10px] text-white/40">{e.sos.length} SOs · {e.estado}</span>
                    </Row>
                  ))}
                </Section>
              )}

              {results.sos.length > 0 && (
                <Section title="SOs" icon={Package}>
                  {results.sos.map(s => (
                    <Row key={s.soNumber} onClick={() => go(`/embarques?q=${encodeURIComponent(s.soNumber)}`)}>
                      <span className="font-mono text-[12px] text-[#31AF4F]">{s.soNumber}</span>
                      <span className="ml-auto text-[10px] text-white/40">{s.count} ítem{s.count === 1 ? '' : 's'}</span>
                    </Row>
                  ))}
                </Section>
              )}

              {results.asns.length > 0 && (
                <Section title="ASNs" icon={Package}>
                  {results.asns.map(a => (
                    <Row key={a.asn} onClick={() => go(`/embarques?q=${encodeURIComponent(a.asn)}`)}>
                      <span className="font-mono text-[12px] text-amber-300">{a.asn}</span>
                      <span className="ml-auto text-[10px] text-white/40">{a.count} ítem{a.count === 1 ? '' : 's'}</span>
                    </Row>
                  ))}
                </Section>
              )}

              {results.productos.length > 0 && (
                <Section title="Productos" icon={FileText}>
                  {results.productos.map(p => (
                    <Row key={p.id} onClick={() => go(p.soPrincipal ? `/embarques?q=${encodeURIComponent(p.soPrincipal)}` : '/embarques')}>
                      <span className="text-[12px] text-white/85 truncate">{p.description}</span>
                      <span className="ml-auto text-[10px] text-white/40 font-mono">{p.sku ?? p.codeEan ?? ''}</span>
                    </Row>
                  ))}
                </Section>
              )}

              {results.compras.length > 0 && (
                <Section title="Compras" icon={ShoppingCart}>
                  {results.compras.map(c => (
                    <Row key={c.id} onClick={() => go(`/compras/${c.id}`)}>
                      <span className="text-[12px] text-white">{c.piNo ?? c.id.slice(0, 8)}</span>
                      {c.supplierName && <span className="ml-2 text-[11px] text-white/50 truncate">{c.supplierName}</span>}
                    </Row>
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-white/[0.04] flex items-center gap-4 text-[10px] text-white/35">
          <span className="flex items-center gap-1">
            <kbd className="font-mono text-white/55 border border-white/[0.08] rounded px-1 text-[9px]">↵</kbd>
            abrir
          </span>
          <span className="flex items-center gap-1">
            <kbd className="font-mono text-white/55 border border-white/[0.08] rounded px-1 text-[9px]">ESC</kbd>
            cerrar
          </span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className="font-mono text-white/55 border border-white/[0.08] rounded px-1 text-[9px]">⌘K</kbd>
            <span>/</span>
            <kbd className="font-mono text-white/55 border border-white/[0.08] rounded px-1 text-[9px]">Ctrl+K</kbd>
          </span>
        </div>
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-3 pb-1.5 eyebrow flex items-center gap-1.5">
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
      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md hover:bg-white/[0.04] text-left transition-colors"
    >
      {children}
    </button>
  )
}
