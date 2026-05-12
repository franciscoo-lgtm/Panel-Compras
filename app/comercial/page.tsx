'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { extraerCIPL, guardarCIPL, sugerirSOsCIPL } from '@/app/lib/etl'
import type { ExtractedItem, DriveLinks, SOSuggestion, SOSuggestionResult } from '@/app/lib/etl'
import { fetchSalesOrders } from '@/app/lib/sheets'
import {
  Upload, FileSpreadsheet, FileText, Loader2, ChevronRight,
  Save, CheckCircle2, AlertTriangle, RotateCcw, Zap, Sparkles,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(v: number | null | undefined, d = 2) {
  if (v == null) return '—'
  return v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })
}

// ─── Step 1 — Upload form ─────────────────────────────────────────────────────

function Step1Upload({
  onDone,
}: {
  onDone: (items: ExtractedItem[], tipo: 'Repuesto' | 'Mercaderia', category: string, links: DriveLinks) => void
}) {
  const [tipo, setTipo]         = useState<'Repuesto' | 'Mercaderia'>('Repuesto')
  const [category, setCategory] = useState('')
  const [file, setFile]         = useState<File | null>(null)
  const [fileCi, setFileCi]     = useState<File | null>(null)
  const [filePl, setFilePl]     = useState<File | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [pending, start]        = useTransition()

  const ready = category.trim() && (tipo === 'Repuesto' ? !!file : (!!fileCi && !!filePl))

  function handleExtract() {
    if (!ready) return
    setError(null)
    start(async () => {
      const fd = new FormData()
      fd.set('tipoCarga', tipo)
      if (tipo === 'Repuesto' && file)     fd.set('file',    file)
      if (tipo === 'Mercaderia' && fileCi) fd.set('file_ci', fileCi)
      if (tipo === 'Mercaderia' && filePl) fd.set('file_pl', filePl)

      const res = await extraerCIPL(fd)
      if (!res.success) { setError(res.error); return }
      onDone(res.items, res.tipoCarga, category.trim(), res.driveLinks)
    })
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Tu nombre</label>
        <input
          value={category}
          onChange={e => setCategory(e.target.value)}
          placeholder="Ej: María García"
          className="w-full h-10 px-3 text-sm rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-zinc-300"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Tipo de carga</label>
        <div className="grid grid-cols-2 gap-3">
          {(['Repuesto', 'Mercaderia'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => { setTipo(t); setFile(null); setFileCi(null); setFilePl(null) }}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 py-4 text-sm font-semibold transition-all ${
                tipo === t
                  ? t === 'Repuesto'
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                    : 'border-red-400 bg-red-50 text-red-600'
                  : 'border-zinc-100 text-zinc-400 hover:border-zinc-200'
              }`}
            >
              {t === 'Repuesto'
                ? <FileSpreadsheet className="w-5 h-5" />
                : <FileText className="w-5 h-5" />}
              {t}
            </button>
          ))}
        </div>
      </div>

      {tipo === 'Repuesto' ? (
        <FileDropZone label="Excel CIPL" accept=".xlsx,.xls" file={file} onChange={setFile} hint="CommercialInvoice + PackingList" />
      ) : (
        <div className="space-y-3">
          <FileDropZone label="Commercial Invoice (CI)" accept=".pdf" file={fileCi} onChange={setFileCi} hint="PDF" />
          <FileDropZone label="Packing List (PL)"       accept=".pdf" file={filePl} onChange={setFilePl} hint="PDF" />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleExtract}
        disabled={!ready || pending}
        className="w-full h-12 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:bg-zinc-100 disabled:text-zinc-400 text-zinc-900 font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
      >
        {pending
          ? <><Loader2 className="w-4 h-4 animate-spin" />Extrayendo con IA…</>
          : <><Zap className="w-4 h-4" />Extraer datos</>}
      </button>

      {pending && (
        <p className="text-center text-xs text-zinc-400">
          La IA está leyendo el documento. Puede tardar 10–20 segundos.
        </p>
      )}
    </div>
  )
}

// ─── File drop zone ───────────────────────────────────────────────────────────

function FileDropZone({
  label, accept, file, onChange, hint,
}: {
  label: string; accept: string; file: File | null; onChange: (f: File) => void; hint?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">{label}</label>
      <div
        onClick={() => ref.current?.click()}
        className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed py-6 cursor-pointer transition-colors ${
          file ? 'border-zinc-300 bg-zinc-50' : 'border-zinc-200 hover:border-amber-300 hover:bg-amber-50/40'
        }`}
      >
        <Upload className="w-5 h-5 text-zinc-300" />
        {file
          ? <span className="text-xs font-medium text-zinc-600 px-4 text-center truncate max-w-full">{file.name}</span>
          : <span className="text-xs text-zinc-400">{hint ?? 'Clic para seleccionar'}</span>}
        <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => { if (e.target.files?.[0]) onChange(e.target.files[0]) }} />
      </div>
    </div>
  )
}

// ─── Step 2 — Preview table ───────────────────────────────────────────────────

function Step2Preview({
  items, tipoCarga, categoryName, driveLinks, onBack, onSaved,
}: {
  items: ExtractedItem[]
  tipoCarga: 'Repuesto' | 'Mercaderia'
  categoryName: string
  driveLinks: DriveLinks
  onBack: () => void
  onSaved: (count: number) => void
}) {
  const [sos,         setSos]         = useState<string[]>(() => Array(items.length).fill(''))
  const [sos2,        setSos2]        = useState<string[]>(() => Array(items.length).fill(''))
  const [soList,      setSoList]      = useState<string[]>([])
  const [suggestions,   setSuggestions]   = useState<SOSuggestion[]>([])
  const [suggesting,    setSuggesting]    = useState(false)
  const [suggestResult, setSuggestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [error,         setError]         = useState<string | null>(null)
  const [pending,       start]            = useTransition()

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
      const res: SOSuggestionResult = await sugerirSOsCIPL(items)
      setSuggestions(res.suggestions)
      // Pre-fill SO fields with suggestions (only where field is currently empty)
      setSos(prev => prev.map((v, i) => {
        if (v.trim()) return v                     // keep manual entry
        return res.suggestions[i]?.so ?? ''        // apply suggestion
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
      onSaved(res.count)
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
       ['DG','w-8 text-center'],['SO Principal','w-40'],['SO Secundario','w-36']]
    : [['#','w-8'],['ASN','w-28'],['Date','w-20'],['PI No','w-24'],['Q Bultos','w-16 text-right'],
       ['EAN','w-32'],['Descripción',''],['Qty','w-12 text-right'],
       ['W','w-12 text-right'],['L','w-12 text-right'],['H','w-12 text-right'],
       ['GW (kg)','w-16 text-right'],['CBM','w-16 text-right'],
       ['CBM/Bulto','w-16 text-right'],['Uni/Bulto','w-14 text-right'],
       ['DG','w-8 text-center'],['SO Principal','w-40'],['SO Secundario','w-36']]

  return (
    <div className="space-y-4">
      <datalist id="so-opts">
        {soList.map((s, i) => <option key={i} value={s} />)}
      </datalist>

      <div className="flex items-start justify-between">
        <div>
          <button type="button" onClick={onBack} disabled={pending}
            className="text-xs text-zinc-400 hover:text-zinc-600 mb-2 flex items-center gap-1 disabled:opacity-40">
            ← Volver
          </button>
          <h2 className="text-lg font-semibold text-zinc-900">
            Revisión — {items.length} ítem{items.length !== 1 ? 's' : ''} extraídos
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {categoryName} · {tipoCarga}
            {soList.length > 0 && <span className="ml-2">· {soList.length} SOs cargados</span>}
            {dgCount > 0 && <span className="ml-2 text-red-500">· ⚠ {dgCount} DG</span>}
            {driveCount > 0 && <span className="ml-2 text-emerald-600">· {driveCount} archivo{driveCount !== 1 ? 's' : ''} subido{driveCount !== 1 ? 's' : ''} a Drive</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={handleSuggestSOs} disabled={suggesting || pending}
            className="h-10 px-4 rounded-xl bg-violet-50 hover:bg-violet-100 disabled:opacity-50 text-violet-700 font-semibold text-sm flex items-center gap-2 transition-all border border-violet-200">
            {suggesting
              ? <><Loader2 className="w-4 h-4 animate-spin" />Analizando con IA…</>
              : <><Sparkles className="w-4 h-4" />Sugerir SOs</>}
          </button>
          <button type="button" onClick={handleSave} disabled={pending}
            className="h-10 px-5 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:bg-zinc-100 disabled:text-zinc-400 text-zinc-900 font-semibold text-sm flex items-center gap-2 transition-all">
            {pending
              ? <><Loader2 className="w-4 h-4 animate-spin" />Guardando…</>
              : <><Save className="w-4 h-4" />Guardar todo</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}
        </div>
      )}

      {suggestResult && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${
          suggestResult.ok
            ? 'bg-violet-50 border border-violet-100 text-violet-700'
            : 'bg-red-50 border border-red-100 text-red-600'
        }`}>
          {suggestResult.ok ? <Sparkles className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {suggestResult.msg}
        </div>
      )}

      {/* Bulk SO apply */}
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
        <span className="text-xs font-semibold text-amber-700 shrink-0">Aplicar SO a todos:</span>
        <input
          list="so-opts"
          placeholder="Escribí o seleccioná un SO para todas las filas…"
          className="flex-1 h-7 px-2 text-xs font-mono rounded-lg border border-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white placeholder:font-sans placeholder:text-zinc-300"
          onKeyDown={e => { if (e.key === 'Enter') { applySOToAll((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = '' } }}
          onBlur={e => { if (e.target.value) applySOToAll(e.target.value) }}
        />
        <span className="text-[10px] text-amber-500">↵ Enter para aplicar</span>
      </div>

      <div className="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-xs border-collapse" style={{ minWidth: isRep ? '1200px' : '1500px' }}>
            <thead className="sticky top-0 z-10 bg-zinc-50">
              <tr className="border-b border-zinc-100">
                {headers.map(([lbl, cls]) => (
                  <th key={lbl}
                    className={`px-2 py-2.5 first:pl-4 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400 ${cls}`}>
                    {lbl}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-zinc-50 hover:bg-zinc-50/60 transition-colors">
                  <td className="pl-4 pr-2 py-2 text-zinc-400 text-center">{i + 1}</td>
                  <td className="px-2 py-2 font-mono text-zinc-600">{item.asn ?? '—'}</td>
                  <td className="px-2 py-2 text-zinc-500">{item.date ?? '—'}</td>
                  <td className="px-2 py-2 font-mono text-zinc-600">{item.piNo ?? '—'}</td>

                  {isRep ? (
                    <td className="px-2 py-2 font-mono text-zinc-600">{item.caseNo ?? '—'}</td>
                  ) : (
                    <td className="px-2 py-2 text-right font-mono text-zinc-600">{item.qBultos ?? '—'}</td>
                  )}

                  <td className="px-2 py-2 font-mono text-zinc-600">{item.codeEan ?? '—'}</td>
                  <td className="px-2 py-2 max-w-[200px]">
                    <span className="line-clamp-2 text-zinc-700" title={item.description ?? ''}>
                      {item.description ?? '—'}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-zinc-600">{item.qty ?? '—'}</td>
                  <td className="px-2 py-2 text-right font-mono text-zinc-500">{num(item.w, 1)}</td>
                  <td className="px-2 py-2 text-right font-mono text-zinc-500">{num(item.l, 1)}</td>
                  <td className="px-2 py-2 text-right font-mono text-zinc-500">{num(item.h, 1)}</td>

                  {!isRep && (
                    <td className="px-2 py-2 text-right font-mono text-zinc-600">{num(item.gwKg, 2)}</td>
                  )}
                  <td className="px-2 py-2 text-right font-mono text-zinc-600">{num(item.cbm, 5)}</td>
                  {isRep && (
                    <td className="px-2 py-2 text-right font-mono text-zinc-600">{num(item.gwKg, 2)}</td>
                  )}

                  {!isRep && (
                    <>
                      <td className="px-2 py-2 text-right font-mono text-zinc-500">{num(item.cbmXBulto, 5)}</td>
                      <td className="px-2 py-2 text-right font-mono text-zinc-500">{num(item.uniXBulto, 2)}</td>
                    </>
                  )}

                  <td className="px-2 py-2 text-center">
                    {item.isDangerousGood
                      ? <span title="Dangerous Good" className="text-red-500">⚠</span>
                      : <span className="text-zinc-200">—</span>}
                  </td>

                  <td className="px-2 py-1.5">
                    <input list="so-opts" value={sos[i]} onChange={e => setSo(i, e.target.value)}
                      placeholder="Buscar o escribir SO…"
                      className="w-full h-7 px-2 text-xs font-mono rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-400 placeholder:font-sans placeholder:text-zinc-300" />
                    {suggestions[i] && (
                      <p className="text-[9px] text-violet-500 mt-0.5 leading-tight">
                        ✨ {suggestions[i]!.reason}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input list="so-opts" value={sos2[i]} onChange={e => setSo2(i, e.target.value)}
                      placeholder="Secundario…"
                      className="w-full h-7 px-2 text-xs font-mono rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-400 placeholder:font-sans placeholder:text-zinc-300" />
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

// ─── Step 3 — Done ────────────────────────────────────────────────────────────

function Step3Done({ count, onNew }: { count: number; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
      </div>
      <div>
        <p className="text-xl font-semibold text-zinc-900">
          {count} ítem{count !== 1 ? 's' : ''} guardado{count !== 1 ? 's' : ''}
        </p>
        <p className="text-sm text-zinc-400 mt-1">Ya están disponibles en el Panel General.</p>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="flex items-center gap-2 h-10 px-6 rounded-xl border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        <RotateCcw className="w-4 h-4" /> Cargar otro CIPL
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const EMPTY_LINKS: DriveLinks = { excel: null, ci: null, pl: null }

export default function ComercialPage() {
  const [step, setStep]           = useState<1 | 2 | 3>(1)
  const [items, setItems]         = useState<ExtractedItem[]>([])
  const [tipo, setTipo]           = useState<'Repuesto' | 'Mercaderia'>('Repuesto')
  const [category, setCategory]   = useState('')
  const [driveLinks, setDriveLinks] = useState<DriveLinks>(EMPTY_LINKS)
  const [saved, setSaved]         = useState(0)

  function handleExtracted(extracted: ExtractedItem[], t: 'Repuesto' | 'Mercaderia', cat: string, links: DriveLinks) {
    setItems(extracted)
    setTipo(t)
    setCategory(cat)
    setDriveLinks(links)
    setStep(2)
  }

  function handleSaved(count: number) {
    setSaved(count)
    setStep(3)
  }

  function handleReset() {
    setItems([])
    setDriveLinks(EMPTY_LINKS)
    setStep(1)
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Módulo</p>
        <h1 className="text-2xl font-semibold text-zinc-900">Carga Comercial</h1>
        <p className="text-sm text-zinc-400 mt-1">Extraé y guardá CIPLs de Repuestos o Mercadería DJI</p>
      </div>

      <div className="flex items-center gap-2 mb-8 text-xs">
        {([
          [1, 'Cargar archivo'],
          [2, 'Revisar y asignar SOs'],
          [3, 'Confirmado'],
        ] as const).map(([n, label], idx) => (
          <div key={n} className="flex items-center gap-2">
            {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-zinc-200" />}
            <span className={`flex items-center gap-1.5 font-medium ${
              step === n ? 'text-amber-600' : step > n ? 'text-zinc-400' : 'text-zinc-300'
            }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                step > n   ? 'bg-emerald-100 text-emerald-600' :
                step === n ? 'bg-amber-100 text-amber-600' : 'bg-zinc-100 text-zinc-400'
              }`}>{n}</span>
              {label}
            </span>
          </div>
        ))}
      </div>

      {step === 1 && <Step1Upload onDone={handleExtracted} />}
      {step === 2 && (
        <Step2Preview
          items={items}
          tipoCarga={tipo}
          categoryName={category}
          driveLinks={driveLinks}
          onBack={handleReset}
          onSaved={handleSaved}
        />
      )}
      {step === 3 && <Step3Done count={saved} onNew={handleReset} />}
    </div>
  )
}
