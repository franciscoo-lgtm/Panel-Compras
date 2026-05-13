'use client'

import { useState, useTransition, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import { FileSpreadsheet, FileText, AlertTriangle, Pencil, Trash2, X, Save, Loader2, CheckCircle2, ExternalLink, Search, Download, CheckSquare, Camera, Sparkles, Plus, Trash, FileDown, Layers, ChevronDown, ChevronUp } from 'lucide-react'
import * as XLSX from 'xlsx'
import { updateCIPLItem, deleteCIPLItem, getItemPhotos, suggestSOForItem, addPhotosToBox, deletePhoto, exportCiplAction } from './actions'
import { fetchSalesOrders } from '@/app/lib/sheets'
import type { LiveDataMap, ExtraColumn } from '@/app/lib/comex-sources'

// ─── Column visibility constants ──────────────────────────────────────────────

const ALL_COLS = [
  'tipo','cargado','category','asn','date',
  'piNo','cajaBultos','ean','descripcion','qty',
  'plSO','qGso','dif',
  'wxlxh','gwKg','cbm','cbmBulto','uniBulto','dg',
  'soPrincipal','soSecundario','drive','fotos','incoterm','puertoSalida',
  'etd','eta','etaCaldas','awb','arriboWh','paletizado',
] as const

type ColKey = typeof ALL_COLS[number]

const COL_LABELS: Record<ColKey, string> = {
  tipo: 'Tipo', cargado: 'Cargado', category: 'Category', asn: 'ASN', date: 'Date',
  piNo: 'PI No', cajaBultos: 'Caja / Bultos', ean: 'EAN / Code', descripcion: 'Descripción', qty: 'Qty',
  plSO: '∑ PL/SO', qGso: 'Q GSO', dif: 'Dif',
  wxlxh: 'W×L×H (cm)', gwKg: 'GW kg', cbm: 'CBM', cbmBulto: 'CBM/Bulto', uniBulto: 'Uni/Bulto', dg: 'DG',
  soPrincipal: 'SO Principal', soSecundario: 'SO Secund.', drive: 'Drive', fotos: 'Fotos',
  incoterm: 'Incoterm', puertoSalida: 'Puerto Salida',
  etd: 'ETD', eta: 'ETA', etaCaldas: 'ETA Caldas', awb: 'AWB', arriboWh: 'Arribo WH', paletizado: 'Paletizado',
}

type ColGroup = {
  label: string
  textColor: string      // Tailwind text color class
  accentColor: string    // hex for checkbox accent-color
  borderClass: string    // border-l class for first cell of group in body
  cols: ColKey[]
}

const GROUPS: ColGroup[] = [
  { label: 'Identificación', textColor: 'text-amber-500', accentColor: '#f59e0b', borderClass: '', cols: ['tipo','cargado','category','asn','date'] },
  { label: 'Producto',       textColor: 'text-amber-500', accentColor: '#f59e0b', borderClass: 'border-l-2 border-l-amber-100', cols: ['piNo','cajaBultos','ean','descripcion','qty'] },
  { label: 'PL vs GSO',     textColor: 'text-blue-500',  accentColor: '#3b82f6', borderClass: 'border-l-2 border-l-blue-100', cols: ['plSO','qGso','dif'] },
  { label: 'Dimensiones',   textColor: 'text-zinc-500',  accentColor: '#71717a', borderClass: 'border-l-2 border-l-zinc-200', cols: ['wxlxh','gwKg','cbm','cbmBulto','uniBulto','dg'] },
  { label: 'Comercial',     textColor: 'text-violet-500',accentColor: '#8b5cf6', borderClass: 'border-l-2 border-l-violet-100', cols: ['soPrincipal','soSecundario','drive','fotos','incoterm','puertoSalida'] },
  { label: 'Comex / Tracking', textColor: 'text-cyan-500', accentColor: '#06b6d4', borderClass: 'border-l-2 border-l-cyan-100', cols: ['etd','eta','etaCaldas','awb','arriboWh','paletizado'] },
]

const PRESET_ESENCIALES: ColKey[] = [
  'tipo','cargado','category','asn','date',
  'piNo','cajaBultos','ean','descripcion','qty',
  'plSO','qGso','dif',
  'wxlxh','gwKg','cbm',
  'soPrincipal','soSecundario','drive','fotos',
]
const PRESET_DIMENSIONES: ColKey[] = [...PRESET_ESENCIALES, 'cbmBulto','uniBulto']
const PRESET_COMEX: ColKey[]       = [...PRESET_ESENCIALES, 'etd','eta','etaCaldas','awb','arriboWh','paletizado']

/** Count visible columns in a group */
function groupSpan(group: ColGroup, vis: Set<ColKey>): number {
  return group.cols.filter(c => vis.has(c)).length
}

/** Returns the border class for the first currently-visible column of a group, or '' for others */
function firstVisibleBorder(group: ColGroup, col: ColKey, vis: Set<ColKey>): string {
  const first = group.cols.find(c => vis.has(c))
  return first === col ? group.borderClass : ''
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Item = {
  id: string; createdAt: Date; tipoCarga: string; categoryName: string | null
  asn: string | null; date: Date | null; piNo: string | null; caseNo: string | null
  qBultos: number | null; qty: number | null; codeEan: string | null; description: string | null
  w: number | null; l: number | null; h: number | null; cbm: number | null
  gwKg: number | null; cbmXBulto: number | null; uniXBulto: number | null
  isDangerousGood: boolean; soPrincipal: string | null; soSecundario: string | null
  photoCount: number
  linkMsds: string | null; sku: string | null; pa: string | null; modelo: string | null
  qPi: number | null; diferenciaPiPl: number | null; incoterm: string | null
  puertoSalida: string | null; fobUnit: number | null; fobTotal: number | null
  avisoAgente: string | null; avisoConfirmacion: string | null; arriboWh: Date | null
  fotosAgente: string | null; paletizado: string | null; fechaInstruccion: Date | null
  confirmacionOk: string | null; etd: Date | null; eta: Date | null
  etaCaldas: Date | null; awb: string | null
  driveLinkExcel: string | null; driveLinkCi: string | null; driveLinkPl: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d: Date | null | undefined) => {
  if (!d) return '—'
  const dt = new Date(d)
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = dt.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
}

const fmtNum = (n: number | null | undefined, dec = 2) =>
  n == null ? '—' : n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const isoDate = (d: Date | null | undefined) =>
  d ? new Date(d).toISOString().split('T')[0] : ''

// ─── SO expansion (dual-SO → 2 display rows) ─────────────────────────────────

type DisplayRow = Item & {
  _displaySO: string | null
  _isSplit: boolean
  _isPrimary: boolean
}

// Builds rowspan data for dim cells (W×L×H, GW, CBM, CBM/Bulto).
// Groups contiguous rows by PHYSICAL BOX identity:
//   - When caseNo is set (Repuestos): group by asn + caseNo (each physical carton)
//   - When caseNo is null (Mercadería): each item is its own group (no rowspan across items)
// dimsForKey: first rowKey of a group → the row with the best (non-null) dims in that group
function buildDimGroups(rows: DisplayRow[]): {
  spanMap:    Map<string, number>
  skipSet:    Set<string>
  dimsForKey: Map<string, DisplayRow>
} {
  const spanMap    = new Map<string, number>()
  const skipSet    = new Set<string>()
  const dimsForKey = new Map<string, DisplayRow>()
  let i = 0
  while (i < rows.length) {
    const row      = rows[i]
    // caseNo present → group items in the same physical carton
    // caseNo absent  → use unique id so each item is its own group (no cross-item span)
    const boxKey   = row.caseNo?.trim()
      ? `${row.asn ?? ''}|${row.caseNo}`
      : row.id
    const firstKey = `${row.id}-${row._isPrimary ? 'p' : 's'}`
    let span = 1
    let bestDimRow: DisplayRow = row
    while (i + span < rows.length) {
      const next = rows[i + span]
      const nk   = next.caseNo?.trim()
        ? `${next.asn ?? ''}|${next.caseNo}`
        : next.id
      if (nk !== boxKey) break
      skipSet.add(`${next.id}-${next._isPrimary ? 'p' : 's'}`)
      if (bestDimRow.w == null && next.w != null) bestDimRow = next
      span++
    }
    spanMap.set(firstKey, span)
    dimsForKey.set(firstKey, bestDimRow)
    i += span
  }
  return { spanMap, skipSet, dimsForKey }
}

function expandToDisplayRows(items: Item[]): DisplayRow[] {
  const rows: DisplayRow[] = []
  for (const item of items) {
    if (item.soPrincipal && item.soSecundario) {
      rows.push({ ...item, _displaySO: item.soPrincipal,  _isSplit: true,  _isPrimary: true  })
      rows.push({ ...item, _displaySO: item.soSecundario, _isSplit: true,  _isPrimary: false })
    } else {
      rows.push({ ...item, _displaySO: item.soPrincipal, _isSplit: false, _isPrimary: true  })
    }
  }
  return rows
}

// ─── Live data helpers ────────────────────────────────────────────────────────

// Returns live value for a field keyed by the row's active SO
function getLive(so: string | null | undefined, fieldKey: string, liveData: LiveDataMap): string | null {
  const soKey = so?.trim().toUpperCase()
  if (!soKey) return null
  return liveData[soKey]?.[fieldKey] ?? null
}

// ─── Column selector popover ──────────────────────────────────────────────────

function ColumnSelectorPopover({
  visibleCols,
  onChange,
}: {
  visibleCols: Set<ColKey>
  onChange: (next: Set<ColKey>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const hiddenCount = ALL_COLS.filter(c => !visibleCols.has(c)).length

  const toggle = (col: ColKey) => {
    const next = new Set(visibleCols)
    next.has(col) ? next.delete(col) : next.add(col)
    onChange(next)
  }

  const applyPreset = (cols: readonly ColKey[] | ColKey[]) =>
    onChange(new Set(cols))

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        ⊞ Columnas
        {hiddenCount > 0 && (
          <span className="bg-amber-400 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {hiddenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 bg-white border border-zinc-200 rounded-xl shadow-2xl p-4 z-50 w-[480px]">
          {/* Preset buttons */}
          <div className="flex gap-2 mb-3">
            {([
              { label: 'Esenciales',  cols: PRESET_ESENCIALES },
              { label: 'Todos',       cols: ALL_COLS },
              { label: 'Dimensiones', cols: PRESET_DIMENSIONES },
              { label: 'Comex',       cols: PRESET_COMEX },
            ] as const).map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.cols)}
                className="px-3 py-1 rounded-lg text-[10px] font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Groups */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-0.5">
            {GROUPS.map(group => (
              <Fragment key={group.label}>
                <div
                  key={`label-${group.label}`}
                  className={`col-span-2 text-[9px] font-bold uppercase tracking-wider mt-3 mb-1 ${group.textColor}`}
                >
                  {group.label}
                </div>
                {group.cols.map(col => (
                  <label
                    key={col}
                    className="flex items-center gap-2 text-[11px] text-zinc-700 cursor-pointer select-none py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={visibleCols.has(col)}
                      onChange={() => toggle(col)}
                      style={{ accentColor: group.accentColor }}
                      className="w-3.5 h-3.5 shrink-0"
                    />
                    {COL_LABELS[col]}
                  </label>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Photo modal ─────────────────────────────────────────────────────────────

type PhotoEntry = { id: string; dataUrl: string; rowIndex: number; colIndex: number }

function PhotoModal({
  item,
  onClose,
  onCountChange,
}: {
  item: Item
  onClose: () => void
  onCountChange: (id: string, delta: number) => void
}) {
  const [photos, setPhotos]   = useState<PhotoEntry[] | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getItemPhotos(item.id).then(p => setPhotos(p as PhotoEntry[]))
  }, [item.id])

  async function handleFiles(files: FileList) {
    if (!files.length) return
    setUploading(true)
    try {
      const dataUrls = await Promise.all(
        Array.from(files).map(
          f => new Promise<string>((resolve, reject) => {
            const r = new FileReader()
            r.onload = () => resolve(r.result as string)
            r.onerror = reject
            r.readAsDataURL(f)
          })
        )
      )
      const res = await addPhotosToBox(item.asn, item.caseNo, item.id, dataUrls)
      if (res.ok) {
        // Reload photos for this item
        const updated = await getItemPhotos(item.id)
        setPhotos(updated as PhotoEntry[])
        onCountChange(item.id, dataUrls.length)
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(photoId: string) {
    const res = await deletePhoto(photoId)
    if (res.ok) {
      setPhotos(prev => prev?.filter(p => p.id !== photoId) ?? null)
      onCountChange(item.id, -1)
    }
  }

  const label = item.caseNo ? `Caja ${item.caseNo}` : item.description?.slice(0, 30) ?? item.id

  return (
    <>
      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" onClick={e => e.stopPropagation()} alt="foto" />
        </div>
      )}
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-amber-500" />
              <div>
                <span className="font-semibold text-sm text-zinc-800">Fotos de inspección</span>
                <span className="ml-2 text-xs text-zinc-400">{label}</span>
              </div>
              {photos && <span className="text-xs text-zinc-400 ml-1">· {photos.length} foto{photos.length !== 1 ? 's' : ''}</span>}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-zinc-900 text-xs font-semibold transition-colors"
              >
                {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Agregar fotos
              </button>
              <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-100 text-zinc-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {!photos ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
              </div>
            ) : photos.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Camera className="w-8 h-8 text-zinc-200" />
                <p className="text-zinc-400 text-sm">Sin fotos asignadas</p>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold transition-colors"
                >
                  <Plus className="w-3 h-3" /> Agregar fotos
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {photos.map(p => (
                  <div key={p.id} className="relative group">
                    <img
                      src={p.dataUrl}
                      onClick={() => setLightbox(p.dataUrl)}
                      className="w-full aspect-square object-cover rounded-xl border border-zinc-100 cursor-zoom-in hover:opacity-80 transition-opacity"
                      alt={`foto ${p.colIndex + 1}`}
                    />
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 text-white hidden group-hover:flex items-center justify-center shadow-md transition-all"
                      title="Eliminar foto"
                    >
                      <Trash className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Edit Drawer ──────────────────────────────────────────────────────────────

function EditDrawer({
  item, soList, onClose, onSaved,
}: {
  item: Item; soList: string[]; onClose: () => void; onSaved: (id: string, fields: Record<string, string>) => void
}) {
  const [fields, setFields] = useState<Record<string, string>>({
    categoryName:     item.categoryName     ?? '',
    soPrincipal:      item.soPrincipal      ?? '',
    soSecundario:     item.soSecundario     ?? '',
    linkMsds:         item.linkMsds         ?? '',
    avisoAgente:      item.avisoAgente      ?? '',
    avisoConfirmacion:item.avisoConfirmacion?? '',
    arriboWh:         isoDate(item.arriboWh),
    fotosAgente:      item.fotosAgente      ?? '',
    paletizado:       item.paletizado       ?? '',
    fechaInstruccion: isoDate(item.fechaInstruccion),
    confirmacionOk:   item.confirmacionOk   ?? '',
    etd:              isoDate(item.etd),
    eta:              isoDate(item.eta),
    etaCaldas:        isoDate(item.etaCaldas),
    awb:              item.awb              ?? '',
  })
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState<{ so: string; reason: string } | null>(null)
  const [suggestFailed, setSuggestFailed] = useState(false)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFields(p => ({ ...p, [k]: e.target.value }))

  function handleSave() {
    setSaved(false)
    start(async () => {
      const res = await updateCIPLItem(item.id, fields)
      if (res.ok) { setSaved(true); onSaved(item.id, fields) }
    })
  }

  async function handleSuggestSO() {
    setSuggesting(true)
    setSuggestion(null)
    setSuggestFailed(false)
    try {
      const result = await suggestSOForItem(item.id)
      if (result) {
        setSuggestion(result)
      } else {
        setSuggestFailed(true)
      }
    } catch {
      setSuggestFailed(true)
    } finally {
      setSuggesting(false)
    }
  }

  const datalist = soList.map((s, i) => <option key={i} value={s} />)

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <div>
            <p className="text-xs text-zinc-400">{item.tipoCarga} · {item.categoryName ?? '—'}</p>
            <p className="text-sm font-semibold text-zinc-900 mt-0.5 font-mono truncate max-w-[280px]">
              {item.description ?? item.caseNo ?? item.id}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-100 text-zinc-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Drive links */}
          {(item.driveLinkExcel || item.driveLinkCi || item.driveLinkPl) && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Archivos Drive</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Excel', href: item.driveLinkExcel },
                  { label: 'CI',    href: item.driveLinkCi },
                  { label: 'PL',    href: item.driveLinkPl },
                ].filter(l => l.href).map(({ label, href }) => (
                  <a key={label} href={href!} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition-colors">
                    <ExternalLink className="w-3 h-3" />
                    {label}
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Comercial */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Comercial</p>
              <button
                onClick={handleSuggestSO}
                disabled={suggesting}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-violet-50 hover:bg-violet-100 disabled:opacity-50 text-violet-700 text-[10px] font-bold transition-colors"
              >
                {suggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Sugerir SO
              </button>
            </div>

            {suggestion && (
              <div className="mb-3 p-3 rounded-xl border border-violet-200 bg-violet-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-[10px] text-violet-400 uppercase tracking-wide font-bold mb-1">Sugerencia IA</p>
                    <p className="font-mono text-sm font-bold text-violet-800">{suggestion.so}</p>
                    <p className="text-[11px] text-violet-600 mt-1">{suggestion.reason}</p>
                  </div>
                  <button
                    onClick={() => { setFields(p => ({ ...p, soPrincipal: suggestion.so })); setSuggestion(null) }}
                    className="shrink-0 h-7 px-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold transition-colors"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            )}

            {suggestFailed && (
              <p className="text-[10px] text-red-400 mb-3">No se pudo obtener sugerencia. Intentá de nuevo.</p>
            )}

            <datalist id="so-drawer">{datalist}</datalist>
            <div className="space-y-3">
              <Field label="Cargado por">
                <input value={fields.categoryName} onChange={set('categoryName')} className="input-base" placeholder="Nombre del operador" />
              </Field>
              <Field label="SO Principal">
                <input list="so-drawer" value={fields.soPrincipal} onChange={set('soPrincipal')} className="input-base" placeholder="Buscar o escribir SO…" />
              </Field>
              <Field label="SO Secundario">
                <input list="so-drawer" value={fields.soSecundario} onChange={set('soSecundario')} className="input-base" placeholder="Opcional" />
              </Field>
              <Field label="Link MSDS">
                <input value={fields.linkMsds} onChange={set('linkMsds')} className="input-base" placeholder="https://drive.google.com/…" type="url" />
              </Field>
            </div>
          </section>

          {/* GSO V4 read-only */}
          {(item.sku || item.pa || item.modelo) && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-3">GSO V4</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ['SKU', item.sku], ['PA', item.pa], ['Modelo', item.modelo],
                  ['Q PI', item.qPi], ['Incoterm', item.incoterm],
                  ['Puerto', item.puertoSalida],
                  ['FOB Unit', item.fobUnit != null ? fmtNum(item.fobUnit) : null],
                  ['FOB Total', item.fobTotal != null ? fmtNum(item.fobTotal) : null],
                ].map(([lbl, val]) => (
                  <div key={String(lbl)} className="bg-zinc-50 rounded-lg px-2.5 py-2">
                    <p className="text-[10px] text-zinc-400 uppercase tracking-wide">{lbl}</p>
                    <p className="font-mono text-zinc-700 mt-0.5">{val ?? '—'}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Comex */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 mb-3">Comex Tracking</p>
            <div className="space-y-3">
              <Field label="Aviso Agente"><input value={fields.avisoAgente} onChange={set('avisoAgente')} className="input-base" /></Field>
              <Field label="Confirmación Agente"><input value={fields.avisoConfirmacion} onChange={set('avisoConfirmacion')} className="input-base" /></Field>
              <Field label="Arribo WH Airsea"><input type="date" value={fields.arriboWh} onChange={set('arriboWh')} className="input-base" /></Field>
              <Field label="Fotos Agente"><input value={fields.fotosAgente} onChange={set('fotosAgente')} className="input-base" /></Field>
              <Field label="Paletizado"><input value={fields.paletizado} onChange={set('paletizado')} className="input-base" /></Field>
              <Field label="Fecha Instrucción"><input type="date" value={fields.fechaInstruccion} onChange={set('fechaInstruccion')} className="input-base" /></Field>
              <Field label="Confirmación OK"><input value={fields.confirmacionOk} onChange={set('confirmacionOk')} className="input-base" /></Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="ETD"><input type="date" value={fields.etd} onChange={set('etd')} className="input-base" /></Field>
                <Field label="ETA"><input type="date" value={fields.eta} onChange={set('eta')} className="input-base" /></Field>
                <Field label="ETA Caldas"><input type="date" value={fields.etaCaldas} onChange={set('etaCaldas')} className="input-base" /></Field>
              </div>
              <Field label="AWB"><input value={fields.awb} onChange={set('awb')} className="input-base font-mono" /></Field>
            </div>
          </section>
        </div>

        <div className="border-t border-zinc-100 px-5 py-4 flex items-center gap-3">
          {saved && <span className="flex items-center gap-1.5 text-xs text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" />Guardado</span>}
          <button onClick={handleSave} disabled={pending}
            className="ml-auto h-9 px-5 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-zinc-900 font-semibold text-sm flex items-center gap-2">
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar
          </button>
        </div>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide block mb-1">{label}</label>
      {children}
    </div>
  )
}

// ─── Search ───────────────────────────────────────────────────────────────────

function matchesSearch(item: Item, q: string): boolean {
  if (!q) return true
  const lq = q.toLowerCase()
  return [
    item.description, item.codeEan, item.soPrincipal, item.soSecundario,
    item.piNo, item.asn, item.caseNo, item.categoryName,
  ].some(v => v?.toLowerCase().includes(lq))
}

function exportXLSX(rows: DisplayRow[], extraColumns: ExtraColumn[], liveData: LiveDataMap) {
  const isoD = (d: Date | null | undefined) =>
    d ? new Date(d).toISOString().split('T')[0] : ''

  const data = rows.map(i => ({
    'Tipo':         i.tipoCarga,
    'Cargado por':  i.categoryName ?? '',
    'ASN':          i.asn ?? '',
    'Date':         isoD(i.date),
    'PI No':        i.piNo ?? '',
    'Case / Bultos': i.tipoCarga === 'Repuesto' ? (i.caseNo ?? '') : (i.qBultos ?? ''),
    'EAN / Code':   i.codeEan ?? '',
    'Descripción':  i.description ?? '',
    'Qty':          i.qty ?? '',
    'W (cm)':       i.w ?? '',
    'L (cm)':       i.l ?? '',
    'H (cm)':       i.h ?? '',
    'GW (kg)':      i.gwKg ?? '',
    'CBM':          i.cbm ?? '',
    'CBM/Bulto':    i.cbmXBulto ?? '',
    'Uni/Bulto':    i.uniXBulto ?? '',
    'DG':           i.isDangerousGood ? 'SI' : '',
    'SO Principal': i.soPrincipal ?? '',
    'SO Secundario':i.soSecundario ?? '',
    ...Object.fromEntries(
      extraColumns.map(c => [c.label, getLive(i._displaySO, c.fieldKey, liveData) ?? ''])
    ),
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Panel General')
  XLSX.writeFile(wb, `panel-general-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PanelGeneralClient({
  initialItems,
  liveData,
  extraColumns,
}: {
  initialItems: Item[]
  liveData: LiveDataMap
  extraColumns: ExtraColumn[]
}) {
  const [items, setItems]       = useState<Item[]>(initialItems)
  const [tab, setTab]           = useState<'all' | 'Repuesto' | 'Mercaderia'>('all')
  const [search, setSearch]     = useState('')
  const [editing, setEditing]   = useState<Item | null>(null)
  const [soList, setSoList]     = useState<string[]>([])
  const [selected, setSelected]           = useState<Set<string>>(new Set())
  const [viewingPhotosFor, setViewingPhotosFor] = useState<Item | null>(null)
  const [deleting, startDelete]           = useTransition()
  const [exportingCipl, setExportingCipl] = useState(false)
  const [groupByAsn, setGroupByAsn]       = useState(false)
  const [expandedAsns, setExpandedAsns]   = useState<Set<string>>(new Set())

  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    try {
      const saved = localStorage.getItem('panel-visible-cols')
      if (saved) return new Set(JSON.parse(saved) as ColKey[])
    } catch {}
    return new Set(PRESET_ESENCIALES)
  })

  const applyVisibleCols = useCallback((next: Set<ColKey>) => {
    setVisibleCols(next)
    try { localStorage.setItem('panel-visible-cols', JSON.stringify([...next])) } catch {}
  }, [])

  const vis = visibleCols  // short alias used throughout JSX

  useEffect(() => {
    fetchSalesOrders().then(list => setSoList([...new Set(list)])).catch(() => {})
  }, [])

  const byTab = tab === 'all' ? items : items.filter(i => i.tipoCarga === tab)
  const filteredItems = byTab.filter(i => matchesSearch(i, search))
  const filtered = expandToDisplayRows(filteredItems)

  // unique item IDs in current filtered view (no duplicates from split rows)
  const filteredIds = [...new Set(filteredItems.map(i => i.id))]
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id))

  const gl = (item: DisplayRow, key: string) => getLive(item._displaySO, key, liveData)
  const { spanMap, skipSet, dimsForKey } = buildDimGroups(filtered)

  const asnGroups = useMemo(() => {
    const map = new Map<string, Item[]>()
    for (const item of filteredItems) {
      const key = item.asn ?? '(sin ASN)'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return [...map.entries()].map(([asn, grp]) => {
      const sos = [...new Set(grp.flatMap(i => [i.soPrincipal, i.soSecundario]).filter(Boolean) as string[])]
      const totalQty  = grp.reduce((s, i) => s + (i.qty  ?? 0), 0)
      const totalCbm  = grp.reduce((s, i) => s + (i.cbm  ?? 0), 0)
      const totalGw   = grp.reduce((s, i) => s + (i.gwKg ?? 0), 0)
      const totalBultos = grp.reduce((s, i) => s + (i.qBultos ?? 0), 0)
      const tipo = grp[0]?.tipoCarga ?? ''
      const categories = [...new Set(grp.map(i => i.categoryName).filter(Boolean) as string[])]
      return { asn, items: grp, sos, totalQty, totalCbm, totalGw, totalBultos, tipo, categories }
    })
  }, [filteredItems])

  // Sum of all qty for each SO (used for PL vs GSO comparison)
  const soQtyMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const item of items) {
      if (item.soPrincipal && item.qty != null)
        m.set(item.soPrincipal, (m.get(item.soPrincipal) ?? 0) + item.qty)
      if (item.soSecundario && item.soSecundario !== item.soPrincipal && item.qty != null)
        m.set(item.soSecundario, (m.get(item.soSecundario) ?? 0) + item.qty)
    }
    return m
  }, [items])

  const toggleSelect = (id: string) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelected(prev => { const s = new Set(prev); filteredIds.forEach(id => s.delete(id)); return s })
    } else {
      setSelected(prev => new Set([...prev, ...filteredIds]))
    }
  }

  const handleDelete = useCallback((id: string) => {
    if (!confirm('¿Borrar este ítem? Esta acción no se puede deshacer.')) return
    deleteCIPLItem(id).then(res => {
      if (res.ok) { setItems(prev => prev.filter(i => i.id !== id)); setSelected(prev => { const s = new Set(prev); s.delete(id); return s }) }
    })
  }, [])

  const handleBulkDelete = () => {
    const ids = [...selected]
    if (!ids.length) return
    if (!confirm(`¿Borrar ${ids.length} ítem${ids.length !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return
    startDelete(async () => {
      await Promise.all(ids.map(id => deleteCIPLItem(id)))
      setItems(prev => prev.filter(i => !ids.includes(i.id)))
      setSelected(new Set())
    })
  }

  const handleExportCipl = async () => {
    const ids = [...selected]
    if (!ids.length) return
    setExportingCipl(true)
    try {
      const res = await exportCiplAction(ids)
      if (!res.ok) { alert(`Error exportando CIPL: ${res.error}`); return }
      const a = document.createElement('a')
      a.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.base64}`
      a.download = res.filename
      a.click()
    } finally {
      setExportingCipl(false)
    }
  }

  const handleSaved = useCallback((id: string, fields: Record<string, string>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const next = { ...item, ...fields }
      for (const k of ['arriboWh', 'fechaInstruccion', 'etd', 'eta', 'etaCaldas'] as const) {
        (next as Record<string, unknown>)[k] = fields[k] ? new Date(fields[k]) : null
      }
      return next as Item
    }))
    setEditing(prev => prev?.id === id ? ({ ...prev, ...fields } as Item) : prev)
  }, [])

  const handlePhotoCountChange = useCallback((id: string, delta: number) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, photoCount: Math.max(0, item.photoCount + delta) } : item
    ))
  }, [])

  // rows to export: selected items (deduped) or all filtered
  const exportRows = selected.size > 0
    ? filtered.filter((r, _, arr) => selected.has(r.id) && (r._isPrimary || !arr.find(x => x.id === r.id && x._isPrimary)))
    : filtered

  const tabs = [
    { key: 'all',        label: `Todos (${items.length})` },
    { key: 'Repuesto',   label: `Repuestos (${items.filter(i => i.tipoCarga === 'Repuesto').length})` },
    { key: 'Mercaderia', label: `Mercadería (${items.filter(i => i.tipoCarga === 'Mercaderia').length})` },
  ] as const

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-zinc-100 rounded-xl p-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === t.key ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-300 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por ASN, SO, descripción, PI No…"
            className="w-full h-9 pl-8 pr-3 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-zinc-300"
          />
        </div>

        {search && (
          <span className="text-xs text-zinc-400">{filteredItems.length} resultado{filteredItems.length !== 1 ? 's' : ''}</span>
        )}

        {/* Selection action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto bg-zinc-900 text-white rounded-xl px-3 py-1.5">
            <CheckSquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-xs font-semibold">{selected.size} seleccionado{selected.size !== 1 ? 's' : ''}</span>
            <button
              onClick={() => exportXLSX(exportRows, extraColumns, liveData)}
              className="flex items-center gap-1 h-7 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold transition-colors">
              <Download className="w-3 h-3" />
              Excel
            </button>
            <button
              onClick={handleExportCipl}
              disabled={exportingCipl}
              className="flex items-center gap-1 h-7 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-xs font-semibold transition-colors">
              {exportingCipl ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
              CIPL ({selected.size})
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={deleting}
              className="flex items-center gap-1 h-7 px-3 rounded-lg bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white text-xs font-semibold transition-colors">
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Borrar
            </button>
            <button onClick={() => setSelected(new Set())} className="ml-1 text-zinc-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className={`${selected.size > 0 ? '' : 'ml-auto'} flex items-center gap-2`}>
          <button
            onClick={() => setGroupByAsn(v => !v)}
            title={groupByAsn ? 'Vista normal' : 'Agrupar por ASN'}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-medium transition-colors ${
              groupByAsn
                ? 'border-amber-400 bg-amber-50 text-amber-700'
                : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            {groupByAsn ? 'Por ASN' : 'Agrupar ASN'}
          </button>
          <ColumnSelectorPopover visibleCols={visibleCols} onChange={applyVisibleCols} />
          <button
            onClick={() => exportXLSX(exportRows, extraColumns, liveData)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {selected.size > 0 ? `Exportar ${selected.size} sel.` : 'Exportar Excel'}
          </button>
        </div>
      </div>

      {/* ASN Grouped View */}
      {groupByAsn && (
        <div className="space-y-2">
          {asnGroups.map(({ asn, items: grpItems, sos, totalQty, totalCbm, totalGw, totalBultos, tipo, categories }) => {
            const exp = expandedAsns.has(asn)
            const isRep = tipo === 'Repuesto'
            return (
              <div key={asn} className="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-zinc-50/60 transition-colors"
                  onClick={() => setExpandedAsns(prev => { const s = new Set(prev); s.has(asn) ? s.delete(asn) : s.add(asn); return s })}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-zinc-800">{asn}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${isRep ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{tipo}</span>
                      <span className="text-[11px] text-zinc-400">{grpItems.length} ítem{grpItems.length !== 1 ? 's' : ''}</span>
                      {categories.length > 0 && <span className="text-[11px] text-zinc-400">{categories.join(', ')}</span>}
                    </div>
                    {sos.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {sos.map(so => (
                          <span key={so} className="font-mono text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{so}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-6 shrink-0 text-xs text-zinc-600">
                    {totalQty   > 0 && <div className="text-right"><div className="text-[9px] text-zinc-400 uppercase tracking-widest">Qty</div><div className="font-semibold">{totalQty.toLocaleString('es-AR')}</div></div>}
                    {totalBultos > 0 && <div className="text-right"><div className="text-[9px] text-zinc-400 uppercase tracking-widest">Bultos</div><div className="font-semibold">{totalBultos.toLocaleString('es-AR')}</div></div>}
                    {totalCbm   > 0 && <div className="text-right"><div className="text-[9px] text-zinc-400 uppercase tracking-widest">CBM</div><div className="font-semibold">{totalCbm.toLocaleString('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</div></div>}
                    {totalGw    > 0 && <div className="text-right"><div className="text-[9px] text-zinc-400 uppercase tracking-widest">GW kg</div><div className="font-semibold">{totalGw.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div></div>}
                  </div>
                  <div className="text-zinc-400 shrink-0">
                    {exp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
                {exp && (
                  <div className="border-t border-zinc-50 divide-y divide-zinc-50">
                    {grpItems.map(item => (
                      <div key={item.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-zinc-50/60 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-zinc-600">{item.piNo ?? item.caseNo ?? item.id.slice(0, 8)}</span>
                            {item.soPrincipal && <span className="font-mono text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{item.soPrincipal}</span>}
                          </div>
                          {item.description && <p className="text-[11px] text-zinc-500 truncate mt-0.5">{item.description}</p>}
                        </div>
                        <div className="flex items-center gap-4 shrink-0 text-xs text-zinc-500">
                          {item.qty     != null && <span>Qty {item.qty}</span>}
                          {item.qBultos != null && <span>{item.qBultos} bultos</span>}
                          {item.cbm     != null && <span>{item.cbm.toFixed(3)} CBM</span>}
                          {item.gwKg    != null && <span>{item.gwKg.toFixed(1)} kg</span>}
                        </div>
                        <button onClick={() => setEditing(item)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-50 text-zinc-300 hover:text-amber-500 transition-colors shrink-0">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {asnGroups.length === 0 && (
            <div className="flex items-center justify-center py-16 text-zinc-300 text-sm">Sin resultados</div>
          )}
        </div>
      )}

      {/* Table */}
      {!groupByAsn && <div className="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[640px]">
          <table className="w-full text-xs border-collapse" style={{ minWidth: `${1600 + extraColumns.length * 120}px` }}>
            <thead className="sticky top-0 z-10 bg-zinc-50">
              {/* Row 1 — group labels */}
              <tr className="border-b border-zinc-100/60">
                <th className="w-8 pl-3" />
                {GROUPS.map(group => {
                  const span = groupSpan(group, vis)
                  if (span === 0) return null
                  return (
                    <th
                      key={group.label}
                      colSpan={span}
                      className={`px-2 pt-2 pb-0.5 text-left ${group.borderClass}`}
                    >
                      <span className={`text-[9px] font-bold uppercase tracking-widest px-0.5 ${group.textColor}`}>
                        {group.label}
                      </span>
                    </th>
                  )
                })}
                {extraColumns.length > 0 && (
                  <th colSpan={extraColumns.length} className="px-2 pt-2 pb-0.5 text-left border-l-2 border-l-violet-100">
                    <span className="text-[9px] font-bold uppercase tracking-widest px-0.5 text-violet-500">Fuentes</span>
                  </th>
                )}
                <th />
              </tr>

              {/* Row 2 — column names */}
              <tr className="border-b border-zinc-100">
                <th className="w-8 pl-3 py-2">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded accent-amber-400 cursor-pointer" />
                </th>

                {/* Identificación */}
                {vis.has('tipo')     && <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-24">Tipo</th>}
                {vis.has('cargado')  && <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-20">Cargado</th>}
                {vis.has('category') && <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-24">Category</th>}
                {vis.has('asn')      && <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-28">ASN</th>}
                {vis.has('date')     && <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-20">Date</th>}

                {/* Producto */}
                {vis.has('piNo')      && <th className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-28 ${firstVisibleBorder(GROUPS[1],'piNo',vis)}`}>PI No</th>}
                {vis.has('cajaBultos')&& <th className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-28 ${firstVisibleBorder(GROUPS[1],'cajaBultos',vis)}`}>Caja / Bultos</th>}
                {vis.has('ean')       && <th className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-28 ${firstVisibleBorder(GROUPS[1],'ean',vis)}`}>EAN / Code</th>}
                {vis.has('descripcion')&&<th className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400 min-w-[180px] ${firstVisibleBorder(GROUPS[1],'descripcion',vis)}`}>Descripción</th>}
                {vis.has('qty')       && <th className={`px-2 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-12 ${firstVisibleBorder(GROUPS[1],'qty',vis)}`}>Qty</th>}

                {/* PL vs GSO */}
                {vis.has('plSO') && <th className={`px-2 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-blue-500 w-20 ${firstVisibleBorder(GROUPS[2],'plSO',vis)}`}>∑ PL/SO</th>}
                {vis.has('qGso') && <th className={`px-2 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-blue-500 w-16 ${firstVisibleBorder(GROUPS[2],'qGso',vis)}`}>Q GSO</th>}
                {vis.has('dif')  && <th className={`px-2 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-blue-500 w-16 ${firstVisibleBorder(GROUPS[2],'dif',vis)}`}>Dif</th>}

                {/* Dimensiones */}
                {vis.has('wxlxh')   && <th className={`px-2 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-28 ${firstVisibleBorder(GROUPS[3],'wxlxh',vis)}`}>W×L×H (cm)</th>}
                {vis.has('gwKg')    && <th className={`px-2 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-16 ${firstVisibleBorder(GROUPS[3],'gwKg',vis)}`}>GW kg</th>}
                {vis.has('cbm')     && <th className={`px-2 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-16 ${firstVisibleBorder(GROUPS[3],'cbm',vis)}`}>CBM</th>}
                {vis.has('cbmBulto')&& <th className={`px-2 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-20 ${firstVisibleBorder(GROUPS[3],'cbmBulto',vis)}`}>CBM/Bulto</th>}
                {vis.has('uniBulto')&& <th className={`px-2 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-16 ${firstVisibleBorder(GROUPS[3],'uniBulto',vis)}`}>Uni/Bulto</th>}
                {vis.has('dg')      && <th className={`px-2 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-8 ${firstVisibleBorder(GROUPS[3],'dg',vis)}`}>DG</th>}

                {/* Comercial */}
                {vis.has('soPrincipal') && <th className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-violet-400 w-32 ${firstVisibleBorder(GROUPS[4],'soPrincipal',vis)}`}>SO Principal</th>}
                {vis.has('soSecundario')&& <th className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-violet-400 w-28 ${firstVisibleBorder(GROUPS[4],'soSecundario',vis)}`}>SO Secund.</th>}
                {vis.has('drive')       && <th className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-violet-400 w-20 ${firstVisibleBorder(GROUPS[4],'drive',vis)}`}>Drive</th>}
                {vis.has('fotos')       && <th className={`px-2 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-violet-400 w-16 ${firstVisibleBorder(GROUPS[4],'fotos',vis)}`}>Fotos</th>}
                {vis.has('incoterm')    && <th className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-violet-400 w-24 ${firstVisibleBorder(GROUPS[4],'incoterm',vis)}`}>Incoterm</th>}
                {vis.has('puertoSalida')&& <th className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-violet-400 w-28 ${firstVisibleBorder(GROUPS[4],'puertoSalida',vis)}`}>Puerto Salida</th>}

                {/* Comex / Tracking */}
                {vis.has('etd')      && <th className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-cyan-500 w-24 ${firstVisibleBorder(GROUPS[5],'etd',vis)}`}>ETD</th>}
                {vis.has('eta')      && <th className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-cyan-500 w-24 ${firstVisibleBorder(GROUPS[5],'eta',vis)}`}>ETA</th>}
                {vis.has('etaCaldas')&& <th className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-cyan-500 w-24 ${firstVisibleBorder(GROUPS[5],'etaCaldas',vis)}`}>ETA Caldas</th>}
                {vis.has('awb')      && <th className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-cyan-500 w-28 ${firstVisibleBorder(GROUPS[5],'awb',vis)}`}>AWB</th>}
                {vis.has('arriboWh') && <th className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-cyan-500 w-24 ${firstVisibleBorder(GROUPS[5],'arriboWh',vis)}`}>Arribo WH</th>}
                {vis.has('paletizado')&&<th className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-cyan-500 w-24 ${firstVisibleBorder(GROUPS[5],'paletizado',vis)}`}>Paletizado</th>}

                {/* Extra live-data columns */}
                {extraColumns.map((c, ci) => (
                  <th key={c.fieldKey}
                    className={`px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-violet-500 w-28 ${ci === 0 ? 'border-l-2 border-l-violet-100' : ''}`}>
                    {c.label}
                  </th>
                ))}

                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const isRep = item.tipoCarga === 'Repuesto'
                const rowKey = `${item.id}-${item._isPrimary ? 'p' : 's'}`
                const dimSource = dimsForKey.get(rowKey) ?? item
                const dims = (dimSource.w && dimSource.l && dimSource.h) ? `${dimSource.w}×${dimSource.l}×${dimSource.h}` : '—'
                const isSelected = selected.has(item.id)
                return (
                  <tr key={rowKey} className={`border-b border-zinc-50 transition-colors ${isSelected ? 'bg-amber-50/60' : 'hover:bg-zinc-50/60'} ${
                    item._isSplit
                      ? item._isPrimary
                        ? 'border-l-2 border-l-amber-300'
                        : 'border-l-2 border-l-sky-300'
                      : ''
                  }`}>

                    <td className="pl-3 pr-1 py-2.5">
                      {item._isPrimary && (
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.id)}
                          className="w-3.5 h-3.5 rounded accent-amber-400 cursor-pointer" />
                      )}
                    </td>

                    {vis.has('tipo') && (
                      <td className="pl-5 pr-2 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isRep ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                        }`}>
                          {isRep ? <FileSpreadsheet className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                          {item.tipoCarga}
                        </span>
                      </td>
                    )}
                    {vis.has('cargado')  && <td className="px-2 py-2.5 text-zinc-400 whitespace-nowrap">{fmtDate(item.createdAt)}</td>}
                    {vis.has('category') && <td className="px-2 py-2.5 text-zinc-500">{item.categoryName ?? '—'}</td>}
                    {vis.has('asn')      && <td className="px-2 py-2.5 font-mono text-zinc-600">{item.asn ?? '—'}</td>}
                    {vis.has('date')     && <td className="px-2 py-2.5 text-zinc-500 whitespace-nowrap">{fmtDate(item.date)}</td>}
                    {vis.has('piNo')       && <td className="px-2 py-2.5 font-mono text-zinc-600">{item.piNo ?? '—'}</td>}
                    {vis.has('cajaBultos') && (
                      <td className="px-2 py-2.5 font-mono text-zinc-600">
                        {isRep ? (item.caseNo ?? '—') : (item.qBultos != null ? `${item.qBultos} bultos` : '—')}
                      </td>
                    )}
                    {vis.has('ean')        && <td className="px-2 py-2.5 font-mono text-zinc-600">{item.codeEan ?? '—'}</td>}
                    {vis.has('descripcion')&& (
                      <td className="px-2 py-2.5 max-w-[180px]">
                        <span className="line-clamp-2 text-zinc-700" title={item.description ?? ''}>{item.description ?? '—'}</span>
                      </td>
                    )}
                    {vis.has('qty')        && <td className="px-2 py-2.5 text-right font-mono text-zinc-600">{item.qty ?? '—'}</td>}
                    {vis.has('plSO') || vis.has('qGso') || vis.has('dif') ? (() => {
                      const soTotal = item._displaySO ? (soQtyMap.get(item._displaySO) ?? null) : null
                      const rawQGso = gl(item, 'qPi')
                      const qGso   = rawQGso != null ? (Number.isFinite(Number(rawQGso)) ? Number(rawQGso) : null) : (item._isPrimary ? item.qPi : null)
                      const diff   = soTotal != null && qGso != null ? soTotal - qGso : null
                      const diffColor = diff == null ? 'text-zinc-300'
                        : diff === 0 ? 'text-emerald-600 font-bold'
                        : diff > 0   ? 'text-amber-600 font-bold'
                        :              'text-red-600 font-bold'
                      return <>
                        {vis.has('plSO') && (
                          <td className={`px-2 py-2.5 text-right font-mono text-blue-700 ${firstVisibleBorder(GROUPS[2],'plSO',vis)}`}>
                            {soTotal != null ? soTotal.toLocaleString('es-AR') : '—'}
                          </td>
                        )}
                        {vis.has('qGso') && (
                          <td className={`px-2 py-2.5 text-right font-mono text-blue-500 ${firstVisibleBorder(GROUPS[2],'qGso',vis)}`}>
                            {qGso != null ? qGso.toLocaleString('es-AR') : '—'}
                          </td>
                        )}
                        {vis.has('dif') && (
                          <td className={`px-2 py-2.5 text-right font-mono ${diffColor} ${firstVisibleBorder(GROUPS[2],'dif',vis)}`}>
                            {diff == null ? '—' : diff > 0 ? `+${diff.toLocaleString('es-AR')}` : diff.toLocaleString('es-AR')}
                          </td>
                        )}
                      </>
                    })() : null}
                    {vis.has('wxlxh') && !skipSet.has(rowKey) && (
                      <td className={`px-2 py-2.5 text-right font-mono text-zinc-500 align-middle ${firstVisibleBorder(GROUPS[3],'wxlxh',vis)}`} rowSpan={spanMap.get(rowKey) ?? 1}>
                        {dims}
                      </td>
                    )}
                    {vis.has('gwKg') && !skipSet.has(rowKey) && (
                      <td className={`px-2 py-2.5 text-right font-mono text-zinc-600 align-middle ${firstVisibleBorder(GROUPS[3],'gwKg',vis)}`} rowSpan={spanMap.get(rowKey) ?? 1}>
                        {fmtNum(dimSource.gwKg, 2)}
                      </td>
                    )}
                    {vis.has('cbm') && !skipSet.has(rowKey) && (
                      <td className={`px-2 py-2.5 text-right font-mono text-zinc-600 align-middle ${firstVisibleBorder(GROUPS[3],'cbm',vis)}`} rowSpan={spanMap.get(rowKey) ?? 1}>
                        {fmtNum(dimSource.cbm, 5)}
                      </td>
                    )}
                    {vis.has('cbmBulto') && !skipSet.has(rowKey) && (
                      <td className={`px-2 py-2.5 text-right font-mono text-zinc-500 align-middle ${firstVisibleBorder(GROUPS[3],'cbmBulto',vis)}`} rowSpan={spanMap.get(rowKey) ?? 1}>
                        {fmtNum(dimSource.cbmXBulto, 5)}
                      </td>
                    )}
                    {vis.has('uniBulto') && (
                      <td className={`px-2 py-2.5 text-right font-mono text-zinc-500 ${firstVisibleBorder(GROUPS[3],'uniBulto',vis)}`}>
                        {fmtNum(item.uniXBulto, 4)}
                      </td>
                    )}
                    {vis.has('dg') && (
                      <td className={`px-2 py-2.5 text-center ${firstVisibleBorder(GROUPS[3],'dg',vis)}`}>
                        {item.isDangerousGood
                          ? <AlertTriangle className="w-3.5 h-3.5 text-orange-500 mx-auto" />
                          : <span className="text-zinc-200">—</span>}
                      </td>
                    )}
                    {/* Comercial group */}
                    {vis.has('soPrincipal') && (
                      <td className={`px-2 py-2.5 ${firstVisibleBorder(GROUPS[4],'soPrincipal',vis)}`}>
                        {item._displaySO ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="font-mono text-[11px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded">
                              {item._displaySO}
                            </span>
                            {item._isSplit && (
                              <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                                item._isPrimary ? 'bg-amber-100 text-amber-600' : 'bg-sky-50 text-sky-500'
                              }`}>
                                {item._isPrimary ? '1°' : '2°'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-300 italic text-[10px]">sin SO</span>
                        )}
                      </td>
                    )}
                    {vis.has('soSecundario') && (
                      <td className={`px-2 py-2.5 ${firstVisibleBorder(GROUPS[4],'soSecundario',vis)}`}>
                        {item._isSplit ? (
                          <span className="font-mono text-[10px] text-zinc-300">
                            {item._isPrimary ? (item.soSecundario ?? '—') : (item.soPrincipal ?? '—')}
                          </span>
                        ) : (
                          item.soSecundario
                            ? <span className="font-mono text-[11px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">{item.soSecundario}</span>
                            : <span className="text-zinc-200">—</span>
                        )}
                      </td>
                    )}
                    {vis.has('drive') && (
                      <td className={`px-2 py-2.5 ${firstVisibleBorder(GROUPS[4],'drive',vis)}`}>
                        <div className="flex items-center gap-0.5">
                          {item.driveLinkExcel
                            ? <a href={item.driveLinkExcel} target="_blank" rel="noopener noreferrer"
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                title="Excel CIPL">XLS</a>
                            : <span className="text-[9px] px-1.5 py-0.5 rounded text-zinc-200">XLS</span>}
                          {item.driveLinkCi
                            ? <a href={item.driveLinkCi} target="_blank" rel="noopener noreferrer"
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                                title="Commercial Invoice">CI</a>
                            : <span className="text-[9px] px-1.5 py-0.5 rounded text-zinc-200">CI</span>}
                          {item.driveLinkPl
                            ? <a href={item.driveLinkPl} target="_blank" rel="noopener noreferrer"
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                                title="Packing List">PL</a>
                            : <span className="text-[9px] px-1.5 py-0.5 rounded text-zinc-200">PL</span>}
                        </div>
                      </td>
                    )}
                    {vis.has('fotos') && (
                      <td className={`px-2 py-2.5 text-center ${firstVisibleBorder(GROUPS[4],'fotos',vis)}`}>
                        {item._isPrimary && (
                          <button
                            onClick={() => setViewingPhotosFor(item)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors text-[10px] font-bold ${
                              item.photoCount > 0
                                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                : 'bg-zinc-50 text-zinc-300 hover:bg-zinc-100 hover:text-zinc-500'
                            }`}
                          >
                            <Camera className="w-3 h-3" />
                            {item.photoCount > 0 ? item.photoCount : '+'}
                          </button>
                        )}
                      </td>
                    )}
                    {vis.has('incoterm') && (
                      <td className={`px-2 py-2.5 text-zinc-600 text-[11px] ${firstVisibleBorder(GROUPS[4],'incoterm',vis)}`}>
                        {item.incoterm ?? <span className="text-zinc-200">—</span>}
                      </td>
                    )}
                    {vis.has('puertoSalida') && (
                      <td className={`px-2 py-2.5 text-zinc-600 text-[11px] ${firstVisibleBorder(GROUPS[4],'puertoSalida',vis)}`}>
                        {item.puertoSalida ?? <span className="text-zinc-200">—</span>}
                      </td>
                    )}

                    {/* Comex / Tracking */}
                    {vis.has('etd')       && <td className={`px-2 py-2.5 text-zinc-600 text-[11px] whitespace-nowrap ${firstVisibleBorder(GROUPS[5],'etd',vis)}`}>{fmtDate(item.etd)}</td>}
                    {vis.has('eta')       && <td className={`px-2 py-2.5 text-zinc-600 text-[11px] whitespace-nowrap ${firstVisibleBorder(GROUPS[5],'eta',vis)}`}>{fmtDate(item.eta)}</td>}
                    {vis.has('etaCaldas') && <td className={`px-2 py-2.5 text-zinc-600 text-[11px] whitespace-nowrap ${firstVisibleBorder(GROUPS[5],'etaCaldas',vis)}`}>{fmtDate(item.etaCaldas)}</td>}
                    {vis.has('awb')       && <td className={`px-2 py-2.5 font-mono text-zinc-600 text-[11px] ${firstVisibleBorder(GROUPS[5],'awb',vis)}`}>{item.awb ?? <span className="text-zinc-200">—</span>}</td>}
                    {vis.has('arriboWh')  && <td className={`px-2 py-2.5 text-zinc-600 text-[11px] whitespace-nowrap ${firstVisibleBorder(GROUPS[5],'arriboWh',vis)}`}>{fmtDate(item.arriboWh)}</td>}
                    {vis.has('paletizado')&& <td className={`px-2 py-2.5 text-zinc-600 text-[11px] ${firstVisibleBorder(GROUPS[5],'paletizado',vis)}`}>{item.paletizado ?? <span className="text-zinc-200">—</span>}</td>}

                    {/* Extra columns from live sources */}
                    {extraColumns.map(c => (
                      <td key={c.fieldKey} className="px-2 py-2.5 text-violet-600">
                        {gl(item, c.fieldKey) ?? <span className="text-zinc-200">—</span>}
                      </td>
                    ))}

                    {/* Actions */}
                    <td className="px-2 py-2.5 text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <button onClick={() => setEditing(item)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-50 text-zinc-300 hover:text-amber-500 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(item.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-zinc-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>}

      {viewingPhotosFor && (
        <PhotoModal
          item={viewingPhotosFor}
          onClose={() => setViewingPhotosFor(null)}
          onCountChange={handlePhotoCountChange}
        />
      )}

      {editing && (
        <EditDrawer
          item={editing}
          soList={soList}
          onClose={() => setEditing(null)}
          onSaved={(id, fields) => { handleSaved(id, fields) }}
        />
      )}

      <style>{`.input-base { width: 100%; height: 32px; padding: 0 10px; font-size: 12px; border-radius: 8px; border: 1px solid #e4e4e7; outline: none; background: white; } .input-base:focus { ring: 2px; border-color: #fbbf24; box-shadow: 0 0 0 2px #fef3c7; }`}</style>
    </div>
  )
}
