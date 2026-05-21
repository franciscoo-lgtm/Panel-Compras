'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import {
  BarChart2, Plus, X, Settings2, FileSpreadsheet, FileText, Maximize2,
  ChevronDown, ChevronUp, Search, Zap,
} from 'lucide-react'
import type { LiveDataMap, ExtraColumn } from '@/app/lib/comex-sources'

// ─── Exported type (used by page.tsx) ─────────────────────────────────────────

export type CIPLItemRow = {
  id: string; asn: string | null; piNo: string | null; caseNo: string | null
  soPrincipal: string | null; tipoCarga: string; categoryName: string | null
  description: string | null; qty: number | null; qBultos: number | null
  cbm: number | null; gwKg: number | null
  etd: string | null; eta: string | null
  arriboWh: string | null; etaCaldas: string | null
  awb: string | null; avisoAgente: string | null
}

// ─── Report tile config ───────────────────────────────────────────────────────

export type GroupByField = 'asn' | 'piNo' | 'soPrincipal' | 'tipoCarga' | 'categoryName' | 'caseNo'

export type TileFilters = {
  dateFrom: string   // ISO date string or ''
  dateTo:   string   // ISO date string or ''
  tipoCarga: '' | 'Mercaderia' | 'Repuesto'
  search:   string
}

export type ReportTileConfig = {
  id:      string
  groupBy: GroupByField
  filters: TileFilters
  columns: string[]  // fieldKeys in display order
}

const DEFAULT_FILTERS: TileFilters = { dateFrom: '', dateTo: '', tipoCarga: '', search: '' }
const DEFAULT_COLUMNS = ['qty', 'qBultos', 'cbm', 'gwKg']

// ─── Report group ─────────────────────────────────────────────────────────────

type ReportGroup = {
  key:          string
  items:        CIPLItemRow[]
  totalQty:     number
  totalBultos:  number
  totalCbm:     number
  totalGw:      number
}

// ─── Available columns ────────────────────────────────────────────────────────

export type ColCategory = 'qty' | 'logistica' | 'calc'

export type ColDef = { fieldKey: string; label: string; category: ColCategory }

export const FIXED_COLS: ColDef[] = [
  { fieldKey: 'qty',          label: 'Qty',          category: 'qty'      },
  { fieldKey: 'qBultos',      label: 'Bultos',        category: 'qty'      },
  { fieldKey: 'cbm',          label: 'CBM',           category: 'qty'      },
  { fieldKey: 'gwKg',         label: 'GW (kg)',        category: 'qty'      },
  { fieldKey: 'etd',          label: 'ETD',           category: 'logistica' },
  { fieldKey: 'eta',          label: 'ETA',           category: 'logistica' },
  { fieldKey: 'arriboWh',     label: 'Arribo WH',     category: 'logistica' },
  { fieldKey: 'etaCaldas',    label: 'ETA Caldas',    category: 'logistica' },
  { fieldKey: 'awb',          label: 'AWB',           category: 'logistica' },
  { fieldKey: 'avisoAgente',  label: 'Aviso Ag.',     category: 'logistica' },
  { fieldKey: 'description',  label: 'Descripción',   category: 'logistica' },
  { fieldKey: 'caseNo',       label: 'N° Caja',       category: 'logistica' },
  { fieldKey: 'piNo',         label: 'N° PI',         category: 'logistica' },
  { fieldKey: 'soPrincipal',  label: 'SO Principal',  category: 'logistica' },
  { fieldKey: 'tipoCarga',    label: 'Tipo',          category: 'logistica' },
  { fieldKey: 'categoryName', label: 'Categoría',     category: 'logistica' },
  { fieldKey: '_diasTransito', label: 'Días tránsito', category: 'calc'    },
]

export const GROUP_BY_OPTIONS: { key: GroupByField; label: string }[] = [
  { key: 'asn',          label: 'ASN / Embarque' },
  { key: 'piNo',         label: 'N° PI' },
  { key: 'soPrincipal',  label: 'SO Principal' },
  { key: 'tipoCarga',    label: 'Tipo de Carga' },
  { key: 'categoryName', label: 'Categoría' },
  { key: 'caseNo',       label: 'N° Caja' },
]

// ─── localStorage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'reportes-dashboard-v1'

function loadTiles(): ReportTileConfig[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? (JSON.parse(saved) as ReportTileConfig[]) : []
  } catch { return [] }
}

function saveTiles(tiles: ReportTileConfig[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tiles)) } catch {}
}

// ─── Filter ───────────────────────────────────────────────────────────────────

function applyFilters(items: CIPLItemRow[], f: TileFilters): CIPLItemRow[] {
  return items.filter(item => {
    if (f.tipoCarga && item.tipoCarga !== f.tipoCarga) return false
    if (f.search) {
      const q = f.search.toLowerCase()
      if (![item.asn, item.piNo, item.soPrincipal, item.description]
          .some(v => v?.toLowerCase().includes(q))) return false
    }
    if (f.dateFrom || f.dateTo) {
      const d = item.etd ? new Date(item.etd) : null
      if (!d) return false
      if (f.dateFrom && d < new Date(f.dateFrom)) return false
      if (f.dateTo   && d > new Date(f.dateTo))   return false
    }
    return true
  })
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

function buildGroups(items: CIPLItemRow[], groupBy: GroupByField): ReportGroup[] {
  const map = new Map<string, CIPLItemRow[]>()
  for (const item of items) {
    const key = (item[groupBy] as string | null) ?? '(sin valor)'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return [...map.entries()].map(([key, grpItems]) => {
    // Deduplicate by caseNo for CBM/GW (one carton → counted once)
    const seenBoxes = new Set<string>()
    let cbm = 0; let gw = 0; let bultos = 0
    for (const i of grpItems) {
      const bk = i.caseNo ? `${i.asn ?? ''}|${i.caseNo}` : i.id
      if (!seenBoxes.has(bk)) {
        seenBoxes.add(bk)
        cbm    += i.cbm    ?? 0
        gw     += i.gwKg   ?? 0
        bultos += i.qBultos ?? 0
      }
    }
    return {
      key,
      items:       grpItems,
      totalQty:    grpItems.reduce((s, i) => s + (i.qty ?? 0), 0),
      totalBultos: bultos,
      totalCbm:    +cbm.toFixed(4),
      totalGw:     +gw.toFixed(2),
    }
  })
}

// ─── Cell value resolver ──────────────────────────────────────────────────────

function getCellValue(item: CIPLItemRow, fieldKey: string, liveData: LiveDataMap): string {
  if (fieldKey === '_diasTransito') {
    const etd    = item.etd    ? new Date(item.etd)    : null
    const arribo = item.arriboWh ? new Date(item.arriboWh) : null
    const eta    = item.eta    ? new Date(item.eta)    : null
    if (!etd) return '—'
    if (arribo) return String(Math.round((arribo.getTime() - etd.getTime()) / 86400000))
    if (eta && eta < new Date()) return '⚠ demorado'
    return '—'
  }
  if (fieldKey.startsWith('extra_')) {
    const so = item.soPrincipal?.trim().toUpperCase()
    return so ? (liveData[so]?.[fieldKey] ?? '—') : '—'
  }
  const val = (item as Record<string, unknown>)[fieldKey]
  if (val == null) return '—'
  if (typeof val === 'number') {
    return val.toLocaleString('es-AR', { maximumFractionDigits: 4 })
  }
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    return new Date(val).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }
  return String(val)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tileTitle(cfg: ReportTileConfig): string {
  const g = GROUP_BY_OPTIONS.find(o => o.key === cfg.groupBy)?.label ?? cfg.groupBy
  return `Por ${g}`
}

function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ─── ConfigDrawer ─────────────────────────────────────────────────────────────

function ConfigDrawer({
  cfg,
  extraColumns,
  onSave,
  onClose,
}: {
  cfg:          ReportTileConfig
  extraColumns: ExtraColumn[]
  onSave:       (cfg: ReportTileConfig) => void
  onClose:      () => void
}) {
  const [local, setLocal] = useState<ReportTileConfig>(cfg)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const setFilter = <K extends keyof TileFilters>(key: K, val: TileFilters[K]) =>
    setLocal(p => ({ ...p, filters: { ...p.filters, [key]: val } }))

  const toggleColumn = (fieldKey: string) =>
    setLocal(p => ({
      ...p,
      columns: p.columns.includes(fieldKey)
        ? p.columns.filter(c => c !== fieldKey)
        : [...p.columns, fieldKey],
    }))

  const allCols: ColDef[] = [
    ...FIXED_COLS,
    ...extraColumns.map(c => ({ fieldKey: c.fieldKey, label: c.label, category: 'calc' as ColCategory })),
  ]

  const byCategory = (cat: ColCategory) => allCols.filter(c => c.category === cat)
  const extraCols  = extraColumns.map(c => c.fieldKey)
  const fuentes    = allCols.filter(c => extraCols.includes(c.fieldKey))

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-80 z-50 bg-white shadow-2xl border-l border-zinc-100 flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <span className="text-sm font-bold text-zinc-800">Configurar reporte</span>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">
          {/* Group by */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Agrupar por</label>
            <select
              value={local.groupBy}
              onChange={e => setLocal(p => ({ ...p, groupBy: e.target.value as GroupByField }))}
              className="w-full h-9 px-3 text-sm rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#E30613]/30 bg-white text-zinc-700"
            >
              {GROUP_BY_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>

          {/* Filters */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Filtros</label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="date"
                  value={local.filters.dateFrom}
                  onChange={e => setFilter('dateFrom', e.target.value)}
                  placeholder="Desde (ETD)"
                  className="flex-1 h-8 px-2 text-xs rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#E30613]/30"
                />
                <input
                  type="date"
                  value={local.filters.dateTo}
                  onChange={e => setFilter('dateTo', e.target.value)}
                  placeholder="Hasta (ETD)"
                  className="flex-1 h-8 px-2 text-xs rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#E30613]/30"
                />
              </div>
              <select
                value={local.filters.tipoCarga}
                onChange={e => setFilter('tipoCarga', e.target.value as TileFilters['tipoCarga'])}
                className="w-full h-8 px-2 text-xs rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#E30613]/30 bg-white text-zinc-700"
              >
                <option value="">Todos los tipos</option>
                <option value="Mercaderia">Mercadería</option>
                <option value="Repuesto">Repuesto</option>
              </select>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-300 pointer-events-none" />
                <input
                  type="text"
                  value={local.filters.search}
                  onChange={e => setFilter('search', e.target.value)}
                  placeholder="Buscar ASN, PI, SO…"
                  className="w-full h-8 pl-7 pr-2 text-xs rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#E30613]/30"
                />
              </div>
            </div>
          </div>

          {/* Columns */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Columnas</label>
            <div className="space-y-3">
              {([
                { label: 'Cantidades', cols: byCategory('qty')      },
                { label: 'Logística',  cols: byCategory('logistica') },
                { label: 'Calculadas', cols: byCategory('calc').filter(c => !extraCols.includes(c.fieldKey)) },
                ...(fuentes.length > 0 ? [{ label: 'Fuentes', cols: fuentes }] : []),
              ] as { label: string; cols: ColDef[] }[]).map(({ label, cols }) =>
                cols.length === 0 ? null : (
                  <div key={label}>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-300 mb-1">{label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cols.map(col => {
                        const on = local.columns.includes(col.fieldKey)
                        return (
                          <button
                            key={col.fieldKey}
                            onClick={() => toggleColumn(col.fieldKey)}
                            className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                              on
                                ? 'bg-[#E30613] text-white'
                                : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                            }`}
                          >
                            {col.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-zinc-100">
          <button
            onClick={() => onSave(local)}
            disabled={local.columns.length === 0}
            className="w-full h-9 rounded-xl bg-[#E30613] hover:bg-red-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
          >
            Guardar reporte
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReportesClient({
  initialItems,
  liveData,
  extraColumns,
}: {
  initialItems: CIPLItemRow[]
  liveData:     LiveDataMap
  extraColumns: ExtraColumn[]
}) {
  const [tiles,      setTiles]      = useState<ReportTileConfig[]>([])
  const [drawerCfg,  setDrawerCfg]  = useState<ReportTileConfig | null>(null) // null = closed
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => { setTiles(loadTiles()) }, [])

  const updateTiles = useCallback((next: ReportTileConfig[]) => {
    setTiles(next); saveTiles(next)
  }, [])

  const openNewDrawer = () => setDrawerCfg({
    id:      newId(),
    groupBy: 'asn',
    filters: { ...DEFAULT_FILTERS },
    columns: [...DEFAULT_COLUMNS],
  })

  const openEditDrawer = (cfg: ReportTileConfig) => setDrawerCfg({ ...cfg })

  const deleteTile = (id: string) => updateTiles(tiles.filter(t => t.id !== id))

  const saveDrawer = (cfg: ReportTileConfig) => {
    const exists = tiles.some(t => t.id === cfg.id)
    updateTiles(exists ? tiles.map(t => t.id === cfg.id ? cfg : t) : [...tiles, cfg])
    setDrawerCfg(null)
  }

  const hasLive = Object.keys(liveData).length > 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {tiles.length > 0 && (
            <span className="text-xs text-zinc-400 font-mono">{tiles.length} reporte{tiles.length !== 1 ? 's' : ''}</span>
          )}
          {hasLive && (
            <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
              <Zap className="w-3 h-3" />En vivo
            </span>
          )}
        </div>
        <button
          onClick={openNewDrawer}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#E30613] hover:bg-red-700 text-white text-xs font-semibold transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Nuevo reporte
        </button>
      </div>

      {/* Empty state */}
      {tiles.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <BarChart2 className="w-10 h-10 text-zinc-200" />
          <p className="text-sm text-zinc-400">No hay reportes todavía.</p>
          <button
            onClick={openNewDrawer}
            className="flex items-center gap-1.5 h-8 px-4 rounded-xl bg-[#E30613]/10 hover:bg-[#E30613]/20 text-[#E30613] text-xs font-semibold transition-colors"
          >
            <Plus className="w-3 h-3" />
            Crear el primero
          </button>
        </div>
      )}

      {/* Grid */}
      {tiles.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {tiles.map(cfg => (
            <TileCard
              key={cfg.id}
              cfg={cfg}
              items={initialItems}
              liveData={liveData}
              extraColumns={extraColumns}
              onEdit={() => openEditDrawer(cfg)}
              onDelete={() => deleteTile(cfg.id)}
              onExpand={() => setExpandedId(cfg.id)}
              onExportXlsx={() => console.log('xlsx', cfg.id)}
              onExportPdf={() => console.log('pdf', cfg.id)}
            />
          ))}
          {/* Add tile */}
          <button
            onClick={openNewDrawer}
            className="min-h-[140px] rounded-xl border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center gap-2 text-zinc-300 hover:border-zinc-300 hover:text-zinc-400 transition-colors"
          >
            <Plus className="w-6 h-6" />
            <span className="text-[10px] font-semibold uppercase tracking-widest">Nuevo reporte</span>
          </button>
        </div>
      )}

      {drawerCfg && (
        <ConfigDrawer
          cfg={drawerCfg}
          extraColumns={extraColumns}
          onSave={saveDrawer}
          onClose={() => setDrawerCfg(null)}
        />
      )}
    </div>
  )
}

const TRUNCATE_GROUPS = 5

function TileCard({
  cfg,
  items,
  liveData,
  extraColumns,
  onEdit,
  onDelete,
  onExpand,
  onExportXlsx,
  onExportPdf,
}: {
  cfg:          ReportTileConfig
  items:        CIPLItemRow[]
  liveData:     LiveDataMap
  extraColumns: ExtraColumn[]
  onEdit:       () => void
  onDelete:     () => void
  onExpand:     () => void
  onExportXlsx: () => void
  onExportPdf:  () => void
}) {
  const [showAll, setShowAll] = useState(false)

  const filtered = useMemo(() => applyFilters(items, cfg.filters), [items, cfg.filters])
  const groups   = useMemo(() => buildGroups(filtered, cfg.groupBy), [filtered, cfg.groupBy])

  const totalQty    = groups.reduce((s, g) => s + g.totalQty,    0)
  const totalBultos = groups.reduce((s, g) => s + g.totalBultos, 0)
  const totalCbm    = +groups.reduce((s, g) => s + g.totalCbm,   0).toFixed(4)
  const totalGw     = +groups.reduce((s, g) => s + g.totalGw,    0).toFixed(2)

  const allCols: ColDef[] = [
    ...FIXED_COLS,
    ...extraColumns.map(c => ({ fieldKey: c.fieldKey, label: c.label, category: 'calc' as ColCategory })),
  ]
  const colDefs = cfg.columns
    .map(fk => allCols.find(c => c.fieldKey === fk))
    .filter(Boolean) as ColDef[]

  const visibleGroups = showAll ? groups : groups.slice(0, TRUNCATE_GROUPS)
  const hiddenCount   = groups.length - TRUNCATE_GROUPS

  const activeFilters = [
    cfg.filters.tipoCarga,
    cfg.filters.dateFrom && `desde ${cfg.filters.dateFrom}`,
    cfg.filters.dateTo   && `hasta ${cfg.filters.dateTo}`,
    cfg.filters.search   && `"${cfg.filters.search}"`,
  ].filter(Boolean) as string[]

  return (
    <div className="bg-white rounded-xl border border-zinc-100 shadow-sm flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-zinc-50">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-zinc-800">{tileTitle(cfg)}</span>
            {activeFilters.map(f => (
              <span key={f} className="text-[9px] bg-zinc-100 text-zinc-500 rounded px-1.5 py-0.5 font-medium">{f}</span>
            ))}
          </div>
          <p className="text-[10px] text-zinc-400 mt-0.5">{groups.length} grupo{groups.length !== 1 ? 's' : ''} · {filtered.length} ítems</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-zinc-400">
          <button onClick={onExpand} title="Pantalla completa" className="hover:text-zinc-700 transition-colors"><Maximize2  className="w-3.5 h-3.5" /></button>
          <button onClick={onEdit}   title="Editar"            className="hover:text-zinc-700 transition-colors"><Settings2  className="w-3.5 h-3.5" /></button>
          <button onClick={onExportXlsx} title="Exportar Excel" className="hover:text-emerald-600 transition-colors text-[10px] font-semibold">xlsx</button>
          <button onClick={onExportPdf}  title="Exportar PDF"   className="hover:text-red-600    transition-colors text-[10px] font-semibold">pdf</button>
          <button onClick={onDelete} title="Eliminar"          className="hover:text-red-500   transition-colors"><X          className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-4 divide-x divide-zinc-50 border-b border-zinc-50">
        {[
          { label: 'Qty',    value: totalQty.toLocaleString('es-AR'),    color: 'text-emerald-700' },
          { label: 'Bultos', value: totalBultos.toLocaleString('es-AR'), color: 'text-sky-700'     },
          { label: 'CBM',    value: `${totalCbm}`,                       color: 'text-orange-700'  },
          { label: 'GW kg',  value: `${totalGw}`,                        color: 'text-amber-700'   },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col items-center py-2">
            <span className={`text-sm font-bold tabular-nums leading-tight ${color}`}>{value}</span>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400 mt-0.5">{label}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      {groups.length === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-300">Sin resultados</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-50">
                <th className="text-left px-4 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wide whitespace-nowrap">
                  {GROUP_BY_OPTIONS.find(o => o.key === cfg.groupBy)?.label ?? cfg.groupBy}
                </th>
                {colDefs.map(col => (
                  <th key={col.fieldKey} className="text-right px-3 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wide whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map(group => (
                <tr key={group.key} className="border-b border-zinc-50 hover:bg-zinc-50/50">
                  <td className="px-4 py-2 font-medium text-zinc-700 whitespace-nowrap max-w-[160px] truncate">{group.key}</td>
                  {colDefs.map(col => {
                    const fieldKey = col.fieldKey
                    let display: string
                    if      (fieldKey === 'qty')     display = group.totalQty.toLocaleString('es-AR')
                    else if (fieldKey === 'qBultos') display = group.totalBultos.toLocaleString('es-AR')
                    else if (fieldKey === 'cbm')     display = String(group.totalCbm)
                    else if (fieldKey === 'gwKg')    display = String(group.totalGw)
                    else {
                      const first = group.items.find(i => {
                        const v = getCellValue(i, fieldKey, liveData)
                        return v !== '—'
                      })
                      display = first ? getCellValue(first, fieldKey, liveData) : '—'
                    }
                    const isDemorado = fieldKey === '_diasTransito' && display === '⚠ demorado'
                    return (
                      <td key={fieldKey} className={`px-3 py-2 text-right whitespace-nowrap ${isDemorado ? 'text-red-500 font-semibold' : 'text-zinc-600'}`}>
                        {display}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!showAll && hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-2 text-[10px] text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 transition-colors flex items-center justify-center gap-1"
            >
              <ChevronDown className="w-3 h-3" />
              Ver {hiddenCount} grupo{hiddenCount !== 1 ? 's' : ''} más
            </button>
          )}
          {showAll && groups.length > TRUNCATE_GROUPS && (
            <button
              onClick={() => setShowAll(false)}
              className="w-full py-2 text-[10px] text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 transition-colors flex items-center justify-center gap-1"
            >
              <ChevronUp className="w-3 h-3" /> Mostrar menos
            </button>
          )}
        </div>
      )}
    </div>
  )
}
