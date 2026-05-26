'use client'

import { useState, useTransition, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, ChevronLeft, Loader2, AlertCircle, ClipboardList } from 'lucide-react'
import { crearCompra } from '@/app/compras/actions'
import type { SOOption } from '@/app/lib/sheets'

const fmt = (n: number | null) =>
  n != null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '—'

export type SupplierSuggestions = {
  names:     string[]
  addresses: string[]
  contacts:  string[]
  phones:    string[]
  emails:    string[]
  byName:    Record<string, {
    address: string | null
    contact: string | null
    phone:   string | null
    email:   string | null
  }>
}

const EMPTY_SUGGESTIONS: SupplierSuggestions = {
  names: [], addresses: [], contacts: [], phones: [], emails: [], byName: {},
}

export function NuevaCompraClient({
  soList,
  supplierSuggestions = EMPTY_SUGGESTIONS,
}: {
  soList: SOOption[]
  supplierSuggestions?: SupplierSuggestions
}) {
  const router = useRouter()
  const [query, setQuery]           = useState('')
  const [selected, setSelected]     = useState<SOOption[]>([])
  const [pending, startTransition]  = useTransition()
  const [error, setError]           = useState<string | null>(null)
  const [pasteMode, setPasteMode]   = useState(false)
  const [pasteText, setPasteText]   = useState('')
  const [pasteResult, setPasteResult] = useState<{ found: string[]; missing: string[] } | null>(null)
  const pasteRef = useRef<HTMLTextAreaElement>(null)

  const [piNo, setPiNo]                   = useState('')
  const [notas, setNotas]                 = useState('')
  const [supplierName, setSupplierName]   = useState('')
  const [supplierAddress, setSupplierAddress] = useState('')
  const [supplierContact, setSupplierContact] = useState('')
  const [supplierPhone, setSupplierPhone] = useState('')
  const [supplierEmail, setSupplierEmail] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return soList.slice(0, 40)
    const q = query.toLowerCase()
    return soList.filter(s =>
      s.soNumber.toLowerCase().includes(q) ||
      (s.modelo ?? '').toLowerCase().includes(q) ||
      (s.sku    ?? '').toLowerCase().includes(q)
    ).slice(0, 40)
  }, [query, soList])

  const toggle = (so: SOOption) => {
    setSelected(prev =>
      prev.some(s => s.soNumber === so.soNumber)
        ? prev.filter(s => s.soNumber !== so.soNumber)
        : [...prev, so]
    )
  }

  function handlePasteConfirm() {
    // Parse any separator: comma, semicolon, newline, tab, space
    const tokens = pasteText
      .split(/[\s,;|\t\n]+/)
      .map(t => t.trim().toUpperCase())
      .filter(Boolean)

    const soIndex = new Map(soList.map(s => [s.soNumber.toUpperCase(), s]))
    const found:   SOOption[] = []
    const missing: string[]   = []

    for (const token of tokens) {
      // Accept "SO-12345", "SO 12345", or bare "12345"
      const normalized = token.startsWith('SO') ? token : `SO-${token}`
      const match = soIndex.get(token) ?? soIndex.get(normalized)
      if (match) {
        if (!selected.some(s => s.soNumber === match.soNumber) &&
            !found.some(s => s.soNumber === match.soNumber)) {
          found.push(match)
        }
      } else {
        missing.push(token)
      }
    }

    if (found.length > 0) {
      setSelected(prev => [...prev, ...found])
    }
    setPasteResult({ found: found.map(s => s.soNumber), missing })
    if (missing.length === 0) {
      setPasteMode(false)
      setPasteText('')
    }
  }

  const totalQty = selected.reduce((s, o) => s + (o.qPi ?? 0), 0)
  const totalFob = selected.reduce((s, o) => s + (o.fobTotal ?? 0), 0)

  function handleSubmit() {
    setError(null)
    if (!piNo.trim()) { setError('El PI N° es obligatorio.'); return }
    if (selected.length === 0) { setError('Seleccioná al menos un SO.'); return }
    startTransition(async () => {
      const res = await crearCompra({
        piNo, notas, supplierName, supplierAddress,
        supplierContactName: supplierContact,
        supplierContactPhone: supplierPhone,
        supplierContactEmail: supplierEmail,
        soNumbers: selected.map(s => s.soNumber),
      })
      if (res.ok && res.compraId) {
        router.push(`/compras/${res.compraId}`)
      } else if (!res.ok) {
        setError(res.error)
      }
    })
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-white/30 hover:text-white/70 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-[15px] font-semibold text-white">Nueva Orden de Compra</h1>
            <p className="text-[11px] text-white/30 mt-0.5">Seleccioná los SOs del GSO V4</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.back()} className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/5 border border-white/10 text-white/50 hover:text-white/70 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={pending}
            className="px-4 py-1.5 rounded-lg text-[12px] font-semibold bg-[#E30613] text-white hover:bg-[#c00510] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {pending && <Loader2 className="w-3 h-3 animate-spin" />}
            Crear Compra
          </button>
        </div>
      </div>

      <div className="flex gap-0 h-[calc(100vh-61px)]">
        {/* Left: SO picker + form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-[12px] text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* SO Selector */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-4">1. Seleccioná los SOs del GSO V4</p>
            {/* Mode toggle */}
            <div className="flex gap-1.5 mb-3">
              <button
                onClick={() => { setPasteMode(false); setPasteResult(null) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${!pasteMode ? 'bg-white/[0.08] text-white' : 'text-white/30 hover:text-white/60'}`}
              >
                <Search className="w-3 h-3" /> Buscar
              </button>
              <button
                onClick={() => { setPasteMode(true); setPasteResult(null); setTimeout(() => pasteRef.current?.focus(), 50) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${pasteMode ? 'bg-white/[0.08] text-white' : 'text-white/30 hover:text-white/60'}`}
              >
                <ClipboardList className="w-3 h-3" /> Pegar lista
              </button>
            </div>

            {pasteMode ? (
              <div className="space-y-2">
                <textarea
                  ref={pasteRef}
                  value={pasteText}
                  onChange={e => { setPasteText(e.target.value); setPasteResult(null) }}
                  placeholder={"Pegá los SOs separados por coma, espacio o enter:\nSO-40094, SO-40095\nSO-40096"}
                  rows={4}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-white placeholder-white/20 outline-none focus:border-white/20 resize-none font-mono"
                />
                <button
                  onClick={handlePasteConfirm}
                  disabled={!pasteText.trim()}
                  className="w-full py-2 rounded-lg text-[12px] font-semibold bg-[#E30613]/15 border border-[#E30613]/30 text-[#E30613] hover:bg-[#E30613]/25 transition-colors disabled:opacity-30"
                >
                  Agregar SOs
                </button>
                {pasteResult && (
                  <div className="space-y-1.5">
                    {pasteResult.found.length > 0 && (
                      <div className="flex items-start gap-2 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                        <span className="shrink-0 font-semibold">{pasteResult.found.length} encontrados:</span>
                        <span className="font-mono">{pasteResult.found.join(', ')}</span>
                      </div>
                    )}
                    {pasteResult.missing.length > 0 && (
                      <div className="flex items-start gap-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        <span className="shrink-0 font-semibold">{pasteResult.missing.length} no encontrados:</span>
                        <span className="font-mono">{pasteResult.missing.join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por SO, modelo, SKU..."
                className="w-full pl-9 pr-4 py-2.5 bg-white/[0.04] border border-white/10 rounded-lg text-[13px] text-white placeholder-white/20 outline-none focus:border-white/20"
              />
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {filtered.map(so => {
                const isSelected = selected.some(s => s.soNumber === so.soNumber)
                return (
                  <button
                    key={so.soNumber}
                    onClick={() => toggle(so)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? 'bg-[#E30613]/[0.06] border-[#E30613]/40'
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${isSelected ? 'bg-[#E30613] border-[#E30613] text-white text-[10px]' : 'border-white/20'}`}>
                      {isSelected && '✓'}
                    </div>
                    <span className="font-mono text-[11px] font-bold text-[#E30613] bg-[#E30613]/10 px-2 py-0.5 rounded shrink-0">{so.soNumber}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-white font-medium truncate">{so.modelo ?? '—'}</div>
                      <div className="text-[11px] text-white/35 mt-0.5">{so.sku ?? ''}{so.qPi ? ` · ${so.qPi} un.` : ''}</div>
                    </div>
                    <div className="text-[12px] text-white/40 shrink-0">{fmt(so.fobTotal)}</div>
                  </button>
                )
              })}
              {filtered.length === 0 && <p className="text-center py-8 text-[12px] text-white/20">Sin resultados</p>}
            </div>
            {selected.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/25 mb-2">SOs seleccionados</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.map(so => (
                    <span key={so.soNumber} className="inline-flex items-center gap-1.5 bg-[#E30613]/10 border border-[#E30613]/25 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#fb9ca2]">
                      {so.soNumber}
                      <button onClick={() => toggle(so)} className="text-white/30 hover:text-white/60"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            </>
            )}
          </div>

          {/* PI + Notes */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-4">2. Datos de la orden</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30 block mb-1.5">PI N° *</label>
                <input value={piNo} onChange={e => setPiNo(e.target.value)} placeholder="CAS-2025-001" className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-white/20" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30 block mb-1.5">Notas</label>
                <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones..." className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-white/20" />
              </div>
            </div>
          </div>

          {/* Supplier */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-4">3. Datos del proveedor <span className="text-white/15 font-normal normal-case">(aparecen en el PL Consolidado · escribí para ver sugerencias)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30 block mb-1.5">Nombre del proveedor</label>
                <input
                  list="supplier-names-list"
                  autoComplete="off"
                  value={supplierName}
                  onChange={e => {
                    const v = e.target.value
                    setSupplierName(v)
                    // Si el nombre matchea exactamente uno conocido, auto-completar
                    // los otros campos (a menos que el user ya haya escrito algo).
                    const match = supplierSuggestions.byName[v.trim()]
                    if (match) {
                      if (!supplierAddress.trim() && match.address) setSupplierAddress(match.address)
                      if (!supplierContact.trim() && match.contact) setSupplierContact(match.contact)
                      if (!supplierPhone.trim()   && match.phone)   setSupplierPhone(match.phone)
                      if (!supplierEmail.trim()   && match.email)   setSupplierEmail(match.email)
                    }
                  }}
                  placeholder="Ej: DJI Technology Co. Ltd."
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-white/20"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30 block mb-1.5">Dirección</label>
                <input list="supplier-addresses-list" autoComplete="off" value={supplierAddress} onChange={e => setSupplierAddress(e.target.value)} placeholder="Dirección de la fábrica" className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-white/20" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30 block mb-1.5">Contacto</label>
                <input list="supplier-contacts-list" autoComplete="off" value={supplierContact} onChange={e => setSupplierContact(e.target.value)} placeholder="Nombre" className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-white/20" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30 block mb-1.5">Teléfono</label>
                <input list="supplier-phones-list" autoComplete="off" value={supplierPhone} onChange={e => setSupplierPhone(e.target.value)} placeholder="+86 ..." className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-white/20" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30 block mb-1.5">Email</label>
                <input list="supplier-emails-list" autoComplete="off" value={supplierEmail} onChange={e => setSupplierEmail(e.target.value)} placeholder="proveedor@dji.com" className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-white/20" />
              </div>
            </div>

            <datalist id="supplier-names-list">
              {supplierSuggestions.names.map(v => <option key={v} value={v} />)}
            </datalist>
            <datalist id="supplier-addresses-list">
              {supplierSuggestions.addresses.map(v => <option key={v} value={v} />)}
            </datalist>
            <datalist id="supplier-contacts-list">
              {supplierSuggestions.contacts.map(v => <option key={v} value={v} />)}
            </datalist>
            <datalist id="supplier-phones-list">
              {supplierSuggestions.phones.map(v => <option key={v} value={v} />)}
            </datalist>
            <datalist id="supplier-emails-list">
              {supplierSuggestions.emails.map(v => <option key={v} value={v} />)}
            </datalist>

            {supplierSuggestions.names.length > 0 && (
              <p className="mt-3 text-[10px] text-white/30">
                ✨ {supplierSuggestions.names.length} proveedor{supplierSuggestions.names.length === 1 ? '' : 'es'} usado{supplierSuggestions.names.length === 1 ? '' : 's'} antes. Si elegís uno del autocomplete del nombre, dirección/contacto/teléfono/email se completan automáticamente con la última compra que tenía ese proveedor.
              </p>
            )}
          </div>
        </div>

        {/* Right: sticky summary */}
        <div className="w-72 border-l border-white/[0.06] p-5 sticky top-0 h-full overflow-y-auto flex flex-col gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-3">Resumen</p>
            <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
              <div className="flex justify-between text-[12px]">
                <span className="text-white/40">SOs seleccionados</span>
                <span className="text-white font-semibold">{selected.length}</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-white/40">Total unidades</span>
                <span className="text-white font-semibold">{totalQty.toLocaleString()} un.</span>
              </div>
              <div className="pt-3 border-t border-white/[0.06] flex justify-between">
                <span className="text-[12px] font-semibold text-white/50">FOB Total</span>
                <span className="text-[16px] font-bold text-white">{fmt(totalFob)}</span>
              </div>
            </div>
          </div>

          {selected.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-2">Productos</p>
              <div className="space-y-1.5">
                {selected.map(so => (
                  <div key={so.soNumber} className="flex justify-between text-[11px] py-1.5 border-b border-white/[0.04]">
                    <span className="text-white/50 truncate flex-1">{so.modelo ?? so.soNumber}</span>
                    <span className="text-white font-medium shrink-0 ml-2">{so.qPi ?? '?'} un.</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={pending}
            className="mt-auto w-full py-2.5 rounded-xl text-[13px] font-semibold bg-[#E30613] text-white hover:bg-[#c00510] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            Crear Orden de Compra
          </button>
        </div>
      </div>
    </div>
  )
}
