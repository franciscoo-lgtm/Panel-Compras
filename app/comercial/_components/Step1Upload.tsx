'use client'

import React, { useState, useTransition, useRef } from 'react'
import * as XLSX from 'xlsx'
import type { ExtractedItem, DriveLinks } from '@/app/lib/etl'
import {
  Upload, FileSpreadsheet, FileText, Loader2,
  AlertTriangle, Zap, RotateCcw,
} from 'lucide-react'

// ─── File drop zone ───────────────────────────────────────────────────────────

function FileDropZone({
  label, accept, file, onChange, hint,
}: {
  label: string; accept: string; file: File | null; onChange: (f: File) => void; hint?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">{label}</label>
      <div
        onClick={() => ref.current?.click()}
        className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed py-6 cursor-pointer transition-colors ${
          file ? 'border-white/[0.08] bg-[#0a0a0a]' : 'border-white/[0.08] hover:border-[#E30613]/40 hover:bg-[#E30613]/10'
        }`}
      >
        <Upload className="w-5 h-5 text-zinc-600" />
        {file
          ? <span className="text-xs font-medium text-zinc-300 px-4 text-center truncate max-w-full">{file.name}</span>
          : <span className="text-xs text-zinc-500">{hint ?? 'Clic para seleccionar'}</span>}
        <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => { if (e.target.files?.[0]) onChange(e.target.files[0]) }} />
      </div>
    </div>
  )
}

// ─── Step 1 — Upload form ─────────────────────────────────────────────────────

export function Step1Upload({
  onDone,
}: {
  onDone: (items: ExtractedItem[], tipo: 'Repuesto' | 'Mercaderia', category: string, links: DriveLinks) => void
}) {
  const [tipo, setTipo]         = useState<'Repuesto' | 'Mercaderia'>('Repuesto')
  const [category, setCategory] = useState('')
  const [file, setFile]         = useState<File | null>(null)
  const [fileCi, setFileCi]     = useState<File | null>(null)
  const [filePl, setFilePl]     = useState<File | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [driveError, setDriveError] = useState<string | null>(null)
  const [pending, start]            = useTransition()
  // Estado pendiente: cuando Drive falla pero la extracción salió OK, guardamos
  // los items aquí esperando que el user decida (reintentar o continuar sin Drive).
  const [pendingExtract, setPendingExtract] = useState<{
    items: ExtractedItem[]; tipo: 'Repuesto' | 'Mercaderia'; driveLinks: DriveLinks
  } | null>(null)

  const ready = category.trim() && (tipo === 'Repuesto' ? !!file : (!!fileCi && !!filePl))

  function handleExtract() {
    if (!ready) return
    setError(null)
    setDriveError(null)
    setPendingExtract(null)
    start(async () => {
      const fd = new FormData()
      fd.set('tipoCarga', tipo)

      // ── Repuesto: parse Excel in browser, send JSON (avoids edge FormData issues)
      if (tipo === 'Repuesto' && file) {
        let ciText = '(no CommercialInvoice sheet found)'
        let plText = '(no PackingList sheet found)'
        try {
          const buf = new Uint8Array(await file.arrayBuffer())
          const wb  = XLSX.read(buf, { type: 'array', cellDates: true })

          const findSheet = (patterns: RegExp[]) => {
            const name = wb.SheetNames.find(n => patterns.some(p => p.test(n)))
            return name ? wb.Sheets[name] : null
          }
          const sheetToText = (ws: XLSX.WorkSheet): string => {
            if (!ws['!ref']) return ''
            const range = XLSX.utils.decode_range(ws['!ref'])
            const rows: string[] = []
            for (let r = range.s.r; r <= range.e.r; r++) {
              const cells: string[] = []
              for (let c = range.s.c; c <= range.e.c; c++) {
                const cell = ws[XLSX.utils.encode_cell({ r, c })]
                cells.push(cell ? String(cell.v ?? '') : '')
              }
              const row = cells.join(' | ')
              if (row.replace(/[| ]/g, '').length) rows.push(row)
            }
            return rows.join('\n')
          }

          const ciSheet = findSheet([/commercial\s*invoice/i, /comercial/i, /invoice/i])
          const plSheet = findSheet([/packing\s*list/i, /p12/i, /packing/i])
          if (ciSheet) ciText = sheetToText(ciSheet).slice(0, 8000)
          if (plSheet) plText = sheetToText(plSheet).slice(0, 10000)
        } catch (e) {
          setError(`Error al leer el Excel: ${e instanceof Error ? e.message : String(e)}`)
          return
        }

        let extractRes: { success: boolean; items?: ExtractedItem[]; tipoCarga?: 'Repuesto' | 'Mercaderia'; error?: string }
        try {
          const res  = await fetch('/api/extract?tipo=Repuesto', {
            method:  'POST',
            headers: { 'content-type': 'application/json' },
            body:    JSON.stringify({ ciText, plText }),
          })
          const raw = await res.text()
          try { extractRes = JSON.parse(raw) }
          catch { setError(`Error del servidor (${res.status}): ${raw.slice(0, 300)}`); return }
        } catch (err) {
          setError(`Error de red: ${String(err)}`); return
        }
        if (!extractRes.success || !extractRes.items) {
          setError(extractRes.error ?? 'Error desconocido al extraer.')
          return
        }

        const firstItem = extractRes.items[0]
        const fd2 = new FormData()
        fd2.set('tipoCarga', 'Repuesto')
        fd2.set('piNo', firstItem?.piNo ?? '')
        fd2.set('asn',  firstItem?.asn  ?? '')
        fd2.set('date', firstItem?.date ?? '')
        fd2.set('file', file)
        console.log('[Step1] Iniciando upload a Drive (Repuesto):', { piNo: firstItem?.piNo, asn: firstItem?.asn, size: file.size })
        const driveRes = await fetch('/api/upload-drive', { method: 'POST', body: fd2 })
          .then(r => r.json()).catch((e: unknown) => ({ excel: null, ci: null, pl: null, uploadError: String(e) })) as DriveLinks & { uploadError?: string }
        console.log('[Step1] Respuesta de Drive:', driveRes)
        if (driveRes.uploadError) setDriveError(`Drive: ${driveRes.uploadError}`)
        if (!driveRes.excel && !driveRes.uploadError) setDriveError('Drive: el endpoint devolvió null sin error específico')
        const driveLinks: DriveLinks = { excel: driveRes.excel, ci: driveRes.ci, pl: driveRes.pl }
        console.log('[Step1] driveLinks finales:', driveLinks)

        // Si Drive falló, esperar decisión del user (NO avanzar solo)
        const driveOk = !!driveRes.excel
        if (!driveOk) {
          setPendingExtract({ items: extractRes.items, tipo: 'Repuesto', driveLinks })
          return
        }
        onDone(extractRes.items, 'Repuesto', category.trim(), driveLinks)
        return
      }

      // ── Mercadería: send PDFs as FormData
      if (tipo === 'Mercaderia' && fileCi) fd.set('file_ci', fileCi)
      if (tipo === 'Mercaderia' && filePl) fd.set('file_pl', filePl)

      let extractRes: { success: boolean; items?: ExtractedItem[]; tipoCarga?: 'Repuesto' | 'Mercaderia'; error?: string }
      try {
        const res  = await fetch('/api/extract?tipo=Mercaderia', { method: 'POST', body: fd })
        const raw  = await res.text()
        try { extractRes = JSON.parse(raw) }
        catch { setError(`Error del servidor (${res.status}): ${raw.slice(0, 300)}`); return }
      } catch (err) {
        setError(`Error de red: ${String(err)}`); return
      }
      if (!extractRes.success || !extractRes.items) {
        setError(extractRes.error ?? 'Error desconocido al extraer.')
        return
      }

      // Drive upload via edge route (25s limit, no Node.js deps)
      const firstItem = extractRes.items[0]
      const fd2 = new FormData()
      fd2.set('tipoCarga', tipo)
      fd2.set('piNo', firstItem?.piNo ?? '')
      fd2.set('asn',  firstItem?.asn  ?? '')
      fd2.set('date', firstItem?.date ?? '')
      if (tipo === 'Repuesto' && file)     fd2.set('file',    file)
      if (tipo === 'Mercaderia' && fileCi) fd2.set('file_ci', fileCi)
      if (tipo === 'Mercaderia' && filePl) fd2.set('file_pl', filePl)

      console.log('[Step1] Iniciando upload a Drive (Mercaderia):', { piNo: firstItem?.piNo, asn: firstItem?.asn })
      const driveRes2 = await fetch('/api/upload-drive', { method: 'POST', body: fd2 })
        .then(r => r.json()).catch((e: unknown) => ({ excel: null, ci: null, pl: null, uploadError: String(e) })) as DriveLinks & { uploadError?: string }
      console.log('[Step1] Respuesta de Drive (Mercaderia):', driveRes2)
      if (driveRes2.uploadError) setDriveError(`Drive: ${driveRes2.uploadError}`)
      if (!driveRes2.ci && !driveRes2.pl && !driveRes2.uploadError) setDriveError('Drive: el endpoint devolvió null sin error específico')
      const driveLinks: DriveLinks = { excel: driveRes2.excel, ci: driveRes2.ci, pl: driveRes2.pl }
      console.log('[Step1] driveLinks finales (Mercaderia):', driveLinks)

      // Si Drive falló, esperar decisión del user
      const driveOk = !!driveRes2.ci && !!driveRes2.pl
      if (!driveOk) {
        setPendingExtract({ items: extractRes.items, tipo: extractRes.tipoCarga ?? tipo, driveLinks })
        return
      }
      onDone(extractRes.items, extractRes.tipoCarga ?? tipo, category.trim(), driveLinks)
    })
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Tu nombre</label>
        <input
          value={category}
          onChange={e => setCategory(e.target.value)}
          placeholder="Ej: María García"
          className="w-full h-10 px-3 text-sm rounded-xl border border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-zinc-600 bg-[#0d0d0d] text-white"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Tipo de carga</label>
        <div className="grid grid-cols-2 gap-3">
          {(['Repuesto', 'Mercaderia'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => { setTipo(t); setFile(null); setFileCi(null); setFilePl(null) }}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 py-4 text-sm font-semibold transition-all ${
                tipo === t
                  ? t === 'Repuesto'
                    ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-400 bg-red-500/10 text-red-400'
                  : 'border-white/[0.06] text-zinc-500 hover:border-white/[0.08]'
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
        <FileDropZone label="Excel CIPL" accept=".xlsx,.xls" file={file} onChange={setFile} hint="Archivo .xlsx con CI + PL" />
      ) : (
        <div className="space-y-3">
          <FileDropZone label="Commercial Invoice (CI)" accept=".pdf" file={fileCi} onChange={setFileCi} hint="PDF" />
          <FileDropZone label="Packing List (PL)"       accept=".pdf" file={filePl} onChange={setFilePl} hint="PDF" />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {driveError && pendingExtract && (
        <div className="rounded-xl bg-[#E30613]/10 border-2 border-[#E30613]/40 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-[#E30613]" />
            <div className="text-sm text-[#E30613]">
              <p className="font-bold mb-1">❌ Drive falló — los archivos NO se subieron</p>
              <p className="text-[12px] text-zinc-300">{driveError}</p>
              <p className="text-[11px] text-zinc-400 mt-2">
                La extracción de los ítems sí funcionó. Podés reintentar subir a Drive o continuar
                sin Drive (los CIPL se cargan pero no quedan archivos backed up).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExtract}
              disabled={pending}
              className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-[#E30613] hover:bg-[#E30613]/85 text-white inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reintentar Drive
            </button>
            <button
              type="button"
              onClick={() => {
                if (!pendingExtract) return
                console.log('[Step1] User eligió continuar SIN Drive')
                onDone(pendingExtract.items, pendingExtract.tipo, category.trim(), pendingExtract.driveLinks)
                setPendingExtract(null)
              }}
              className="px-3 py-1.5 rounded-md text-[12px] font-medium border border-white/[0.15] hover:bg-white/[0.06] text-zinc-300"
            >
              Continuar sin Drive →
            </button>
          </div>
        </div>
      )}

      {driveError && !pendingExtract && (
        <div className="flex items-start gap-2 rounded-xl bg-[#E30613]/10 border border-[#E30613]/40 px-4 py-3 text-sm text-[#E30613]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span><strong>Error al subir a Drive:</strong> {driveError}</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleExtract}
        disabled={!ready || pending}
        className="w-full h-12 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:bg-white/[0.06] disabled:text-zinc-500 text-zinc-900 font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
      >
        {pending
          ? <><Loader2 className="w-4 h-4 animate-spin" />Extrayendo con IA…</>
          : <><Zap className="w-4 h-4" />Extraer datos</>}
      </button>

      {pending && (
        <p className="text-center text-xs text-zinc-500">
          La IA está leyendo el documento. Puede tardar 10–20 segundos.
        </p>
      )}
    </div>
  )
}
