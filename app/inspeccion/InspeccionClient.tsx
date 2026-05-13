'use client'

import { useState, useTransition, useCallback } from 'react'
import { unzipSync } from 'fflate'
import {
  Loader2, CheckCircle2, AlertTriangle, Camera, RotateCcw, Save,
  ChevronDown, ChevronRight, Search, FileText, ShieldCheck, ShieldAlert, ShieldQuestion,
} from 'lucide-react'
import {
  matchLabelsToDB, guardarUnaAsignacion, getBoxesForAsn,
  getPLItemsForInspection,
} from './actions'
import type { ExcelRow, BoxOption, PLItemForInspection } from './actions'

// ─── Client-side xlsx image extraction ───────────────────────────────────────

type PhotoEntry = { colIndex: number; base64: string; mediaType: string }

type LabelResult = {
  rowIndex:    number
  photoCount:  number
  asn:         string | null
  cartonNo:    string | null
  caseNo:      string | null
  soNo:        string | null
  confidence:  'high' | 'medium' | 'low' | null
  note:        string | null
  error:       string | null
}

function uint8ToBase64(buf: Uint8Array): string {
  const CHUNK = 0x8000
  let str = ''
  for (let i = 0; i < buf.length; i += CHUNK)
    str += String.fromCharCode(...buf.subarray(i, i + CHUNK))
  return btoa(str)
}

function detectMediaType(buf: Uint8Array): string {
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif'
  return 'image/jpeg'
}

function extractImagesFromXlsx(buf: Uint8Array): Map<number, PhotoEntry[]> {
  const files = unzipSync(buf)
  const drawingXml = new TextDecoder().decode(files['xl/drawings/drawing1.xml'] ?? new Uint8Array())
  const relsXml    = new TextDecoder().decode(files['xl/drawings/_rels/drawing1.xml.rels'] ?? new Uint8Array())

  const ridToFile: Record<string, string> = {}
  const rRe = /Id="(rId\d+)"[^>]*Target="\.\.\/media\/(image\d+\.\w+)"/g
  let rm: RegExpExecArray | null
  while ((rm = rRe.exec(relsXml)) !== null) ridToFile[rm[1]] = rm[2]

  const byRow = new Map<number, PhotoEntry[]>()
  const anchorRe = /<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g
  let am: RegExpExecArray | null
  while ((am = anchorRe.exec(drawingXml)) !== null) {
    const block   = am[0]
    const fromRow = parseInt((block.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/) || [])[1] ?? '0')
    const fromCol = parseInt((block.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/) || [])[1] ?? '0')
    const rid     = (block.match(/r:embed="(rId\d+)"/) || [])[1]
    if (!rid) continue
    const imgFile = ridToFile[rid]
    if (!imgFile) continue
    const imgBuf = files[`xl/media/${imgFile}`]
    if (!imgBuf) continue
    const base64    = uint8ToBase64(imgBuf)
    const mediaType = detectMediaType(imgBuf)
    if (!byRow.has(fromRow)) byRow.set(fromRow, [])
    byRow.get(fromRow)!.push({ colIndex: fromCol, base64, mediaType })
  }

  for (const [, photos] of byRow) photos.sort((a, b) => a.colIndex - b.colIndex)
  return byRow
}

// Auto-detect ASN from Excel filename (e.g. "JDS260429M2NV-foo.xlsx" → "JDS260429M2NV")
function extractAsnFromFilename(name: string): string | null {
  const m = name.match(/([A-Z]{3}\d{6}[A-Z0-9]{4})/g)
  return m?.[0] ?? null
}

// ─── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' | null }) {
  if (!level) return null
  const cfg = {
    high:   { icon: ShieldCheck,    cls: 'text-emerald-600 bg-emerald-50 border-emerald-100', label: 'Alta'  },
    medium: { icon: ShieldQuestion, cls: 'text-amber-600   bg-amber-50   border-amber-100',   label: 'Media' },
    low:    { icon: ShieldAlert,    cls: 'text-red-600     bg-red-50     border-red-100',      label: 'Baja'  },
  }[level]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold ${cfg.cls}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  )
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <img src={src} className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" onClick={e => e.stopPropagation()} alt="foto" />
    </div>
  )
}

// ─── Row card ─────────────────────────────────────────────────────────────────

type Assignment = { asn: string; caseNo: string }
function boxKey(a: Assignment) { return `${a.asn}|${a.caseNo}` }

function RowCard({
  row, photos, assignment, onAssign, boxes,
}: {
  row:        ExcelRow
  photos:     PhotoEntry[]
  assignment: Assignment | null
  onAssign:   (asn: string, caseNo: string) => void
  boxes:      BoxOption[]
}) {
  const [expanded, setExpanded] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const hasIssue    = !!row.aiError || row.aiConfidence === 'low'
  const statusColor = assignment
    ? row.aiConfidence === 'low'
      ? 'border-amber-200 bg-amber-50'
      : 'border-emerald-200 bg-emerald-50'
    : hasIssue
      ? 'border-orange-200 bg-orange-50'
      : 'border-zinc-200 bg-white'

  const selectedBox = assignment
    ? boxes.find(b => b.asn === assignment.asn && b.caseNo === assignment.caseNo)
    : null

  const dataUrl = (p: PhotoEntry) => `data:${p.mediaType};base64,${p.base64}`

  return (
    <>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}

      <div className={`rounded-xl border ${statusColor} overflow-hidden`}>
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded
            ? <ChevronDown  className="w-4 h-4 text-zinc-400 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />}

          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest w-12 shrink-0">
            Caja {row.rowIndex + 1}
          </span>

          {/* Thumbnail strip */}
          <div className="flex gap-1 flex-1 overflow-hidden">
            {photos.slice(0, 4).map((p, i) => (
              <img key={i} src={dataUrl(p)}
                className="w-10 h-10 object-cover rounded border border-zinc-200 shrink-0"
                alt="" onClick={e => { e.stopPropagation(); setLightbox(dataUrl(p)) }} />
            ))}
            {photos.length > 4 && (
              <div className="w-10 h-10 rounded border border-zinc-200 bg-zinc-100 flex items-center justify-center text-[10px] font-semibold text-zinc-500 shrink-0">
                +{photos.length - 4}
              </div>
            )}
          </div>

          {/* Claude result */}
          <div className="hidden md:flex flex-col gap-1 min-w-[200px] shrink-0">
            {row.aiError ? (
              <span className="text-[10px] text-orange-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {row.aiError}
              </span>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <ConfidenceBadge level={row.aiConfidence} />
                  <span className="font-mono text-[10px] text-zinc-600 truncate max-w-[160px]">
                    {row.aiCaseNo ?? row.aiCarton ?? row.aiAsn ?? '—'}
                  </span>
                </div>
                {row.aiNote && (
                  <span className="text-[10px] text-zinc-400 italic truncate max-w-[200px]">{row.aiNote}</span>
                )}
              </>
            )}
          </div>

          {/* Match status */}
          <div className="shrink-0 min-w-[220px]">
            {assignment ? (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-emerald-700 font-mono truncate">{assignment.caseNo}</p>
                  <p className="text-[10px] text-emerald-600 truncate">
                    {selectedBox?.desc ?? ''}
                    {selectedBox?.itemCount ? ` · ${selectedBox.itemCount} ítem${selectedBox.itemCount !== 1 ? 's' : ''}` : ''}
                  </p>
                </div>
              </div>
            ) : (
              <span className="text-xs text-orange-500">Sin asignar</span>
            )}
          </div>
        </div>

        {/* Expanded */}
        {expanded && (
          <div className="border-t border-zinc-100 px-4 py-4 space-y-4 bg-white">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Fotos ({photos.length})</p>
              <div className="flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <img key={i} src={dataUrl(p)}
                    onClick={() => setLightbox(dataUrl(p))}
                    className="w-20 h-20 object-cover rounded-lg border border-zinc-200 cursor-zoom-in hover:opacity-80 transition-opacity"
                    alt={`foto ${i + 1}`} />
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Lectura IA</p>
              {row.aiError ? (
                <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5" />{row.aiError}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {row.aiCaseNo ? (
                      <div className="bg-emerald-50 rounded-lg px-3 py-2 col-span-2">
                        <p className="text-[10px] text-emerald-600 uppercase">Caja identificada (PL)</p>
                        <p className="font-mono text-emerald-800 mt-0.5">{row.aiCaseNo}</p>
                      </div>
                    ) : (
                      [['ASN', row.aiAsn], ['Caja No', row.aiCarton], ['SO', row.aiSo]].map(([l, v]) => (
                        <div key={l} className="bg-zinc-50 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-zinc-400 uppercase">{l}</p>
                          <p className="font-mono text-zinc-700 mt-0.5">{v ?? '—'}</p>
                        </div>
                      ))
                    )}
                  </div>
                  {row.aiNote && (
                    <div className="flex items-start gap-2 bg-zinc-50 rounded-lg px-3 py-2">
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold shrink-0 mt-0.5">Observación</span>
                      <span className="text-[11px] text-zinc-600 italic">{row.aiNote}</span>
                    </div>
                  )}
                  {row.aiConfidence && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-400">Confianza:</span>
                      <ConfidenceBadge level={row.aiConfidence} />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Asignar bulto</p>
              <select
                value={assignment ? boxKey(assignment) : ''}
                onChange={e => {
                  const [asn, caseNo] = e.target.value.split('|')
                  onAssign(asn && caseNo ? asn : '', caseNo ?? '')
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
  const [extracting, setExtracting]   = useState(false)
  const [photosByRow, setPhotosByRow] = useState<Map<number, PhotoEntry[]>>(new Map())
  const [rows, setRows]               = useState<ExcelRow[] | null>(null)
  const [boxes, setBoxes]             = useState<BoxOption[]>([])
  const [assignments, setAssignments] = useState<Map<number, Assignment>>(new Map())
  const [error, setError]             = useState<string | null>(null)
  const [savedCount, setSavedCount]   = useState<number | null>(null)
  const [saveProgress, setSaveProgress] = useState<string | null>(null)

  // PL context
  const [asnInput, setAsnInput]   = useState('')
  const [plItems, setPlItems]     = useState<PLItemForInspection[] | null>(null)
  const [loadingPL, setLoadingPL] = useState(false)
  const [plError, setPlError]     = useState<string | null>(null)

  const [analyzing, startAnalyze] = useTransition()
  const [saving,    startSave]    = useTransition()

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setRows(null)
    setBoxes([])
    setAssignments(new Map())
    setError(null)
    setSavedCount(null)
    setSaveProgress(null)
    setPhotosByRow(new Map())
    setPlItems(null)
    setPlError(null)

    // Auto-detect ASN from filename
    const detectedAsn = extractAsnFromFilename(f.name)
    if (detectedAsn) setAsnInput(detectedAsn)

    if (f.size > 50 * 1024 * 1024) { setError('El archivo es demasiado grande (máx. 50MB).'); return }

    setExtracting(true)
    try {
      const buf   = new Uint8Array(await f.arrayBuffer())
      const byRow = extractImagesFromXlsx(buf)
      setPhotosByRow(byRow)
    } catch (e) {
      setError(`Error al leer el Excel: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExtracting(false)
    }
  }, [])

  async function handleLoadPL() {
    const asn = asnInput.trim()
    if (!asn) return
    setLoadingPL(true)
    setPlError(null)
    setPlItems(null)
    try {
      const items = await getPLItemsForInspection(asn)
      if (!items.length) {
        setPlError(`No se encontraron ítems para ASN "${asn}" en el Panel General.`)
      } else {
        setPlItems(items)
      }
    } catch (e) {
      setPlError(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoadingPL(false)
    }
  }

  function handleAnalyze() {
    if (!photosByRow.size) return
    setError(null)
    setSavedCount(null)
    startAnalyze(async () => {
      try {
        const rowIndices = [...photosByRow.keys()].sort((a, b) => a - b)
        const firstPhotos = rowIndices.map(ri => {
          const photos = photosByRow.get(ri)!
          return { rowIndex: ri, base64: photos[0].base64, mediaType: photos[0].mediaType, photoCount: photos.length }
        })

        // Build request — include PL context when available
        const body: { firstPhotos: typeof firstPhotos; plItems?: PLItemForInspection[] } = { firstPhotos }
        if (plItems?.length) body.plItems = plItems

        const labelRes = await fetch('/api/inspeccion/analizar', {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify(body),
        })
        if (!labelRes.ok) { setError(`Error ${labelRes.status} al llamar a Claude`); return }
        const labelData: { ok: boolean; labels?: LabelResult[]; error?: string } = await labelRes.json()
        if (!labelData.ok || !labelData.labels) { setError(labelData.error ?? 'Error desconocido'); return }

        const matchRes = await matchLabelsToDB(labelData.labels)
        if (!matchRes.ok) { setError(matchRes.error); return }

        setRows(matchRes.rows)

        const map = new Map<number, Assignment>()
        for (const row of matchRes.rows) {
          if (row.matchedAsn && row.matchedCaseNo) {
            map.set(row.rowIndex, { asn: row.matchedAsn, caseNo: row.matchedCaseNo })
          }
        }
        setAssignments(map)

        const asns = [...new Set(matchRes.rows.map(r => r.aiAsn).filter(Boolean))] as string[]
        const asnForBoxes = asnInput.trim() || asns[0]
        if (asnForBoxes) {
          const fetched = await getBoxesForAsn(asnForBoxes)
          setBoxes(fetched)
        }
      } catch (err) {
        setError(`Error al analizar: ${err instanceof Error ? err.message : String(err)}`)
      }
    })
  }

  function handleSave() {
    if (!rows) return
    startSave(async () => {
      try {
        let totalCount = 0
        const entries = [...assignments.entries()]
        for (let i = 0; i < entries.length; i++) {
          const [rowIndex, { asn, caseNo }] = entries[i]
          setSaveProgress(`Guardando ${i + 1}/${entries.length}…`)
          const photos = (photosByRow.get(rowIndex) ?? []).map(p => ({
            rowIndex,
            colIndex: p.colIndex,
            dataUrl:  `data:${p.mediaType};base64,${p.base64}`,
          }))
          const res = await guardarUnaAsignacion(asn, caseNo, photos)
          if (!res.ok) { setError(res.error); setSaveProgress(null); return }
          totalCount += res.count
        }
        setSaveProgress(null)
        setSavedCount(totalCount)
      } catch (err) {
        setSaveProgress(null)
        setError(`Error al guardar: ${err instanceof Error ? err.message : String(err)}`)
      }
    })
  }

  const assignedCount   = assignments.size
  const unassignedCount = rows ? rows.length - assignedCount : 0
  const autoMatchCount  = rows ? rows.filter(r => r.matchedAsn && r.matchedCaseNo && !r.aiError).length : 0
  const highConfCount   = rows ? rows.filter(r => r.aiConfidence === 'high').length : 0
  const rowIndices      = [...photosByRow.keys()].sort((a, b) => a - b)
  const ready           = photosByRow.size > 0 && !extracting

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
              <p className="text-xs text-zinc-400 mt-0.5">
                {(file.size / 1024 / 1024).toFixed(1)} MB
                {ready && <span className="ml-2 text-emerald-600">· {rowIndices.length} cajas extraídas</span>}
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm font-semibold text-zinc-600">Seleccioná el Excel con fotos de cajas</p>
              <p className="text-xs text-zinc-400 mt-1">El ASN se detecta automáticamente del nombre del archivo</p>
            </div>
          )}
          <input id="photo-excel-input" type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
        </div>

        {extracting && (
          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            Extrayendo imágenes del Excel…
          </div>
        )}

        {/* ASN + PL loader */}
        {ready && !rows && (
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">
                ASN del envío
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-300 pointer-events-none" />
                  <input
                    value={asnInput}
                    onChange={e => { setAsnInput(e.target.value); setPlItems(null); setPlError(null) }}
                    onKeyDown={e => e.key === 'Enter' && handleLoadPL()}
                    placeholder="e.g. JDS260429M2NV"
                    className="w-full h-9 pl-8 pr-3 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-zinc-300 font-mono"
                  />
                </div>
                <button
                  onClick={handleLoadPL}
                  disabled={!asnInput.trim() || loadingPL}
                  className="h-9 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  {loadingPL ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  Cargar PL
                </button>
              </div>

              {plError && (
                <p className="mt-2 text-xs text-orange-500 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{plError}
                </p>
              )}

              {plItems && (
                <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  PL cargado: <span className="font-semibold">{plItems.length} líneas</span>
                  <span className="text-zinc-400">— Claude comparará cada foto contra estas {plItems.length} cajas</span>
                </div>
              )}
            </div>

            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className={`w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-sm ${
                plItems
                  ? 'bg-amber-400 hover:bg-amber-500 disabled:opacity-60 text-zinc-900'
                  : 'bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-white'
              }`}
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              {analyzing
                ? 'Analizando fotos…'
                : plItems
                  ? `Inspeccionar ${rowIndices.length} cajas contra PL (${plItems.length} líneas)`
                  : `Analizar ${rowIndices.length} fotos (solo lectura de etiquetas)`}
            </button>
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
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm font-semibold text-zinc-700">{rows.length} cajas procesadas</span>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" />{autoMatchCount} asignadas automáticamente
            </div>
            {highConfCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-500">
                <ShieldCheck className="w-3.5 h-3.5" />{highConfCount} confianza alta
              </div>
            )}
            {unassignedCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-orange-500">
                <AlertTriangle className="w-3.5 h-3.5" />{unassignedCount} sin asignar
              </div>
            )}
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => { setRows(null); setFile(null); setPhotosByRow(new Map()); setPlItems(null) }}
                className="h-9 px-4 rounded-xl border border-zinc-200 text-xs font-medium text-zinc-500 hover:bg-zinc-50 flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Nuevo
              </button>
              <button
                onClick={handleSave}
                disabled={saving || assignedCount === 0}
                className="h-9 px-4 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:bg-zinc-100 disabled:text-zinc-400 text-zinc-900 font-semibold text-xs flex items-center gap-1.5 transition-all"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saveProgress ?? `Guardar ${assignedCount} asignaciones`}
              </button>
            </div>
          </div>

          {savedCount !== null && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              {savedCount} fotos guardadas correctamente.
            </div>
          )}

          <div className="space-y-3">
            {rows.map(row => (
              <RowCard
                key={row.rowIndex}
                row={row}
                photos={photosByRow.get(row.rowIndex) ?? []}
                assignment={assignments.get(row.rowIndex) ?? null}
                onAssign={(asn, caseNo) => setAssignments(prev => {
                  const next = new Map(prev)
                  if (asn && caseNo) next.set(row.rowIndex, { asn, caseNo })
                  else next.delete(row.rowIndex)
                  return next
                })}
                boxes={boxes}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
