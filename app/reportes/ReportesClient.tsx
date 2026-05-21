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
            <TilePlaceholder
              key={cfg.id}
              cfg={cfg}
              onEdit={() => openEditDrawer(cfg)}
              onDelete={() => deleteTile(cfg.id)}
              onExpand={() => setExpandedId(cfg.id)}
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

      {/* Drawer placeholder */}
      {drawerCfg && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setDrawerCfg(null)} />
      )}
    </div>
  )
}

// Temporary placeholder — replaced in Task 5
function TilePlaceholder({
  cfg, onEdit, onDelete, onExpand,
}: {
  cfg: ReportTileConfig
  onEdit: () => void
  onDelete: () => void
  onExpand: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-zinc-100 shadow-sm p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-800">{tileTitle(cfg)}</span>
        <div className="flex gap-2 text-zinc-400">
          <button onClick={onExpand}  title="Expandir"><Maximize2  className="w-3.5 h-3.5 hover:text-zinc-700" /></button>
          <button onClick={onEdit}    title="Editar">  <Settings2  className="w-3.5 h-3.5 hover:text-zinc-700" /></button>
          <button onClick={onDelete}  title="Eliminar"><X          className="w-3.5 h-3.5 hover:text-red-500"  /></button>
        </div>
      </div>
      <p className="text-xs text-zinc-300">Grupo: {cfg.groupBy} · {cfg.columns.length} columnas</p>
    </div>
  )
}
