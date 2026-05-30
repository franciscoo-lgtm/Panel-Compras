'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { guardarCIPL } from '@/app/lib/etl'
import { fetchSalesOrders } from '@/app/lib/sheets'
import type { ExtractedItem, DriveLinks, SOSuggestion, SOSuggestionResult } from '@/app/lib/etl'
import {
  FileSpreadsheet, FileText, Loader2,
  Save, AlertTriangle, Sparkles, ExternalLink, FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(v: number | null | undefined, d = 2) {
  if (v == null) return '—'
  return v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })
}

// ─── Step 2 — Assign SOs ──────────────────────────────────────────────────────

export function Step2AssignSOs({
  items, tipoCarga, categoryName, driveLinks, onBack, onSaved,
}: {
  items: ExtractedItem[]
  tipoCarga: 'Repuesto' | 'Mercaderia'
  categoryName: string
  driveLinks: DriveLinks
  onBack: () => void
  onSaved: (count: number, sos: string[]) => void
}) {
  const [sos,            setSos]            = useState<string[]>(() => Array(items.length).fill(''))
  const [sos2,           setSos2]           = useState<string[]>(() => Array(items.length).fill(''))
  const [soList,         setSoList]         = useState<string[]>([])
  const [suggestions,    setSuggestions]    = useState<SOSuggestion[]>([])
  const [suggesting,     setSuggesting]     = useState(false)
  const [suggestResult,  setSuggestResult]  = useState<{ ok: boolean; msg: string } | null>(null)
  const [error,          setError]          = useState<string | null>(null)
  const [autoAcceptHigh, setAutoAcceptHigh] = useState(false)
  const [pending,        start]             = useTransition()

  useEffect(() => {
    fetchSalesOrders()
      .then(list => setSoList([...new Set(list)]))
      .catch(() => {})
  }, [])

  async function handleSuggestSOs() {
    setSuggesting(true)
    setSuggestions([])
    setSuggestResult(null)
    try {
      const res: SOSuggestionResult = await fetch('/api/suggest-sos', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items }),
      }).then(r => r.json())

      setSuggestions(res.suggestions)
      setSos(prev => prev.map((v, i) => {
        if (v.trim()) return v
        const s = res.suggestions[i]
        if (!s) return ''
        if (autoAcceptHigh && s.confidence !== 'high') return ''
        return s.so
      }))
      if (res.error) {
        setSuggestResult({ ok: false, msg: res.error })
      } else {
        setSuggestResult({ ok: true, msg: `✨ ${res.soCount} SO${res.soCount !== 1 ? 's' : ''} sugerido${res.soCount !== 1 ? 's' : ''} y aplicado${res.soCount !== 1 ? 's' : ''}` })
      }
    } catch (err) {
      setSuggestResult({ ok: false, msg: `Error inesperado: ${String(err).slice(0, 80)}` })
    } finally {
      setSuggesting(false)
    }
  }

  const setSo  = (i: number, v: string) => setSos(p  => { const n=[...p]; n[i]=v; return n })
  const setSo2 = (i: number, v: string) => setSos2(p => { const n=[...p]; n[i]=v; return n })

  function handleSave() {
    setError(null)
    start(async () => {
      const fd = new FormData()
      fd.set('items',         JSON.stringify(items))
      fd.set('sosPrincipal',  JSON.stringify(sos))
      fd.set('sosSecundario', JSON.stringify(sos2))
      fd.set('driveLinks',    JSON.stringify(driveLinks))
      fd.set('categoryName',  categoryName)
      fd.set('tipoCarga',     tipoCarga)
      const res = await guardarCIPL(fd)
      if (!res.success) { setError(res.error); return }
      onSaved(res.count, sos)
    })
  }

  const isRep      = tipoCarga === 'Repuesto'
  const dgCount    = items.filter(i => i.isDangerousGood).length
  const driveCount = [driveLinks.excel, driveLinks.ci, driveLinks.pl].filter(Boolean).length

  function applySOToAll(value: string) {
    if (!value.trim()) return
    setSos(Array(items.length).fill(value))
  }

  const headers = isRep
    ? [['#','w-8'],['ASN','w-28'],['Date','w-20'],['PI No','w-24'],['Case No','w-32'],
       ['Code','w-28'],['Descripción',''],['Qty','w-12 text-right'],
       ['W','w-12 text-right'],['L','w-12 text-right'],['H','w-12 text-right'],
       ['CBM','w-16 text-right'],['GW (kg)','w-16 text-right'],
       ['DG','w-8 text-center'],['SO Principal','w-56'],['SO Secundario','w-52']]
    : [['#','w-8'],['ASN','w-28'],['Date','w-20'],['PI No','w-24'],['Q Bultos','w-16 text-right'],
       ['EAN','w-32'],['Descripción',''],['Qty','w-12 text-right'],
       ['W','w-12 text-right'],['L','w-12 text-right'],['H','w-12 text-right'],
       ['GW (kg)','w-16 text-right'],['CBM','w-16 text-right'],
       ['CBM/Bulto','w-16 text-right'],['Uni/Bulto','w-14 text-right'],
       ['DG','w-8 text-center'],['SO Principal','w-56'],['SO Secundario','w-52']]

  return (
    <div className="space-y-4">
      <datalist id="so-opts">
        {soList.map((s, i) => <option key={i} value={s} />)}
      </datalist>

      <div className="flex items-start justify-between">
        <div>
          <button type="button" onClick={onBack} disabled={pending}
            className="text-xs text-zinc-500 hover:text-zinc-300 mb-2 flex items-center gap-1 disabled:opacity-40">
            ← Volver
          </button>
          <h2 className="text-lg font-semibold text-white">
            Revisión — {items.length} ítem{items.length !== 1 ? 's' : ''} extraídos
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {categoryName} · {tipoCarga}
            {soList.length > 0 && <span className="ml-2">· {soList.length} SOs cargados</span>}
            {dgCount > 0 && <span className="ml-2 text-red-500">· ⚠ {dgCount} DG</span>}</p>
          {/* Drive links */}
          {driveCount > 0 && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <FolderOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="text-xs text-emerald-300 font-medium">Guardado en Drive:</span>
              {driveLinks.excel && (
                <a href={driveLinks.excel} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 transition-colors">
                  <FileSpreadsheet className="w-3 h-3" />Excel CIPL<ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
              {driveLinks.ci && (
                <a href={driveLinks.ci} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-200 text-blue-400 hover:bg-blue-500/10 transition-colors">
                  <FileText className="w-3 h-3" />CI<ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
              {driveLinks.pl && (
                <a href={driveLinks.pl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 transition-colors">
                  <FileText className="w-3 h-3" />PL<ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={handleSuggestSOs} disabled={suggesting || pending}
            className="h-10 px-4 rounded-xl bg-violet-50 hover:bg-violet-100 disabled:opacity-50 text-violet-700 font-semibold text-sm flex items-center gap-2 transition-all border border-violet-200">
            {suggesting
              ? <><Loader2 className="w-4 h-4 animate-spin" />Analizando con IA…</>
              : <><Sparkles className="w-4 h-4" />Sugerir SOs</>}
          </button>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer ml-3">
            <input
              type="checkbox"
              checked={autoAcceptHigh}
              onChange={e => setAutoAcceptHigh(e.target.checked)}
              className="rounded"
            />
            Solo aplicar sugerencias high confidence
          </label>
          <button type="button" onClick={handleSave} disabled={pending}
            className="h-10 px-5 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:bg-white/[0.06] disabled:text-zinc-500 text-zinc-900 font-semibold text-sm flex items-center gap-2 transition-all">
            {pending
              ? <><Loader2 className="w-4 h-4 animate-spin" />Guardando…</>
              : <><Save className="w-4 h-4" />Guardar todo</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}
        </div>
      )}

      {suggestResult && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${
          suggestResult.ok
            ? 'bg-violet-50 border border-violet-100 text-violet-700'
            : 'bg-red-500/10 border border-red-500/30 text-red-400'
        }`}>
          {suggestResult.ok ? <Sparkles className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {suggestResult.msg}
        </div>
      )}

      {/* Bulk SO apply */}
      <div className="flex items-center gap-2 bg-[#31AF4F]/10 border border-[#31AF4F]/30 rounded-xl px-4 py-2.5">
        <span className="text-xs font-semibold text-[#31AF4F] shrink-0">Aplicar SO a todos:</span>
        <input
          list="so-opts"
          placeholder="Escribí o seleccioná un SO para todas las filas…"
          className="flex-1 h-7 px-2 text-xs font-mono rounded-lg border border-[#31AF4F]/40 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-[#0d0d0d] placeholder:font-sans placeholder:text-zinc-600"
          onKeyDown={e => { if (e.key === 'Enter') { applySOToAll((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = '' } }}
          onBlur={e => { if (e.target.value) applySOToAll(e.target.value) }}
        />
        <span className="text-[10px] text-[#31AF4F]">↵ Enter para aplicar</span>
      </div>

      <div className="bg-[#0d0d0d] rounded-xl border border-white/[0.06] shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-xs border-collapse" style={{ minWidth: isRep ? '1200px' : '1500px' }}>
            <thead className="sticky top-0 z-10 bg-[#0a0a0a]">
              <tr className="border-b border-white/[0.06]">
                {headers.map(([lbl, cls]) => (
                  <th key={lbl}
                    className={`px-2 py-2.5 first:pl-4 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500 ${cls}`}>
                    {lbl}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors">
                  <td className="pl-4 pr-2 py-2 text-zinc-500 text-center">{i + 1}</td>
                  <td className="px-2 py-2 font-mono text-zinc-300">{item.asn ?? '—'}</td>
                  <td className="px-2 py-2 text-zinc-400">{item.date ?? '—'}</td>
                  <td className="px-2 py-2 font-mono text-zinc-300">{item.piNo ?? '—'}</td>

                  {isRep ? (
                    <td className="px-2 py-2 font-mono text-zinc-300">{item.caseNo ?? '—'}</td>
                  ) : (
                    <td className="px-2 py-2 text-right font-mono text-zinc-300">{item.qBultos ?? '—'}</td>
                  )}

                  <td className="px-2 py-2 font-mono text-zinc-300">{item.codeEan ?? '—'}</td>
                  <td className="px-2 py-2 max-w-[200px]">
                    <span className="line-clamp-2 text-zinc-200" title={item.description ?? ''}>
                      {item.description ?? '—'}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-zinc-300">{item.qty ?? '—'}</td>
                  <td className="px-2 py-2 text-right font-mono text-zinc-400">{num(item.w, 1)}</td>
                  <td className="px-2 py-2 text-right font-mono text-zinc-400">{num(item.l, 1)}</td>
                  <td className="px-2 py-2 text-right font-mono text-zinc-400">{num(item.h, 1)}</td>

                  {!isRep && (
                    <td className="px-2 py-2 text-right font-mono text-zinc-300">{num(item.gwKg, 2)}</td>
                  )}
                  <td className="px-2 py-2 text-right font-mono text-zinc-300">{num(item.cbm, 5)}</td>
                  {isRep && (
                    <td className="px-2 py-2 text-right font-mono text-zinc-300">{num(item.gwKg, 2)}</td>
                  )}

                  {!isRep && (
                    <>
                      <td className="px-2 py-2 text-right font-mono text-zinc-400">{num(item.cbmXBulto, 5)}</td>
                      <td className="px-2 py-2 text-right font-mono text-zinc-400">{num(item.uniXBulto, 2)}</td>
                    </>
                  )}

                  <td className="px-2 py-2 text-center">
                    {item.isDangerousGood
                      ? <span title="Dangerous Good" className="text-red-500">⚠</span>
                      : <span className="text-zinc-600">—</span>}
                  </td>

                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <input list="so-opts" value={sos[i]} onChange={e => setSo(i, e.target.value)}
                        placeholder="Buscar o escribir SO…"
                        className="w-full h-7 px-2 text-xs font-mono rounded-lg border border-white/[0.08] focus:outline-none focus:ring-1 focus:ring-amber-400 placeholder:font-sans placeholder:text-zinc-600 bg-[#0d0d0d] text-zinc-200" />
                      {suggestions[i]?.confidence && (
                        <span className={cn(
                          'ml-1 px-1 py-0.5 rounded text-[8px] font-bold uppercase shrink-0',
                          suggestions[i]!.confidence === 'high'   && 'bg-emerald-500/15 text-emerald-400',
                          suggestions[i]!.confidence === 'medium' && 'bg-amber-500/15 text-amber-400',
                          suggestions[i]!.confidence === 'low'    && 'bg-red-500/15 text-red-400',
                        )}>{suggestions[i]!.confidence}</span>
                      )}
                    </div>
                    {suggestions[i] && (
                      <p className="text-[9px] text-violet-500 mt-0.5 leading-tight">
                        ✨ {suggestions[i]!.reason}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input list="so-opts" value={sos2[i]} onChange={e => setSo2(i, e.target.value)}
                      placeholder="Secundario…"
                      className="w-full h-7 px-2 text-xs font-mono rounded-lg border border-white/[0.08] focus:outline-none focus:ring-1 focus:ring-amber-400 placeholder:font-sans placeholder:text-zinc-600 bg-[#0d0d0d] text-zinc-200" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
