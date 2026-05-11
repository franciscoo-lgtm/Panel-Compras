'use client'

import { useState, useTransition } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, Camera, RotateCcw, Save, ChevronDown, ChevronRight, Eye } from 'lucide-react'
import { analizarFotosExcel, guardarAsignaciones, getBoxesForAsn } from './actions'
import type { ExcelRow, BoxOption } from './actions'

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <img src={src} className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" onClick={e => e.stopPropagation()} alt="foto" />
    </div>
  )
}

// ─── Single row review card ───────────────────────────────────────────────────

// Box-level assignment: identifies the physical box by asn+caseNo
type Assignment = { asn: string; caseNo: string }

function boxKey(a: Assignment) { return `${a.asn}|${a.caseNo}` }

function RowCard({
  row,
  assignment,
  onAssign,
  boxes,
}: {
  row: ExcelRow
  assignment: Assignment | null
  onAssign: (asn: string, caseNo: string) => void
  boxes: BoxOption[]
}) {
  const [expanded, setExpanded] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const hasIssue = !!row.aiError
  const statusColor = assignment
    ? 'border-emerald-200 bg-emerald-50'
    : hasIssue
      ? 'border-orange-200 bg-orange-50'
      : 'border-zinc-200 bg-white'

  const selectedBox = assignment ? boxes.find(b => b.asn === assignment.asn && b.caseNo === assignment.caseNo) : null
  const dataUrl = (p: { base64: string; mediaType: string }) => `data:${p.mediaType};base64,${p.base64}`

  return (
    <>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}

      <div className={`rounded-xl border ${statusColor} overflow-hidden`}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => setExpanded(e => !e)}>
          {expanded ? <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />}

          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest w-12 shrink-0">
            Fila {row.rowIndex + 1}
          </span>

          {/* Photo strip */}
          <div className="flex gap-1 flex-1 overflow-hidden">
            {row.photos.slice(0, 6).map((p, i) => (
              <img key={i} src={dataUrl(p)}
                className="w-10 h-10 object-cover rounded border border-zinc-200 shrink-0"
                alt=""
                onClick={e => { e.stopPropagation(); setLightbox(dataUrl(p)) }}
              />
            ))}
            {row.photos.length > 6 && (
              <div className="w-10 h-10 rounded border border-zinc-200 bg-zinc-100 flex items-center justify-center text-[10px] font-semibold text-zinc-500 shrink-0">
                +{row.photos.length - 6}
              </div>
            )}
          </div>

          {/* AI read */}
          <div className="hidden md:flex flex-col gap-0.5 min-w-[180px] shrink-0">
            {row.aiAsn ? (
              <>
                <span className="text-[10px] font-mono text-zinc-600">{row.aiAsn}</span>
                <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[180px]">{row.aiCarton}</span>
              </>
            ) : (
              <span className="text-[10px] text-orange-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {row.aiError ?? 'Sin datos'}
              </span>
            )}
          </div>

          {/* Match status */}
          <div className="shrink-0 min-w-[220px]">
            {assignment ? (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-emerald-700 font-mono truncate">{assignment.caseNo}</p>
                  <p className="text-[10px] text-emerald-600 truncate">{selectedBox?.desc ?? ''}{selectedBox?.itemCount ? ` · ${selectedBox.itemCount} ítem${selectedBox.itemCount !== 1 ? 's' : ''}` : ''}</p>
                </div>
              </div>
            ) : (
              <span className="text-xs text-orange-500">Sin asignar</span>
            )}
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-zinc-100 px-4 py-4 space-y-4 bg-white">
            {/* All photos */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">
                Fotos del bulto ({row.photos.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {row.photos.map((p, i) => (
                  <img key={i} src={dataUrl(p)}
                    onClick={() => setLightbox(dataUrl(p))}
                    className="w-20 h-20 object-cover rounded-lg border border-zinc-200 cursor-zoom-in hover:opacity-80 transition-opacity"
                    alt={`foto ${i + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* AI read */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Lectura IA</p>
              {row.aiError ? (
                <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5" />{row.aiError}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[['ASN', row.aiAsn], ['Carton No', row.aiCarton], ['SO', row.aiSo]].map(([l, v]) => (
                    <div key={l} className="bg-zinc-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-zinc-400 uppercase">{l}</p>
                      <p className="font-mono text-zinc-700 mt-0.5">{v ?? '—'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Box assignment */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">
                Asignar bulto (las fotos se copian a todos los ítems de esa caja)
              </p>
              <select
                value={assignment ? boxKey(assignment) : ''}
                onChange={e => {
                  const [asn, caseNo] = e.target.value.split('|')
                  if (asn && caseNo) onAssign(asn, caseNo)
                  else onAssign('', '')
                }}
                className="w-full h-9 px-3 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              >
                <option value="">— Sin asignar —</option>
                {boxes.map(b => (
                  <option key={boxKey(b)} value={boxKey(b)}>
                    {b.asn} · {b.caseNo} · {b.desc.slice(0, 50)}{b.itemCount > 1 ? ` (${b.itemCount} ítems)` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function InspeccionClient() {
  const [file, setFile]               = useState<File | null>(null)
  const [rows, setRows]               = useState<ExcelRow[] | null>(null)
  const [boxes, setBoxes]             = useState<BoxOption[]>([])
  const [assignments, setAssignments] = useState<Map<number, Assignment>>(new Map())
  const [error, setError]             = useState<string | null>(null)
  const [savedCount, setSavedCount]   = useState<number | null>(null)
  const [analyzing, startAnalyze]     = useTransition()
  const [saving, startSave]           = useTransition()

  function handleFile(f: File) {
    setFile(f)
    setRows(null)
    setBoxes([])
    setAssignments(new Map())
    setError(null)
    setSavedCount(null)
  }

  function handleAnalyze() {
    if (!file) return
    setError(null)
    setSavedCount(null)
    startAnalyze(async () => {
      const fd = new FormData()
      fd.set('file', file)
      const res = await analizarFotosExcel(fd)
      if (!res.ok) { setError(res.error); return }

      setRows(res.rows)

      // pre-fill auto-matched assignments
      const map = new Map<number, Assignment>()
      for (const row of res.rows) {
        if (row.matchedAsn && row.matchedCaseNo) {
          map.set(row.rowIndex, { asn: row.matchedAsn, caseNo: row.matchedCaseNo })
        }
      }
      setAssignments(map)

      // load all boxes for any ASN found
      const asns = [...new Set(res.rows.map(r => r.aiAsn).filter(Boolean))] as string[]
      if (asns.length) {
        const fetched = await getBoxesForAsn(asns[0])
        setBoxes(fetched)
      }
    })
  }

  function assign(rowIndex: number, asn: string, caseNo: string) {
    setAssignments(prev => {
      const next = new Map(prev)
      if (asn && caseNo) next.set(rowIndex, { asn, caseNo })
      else next.delete(rowIndex)
      return next
    })
  }

  function handleSave() {
    if (!rows) return
    startSave(async () => {
      const payload = [...assignments.entries()].map(([rowIndex, a]) => ({
        asn: a.asn,
        caseNo: a.caseNo,
        photos: (rows.find(r => r.rowIndex === rowIndex)?.photos ?? []).map(p => ({
          rowIndex,
          colIndex: p.colIndex,
          base64: p.base64,
          mediaType: p.mediaType,
        })),
      }))
      const res = await guardarAsignaciones(payload)
      if (!res.ok) { setError(res.error); return }
      setSavedCount(res.count)
    })
  }

  const assignedCount   = assignments.size
  const unassignedCount = rows ? rows.length - assignedCount : 0
  const autoMatchCount  = rows ? rows.filter(r => r.matchedAsn && r.matchedCaseNo && !r.aiError).length : 0

  return (
    <div className="space-y-6">
        {/* Upload zone */}
        <div className="bg-white rounded-xl border border-zinc-100 shadow-sm p-6">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">Archivo Excel con fotos</p>

          <div
            className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed py-8 cursor-pointer transition-colors ${
              file ? 'border-zinc-300 bg-zinc-50' : 'border-zinc-200 hover:border-amber-300 hover:bg-amber-50/30'
            }`}
            onClick={() => document.getElementById('photo-excel-input')?.click()}
          >
            <Camera className="w-8 h-8 text-zinc-300" />
            {file ? (
              <div className="text-center">
                <p className="text-sm font-semibold text-zinc-700">{file.name}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-semibold text-zinc-600">Seleccioná el Excel con fotos de cajas</p>
                <p className="text-xs text-zinc-400 mt-1">Formato: JDS260425M0NX-JDS260429M2NV.xlsx</p>
              </div>
            )}
            <input
              id="photo-excel-input"
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
            />
          </div>

          {file && !analyzing && (
            <button
              onClick={handleAnalyze}
              className="mt-4 w-full h-11 rounded-xl bg-amber-400 hover:bg-amber-500 text-zinc-900 font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-sm"
            >
              <Eye className="w-4 h-4" />
              Analizar fotos con IA
            </button>
          )}

          {analyzing && (
            <div className="mt-4 flex flex-col items-center gap-2 py-4">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              <p className="text-sm text-zinc-500">Extrayendo imágenes y leyendo etiquetas…</p>
              <p className="text-xs text-zinc-400">Puede tardar 15–30 segundos</p>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}
        </div>

        {/* Results */}
        {rows && (
          <>
            {/* Summary bar */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-700">{rows.length} cajas detectadas</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {autoMatchCount} asignadas automáticamente
              </div>
              {unassignedCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-orange-500">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {unassignedCount} sin asignar — revisar manualmente
                </div>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => { setRows(null); setFile(null) }}
                  className="h-9 px-4 rounded-xl border border-zinc-200 text-xs font-medium text-zinc-500 hover:bg-zinc-50 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Nuevo
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || assignedCount === 0}
                  className="h-9 px-4 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:bg-zinc-100 disabled:text-zinc-400 text-zinc-900 font-semibold text-xs flex items-center gap-1.5 transition-all"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Guardar {assignedCount} asignaciones
                </button>
              </div>
            </div>

            {savedCount !== null && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700">
                <CheckCircle2 className="w-4 h-4" />
                {savedCount} fotos guardadas correctamente en la base de datos.
              </div>
            )}

            {/* Row cards */}
            <div className="space-y-3">
              {rows.map(row => (
                <RowCard
                  key={row.rowIndex}
                  row={row}
                  assignment={assignments.get(row.rowIndex) ?? null}
                  onAssign={(asn, caseNo) => assign(row.rowIndex, asn, caseNo)}
                  boxes={boxes}
                />
              ))}
            </div>
          </>
        )}
    </div>
  )
}
