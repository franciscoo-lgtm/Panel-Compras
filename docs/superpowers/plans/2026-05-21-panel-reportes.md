# Panel de Reportes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a dedicated `/reportes` dashboard where the user can pin multiple configurable report tiles (group-by, filters, columns) that persist in localStorage and can be exported as Excel or PDF; remove report views from Panel General and Comex.

**Architecture:** New `app/reportes/page.tsx` (server component, fetches CIPLItems + live sources) passes serialised data to `app/reportes/ReportesClient.tsx` (one client component containing the dashboard, drawer, tile, and modal). Tile configs stored as JSON in `localStorage`. Data flow mirrors the existing Panel General pattern.

**Tech Stack:** Next.js App Router, React, Tailwind CSS, `xlsx` (already installed), Lucide icons, Prisma (read-only in page.tsx), `app/lib/comex-sources.ts` for live data.

---

## File map

| File | Action |
|---|---|
| `app/reportes/page.tsx` | **Create** — server component |
| `app/reportes/ReportesClient.tsx` | **Create** — full client component |
| `components/sidebar.tsx` | **Modify** — add Reportes nav entry |
| `app/panel-general/PanelGeneralClient.tsx` | **Modify** — remove groupBy/report code |
| `app/comex/ComexClient.tsx` | **Modify** — remove reporte view |

---

## Task 1: Sidebar entry + page scaffold

**Files:**
- Modify: `components/sidebar.tsx`
- Create: `app/reportes/page.tsx`
- Create: `app/reportes/ReportesClient.tsx` (stub)

- [ ] **Step 1: Add Reportes to sidebar**

In `components/sidebar.tsx`, the `nav` array starts at line 8. Add the Reportes entry after Panel General:

```typescript
const nav = [
  { href: '/',              label: 'Inicio',            icon: Home },
  { href: '/panel-general', label: 'Panel General',     icon: LayoutDashboard },
  { href: '/reportes',      label: 'Reportes',          icon: BarChart2 },
  { href: '/comercial',     label: 'Carga Comercial',   icon: Upload },
  { href: '/comex',         label: 'Comex Tracking',    icon: Anchor },
  { href: '/operaciones',   label: 'Fuentes',            icon: Database },
  { href: '/inspeccion',    label: 'Inspección Fotos',  icon: Camera },
]
```

Also add `BarChart2` to the import line:
```typescript
import { Home, LayoutDashboard, Upload, Anchor, Database, ChevronLeft, ChevronRight, Camera, Send, BarChart2 } from 'lucide-react'
```

- [ ] **Step 2: Create the server component page.tsx**

Create `app/reportes/page.tsx`:

```typescript
export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { BarChart2 } from 'lucide-react'
import ReportesClient from './ReportesClient'
import { getComexSources, fetchAllSourcesData } from '@/app/lib/comex-sources'
import type { CIPLItemRow } from './ReportesClient'

export default async function ReportesPage() {
  const [rawItems, sources] = await Promise.all([
    prisma.cIPLItem.findMany({
      orderBy: [{ createdAt: 'desc' }, { sortOrder: 'asc' }],
      take: 2000,
    }),
    getComexSources(),
  ])

  const { liveData, extraColumns } = await fetchAllSourcesData(sources)

  const items: CIPLItemRow[] = rawItems.map(item => ({
    id:           item.id,
    asn:          item.asn,
    piNo:         item.piNo,
    caseNo:       item.caseNo,
    soPrincipal:  item.soPrincipal,
    tipoCarga:    item.tipoCarga,
    categoryName: item.categoryName,
    description:  item.description,
    qty:          item.qty,
    qBultos:      item.qBultos,
    cbm:          item.cbm,
    gwKg:         item.gwKg,
    etd:          item.etd?.toISOString().split('T')[0] ?? null,
    eta:          item.eta?.toISOString().split('T')[0] ?? null,
    arriboWh:     item.arriboWh?.toISOString().split('T')[0] ?? null,
    etaCaldas:    item.etaCaldas?.toISOString().split('T')[0] ?? null,
    awb:          item.awb,
    avisoAgente:  item.avisoAgente,
  }))

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <BarChart2 className="w-5 h-5 text-[#E30613] shrink-0" />
        <h1 className="text-xl font-semibold text-zinc-900">Reportes</h1>
      </div>
      <ReportesClient initialItems={items} liveData={liveData} extraColumns={extraColumns} />
    </div>
  )
}
```

- [ ] **Step 3: Create stub ReportesClient.tsx**

Create `app/reportes/ReportesClient.tsx`:

```typescript
'use client'

import type { LiveDataMap, ExtraColumn } from '@/app/lib/comex-sources'

export type CIPLItemRow = {
  id: string; asn: string | null; piNo: string | null; caseNo: string | null
  soPrincipal: string | null; tipoCarga: string; categoryName: string | null
  description: string | null; qty: number | null; qBultos: number | null
  cbm: number | null; gwKg: number | null
  etd: string | null; eta: string | null
  arriboWh: string | null; etaCaldas: string | null
  awb: string | null; avisoAgente: string | null
}

export default function ReportesClient({
  initialItems,
  liveData,
  extraColumns,
}: {
  initialItems: CIPLItemRow[]
  liveData: LiveDataMap
  extraColumns: ExtraColumn[]
}) {
  return (
    <div className="text-zinc-400 py-12 text-center text-sm">
      Panel de reportes — en construcción ({initialItems.length} ítems cargados)
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/sidebar.tsx app/reportes/page.tsx app/reportes/ReportesClient.tsx
git commit -m "feat: scaffold /reportes page + sidebar entry"
```

---

## Task 2: Core types, storage, grouping, and filtering

**Files:**
- Modify: `app/reportes/ReportesClient.tsx`

This task adds all the types, constants, pure functions, and localStorage helpers. No UI yet.

- [ ] **Step 1: Replace the stub with full types and utilities**

Replace the entire content of `app/reportes/ReportesClient.tsx` with:

```typescript
'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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

// ─── Main component (stub — UI added in later tasks) ─────────────────────────

export default function ReportesClient({
  initialItems,
  liveData,
  extraColumns,
}: {
  initialItems: CIPLItemRow[]
  liveData:     LiveDataMap
  extraColumns: ExtraColumn[]
}) {
  const [tiles, setTiles] = useState<ReportTileConfig[]>([])
  useEffect(() => { setTiles(loadTiles()) }, [])

  const updateTiles = useCallback((next: ReportTileConfig[]) => {
    setTiles(next); saveTiles(next)
  }, [])

  const hasLive = Object.keys(liveData).length > 0

  return (
    <div className="space-y-4">
      <p className="text-zinc-400 text-sm">
        {initialItems.length} ítems · {tiles.length} tiles · live={String(hasLive)}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/reportes/ReportesClient.tsx
git commit -m "feat: reportes — types, storage, grouping, filter utilities"
```

---

## Task 3: Dashboard shell

**Files:**
- Modify: `app/reportes/ReportesClient.tsx`

Add the grid layout, empty state, header with "Nuevo reporte" button, and the "+" placeholder tile. No drawer or tile component yet — the button just logs.

- [ ] **Step 1: Replace the main component body**

Replace the `export default function ReportesClient` function (keep everything above it intact) with:

```typescript
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
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify visually**

Navigate to `/reportes`. Should show empty state with "Crear el primero" button. No tiles yet. Button click should do nothing visible (drawer overlay is there but empty).

- [ ] **Step 4: Commit**

```bash
git add app/reportes/ReportesClient.tsx
git commit -m "feat: reportes — dashboard shell with grid and empty state"
```

---

## Task 4: ConfigDrawer component

**Files:**
- Modify: `app/reportes/ReportesClient.tsx`

Add the `ConfigDrawer` component and wire it into the main component.

- [ ] **Step 1: Add ConfigDrawer before the main component**

Add this component before `export default function ReportesClient`:

```typescript
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
```

- [ ] **Step 2: Wire ConfigDrawer into the main component**

In `ReportesClient`, replace the drawer placeholder comment:
```typescript
{/* Drawer placeholder */}
{drawerCfg && (
  <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setDrawerCfg(null)} />
)}
```

with:
```typescript
{drawerCfg && (
  <ConfigDrawer
    cfg={drawerCfg}
    extraColumns={extraColumns}
    onSave={saveDrawer}
    onClose={() => setDrawerCfg(null)}
  />
)}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Verify visually**

Navigate to `/reportes`. Click "Nuevo reporte" → drawer slides in from the right with group-by selector, date filters, tipo filter, search, and column toggles. Click backdrop or Escape closes it. Click "Guardar reporte" should add a placeholder tile to the grid.

- [ ] **Step 5: Commit**

```bash
git add app/reportes/ReportesClient.tsx
git commit -m "feat: reportes — ConfigDrawer component"
```

---

## Task 5: TileCard component

**Files:**
- Modify: `app/reportes/ReportesClient.tsx`

Replace `TilePlaceholder` with the real `TileCard` that renders totals strip + grouped table.

- [ ] **Step 1: Replace TilePlaceholder with TileCard**

Find and replace the `TilePlaceholder` function (everything from `function TilePlaceholder` to its closing `}`) with:

```typescript
const TRUNCATE_GROUPS = 5

function TileCard({
  cfg,
  items,
  liveData,
  extraColumns,
  onEdit,
  onDelete,
  onExpand,
}: {
  cfg:          ReportTileConfig
  items:        CIPLItemRow[]
  liveData:     LiveDataMap
  extraColumns: ExtraColumn[]
  onEdit:       () => void
  onDelete:     () => void
  onExpand:     () => void
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
          <button title="Exportar Excel" className="hover:text-emerald-600 transition-colors text-[10px] font-semibold">xlsx</button>
          <button title="Exportar PDF"   className="hover:text-red-600    transition-colors text-[10px] font-semibold">pdf</button>
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
                    // For summary columns use the group totals directly
                    let display: string
                    if      (fieldKey === 'qty')     display = group.totalQty.toLocaleString('es-AR')
                    else if (fieldKey === 'qBultos') display = group.totalBultos.toLocaleString('es-AR')
                    else if (fieldKey === 'cbm')     display = String(group.totalCbm)
                    else if (fieldKey === 'gwKg')    display = String(group.totalGw)
                    else {
                      // Use first non-null value from group items
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
```

- [ ] **Step 2: Update the grid to use TileCard instead of TilePlaceholder**

In the grid inside `ReportesClient`, replace:
```typescript
{tiles.map(cfg => (
  <TilePlaceholder
    key={cfg.id}
    cfg={cfg}
    onEdit={() => openEditDrawer(cfg)}
    onDelete={() => deleteTile(cfg.id)}
    onExpand={() => setExpandedId(cfg.id)}
  />
))}
```
with:
```typescript
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
  />
))}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Verify visually**

Add a report via the drawer. Should see: header with title + filter chips, totals strip (4 numbers), grouped table. Try grouping by ASN, PI, Categoría. Verify totals add up correctly.

- [ ] **Step 5: Commit**

```bash
git add app/reportes/ReportesClient.tsx
git commit -m "feat: reportes — TileCard with totals and grouped table"
```

---

## Task 6: ExpandedModal component

**Files:**
- Modify: `app/reportes/ReportesClient.tsx`

Add the full-screen modal that shows when clicking ⊞ on a tile.

- [ ] **Step 1: Add ExpandedModal before TileCard**

Add this component before `TileCard`:

```typescript
function ExpandedModal({
  cfg,
  items,
  liveData,
  extraColumns,
  onClose,
  onExportXlsx,
  onExportPdf,
}: {
  cfg:           ReportTileConfig
  items:         CIPLItemRow[]
  liveData:      LiveDataMap
  extraColumns:  ExtraColumn[]
  onClose:       () => void
  onExportXlsx:  () => void
  onExportPdf:   () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col">
      {/* Modal header */}
      <div className="bg-white border-b border-zinc-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <span className="text-base font-bold text-zinc-800">{tileTitle(cfg)}</span>
          <span className="ml-2 text-xs text-zinc-400">{groups.length} grupos · {filtered.length} ítems</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onExportXlsx} className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors">
            <FileSpreadsheet className="w-3.5 h-3.5" />xlsx
          </button>
          <button onClick={onExportPdf} className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors">
            <FileText className="w-3.5 h-3.5" />pdf
          </button>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Totals strip */}
      <div className="bg-white border-b border-zinc-100 flex flex-shrink-0">
        {[
          { label: 'Qty',    value: totalQty.toLocaleString('es-AR'),    color: 'text-emerald-700' },
          { label: 'Bultos', value: totalBultos.toLocaleString('es-AR'), color: 'text-sky-700'     },
          { label: 'CBM',    value: `${totalCbm}`,                       color: 'text-orange-700'  },
          { label: 'GW kg',  value: `${totalGw}`,                        color: 'text-amber-700'   },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex-1 flex flex-col items-center py-3 border-r last:border-r-0 border-zinc-50">
            <span className={`text-base font-bold tabular-nums ${color}`}>{value}</span>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400 mt-0.5">{label}</span>
          </div>
        ))}
      </div>

      {/* Table — full height, scrollable */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zinc-50 z-10">
            <tr>
              <th className="text-left px-6 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wide whitespace-nowrap border-b border-zinc-100">
                {GROUP_BY_OPTIONS.find(o => o.key === cfg.groupBy)?.label ?? cfg.groupBy}
              </th>
              {colDefs.map(col => (
                <th key={col.fieldKey} className="text-right px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wide whitespace-nowrap border-b border-zinc-100">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <tr key={group.key} className="border-b border-zinc-50 hover:bg-zinc-50/50">
                <td className="px-6 py-3 font-medium text-zinc-700">{group.key}</td>
                {colDefs.map(col => {
                  const fieldKey = col.fieldKey
                  let display: string
                  if      (fieldKey === 'qty')     display = group.totalQty.toLocaleString('es-AR')
                  else if (fieldKey === 'qBultos') display = group.totalBultos.toLocaleString('es-AR')
                  else if (fieldKey === 'cbm')     display = String(group.totalCbm)
                  else if (fieldKey === 'gwKg')    display = String(group.totalGw)
                  else {
                    const first = group.items.find(i => getCellValue(i, fieldKey, liveData) !== '—')
                    display = first ? getCellValue(first, fieldKey, liveData) : '—'
                  }
                  const isDemorado = fieldKey === '_diasTransito' && display === '⚠ demorado'
                  return (
                    <td key={fieldKey} className={`px-4 py-3 text-right whitespace-nowrap ${isDemorado ? 'text-red-500 font-semibold' : 'text-zinc-600'}`}>
                      {display}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add export stubs and wire ExpandedModal into ReportesClient**

In `ReportesClient`, add these stubs just before the `return`:

```typescript
const exportXlsx = useCallback((cfg: ReportTileConfig) => {
  // implemented in Task 7
  console.log('export xlsx', cfg.id)
}, [initialItems, liveData])

const exportPdf = useCallback((cfg: ReportTileConfig) => {
  // implemented in Task 8
  console.log('export pdf', cfg.id)
}, [initialItems, liveData])
```

At the end of the JSX (before closing `</div>`), add:

```typescript
{/* Expanded modal */}
{expandedId && (() => {
  const cfg = tiles.find(t => t.id === expandedId)
  if (!cfg) return null
  return (
    <ExpandedModal
      cfg={cfg}
      items={initialItems}
      liveData={liveData}
      extraColumns={extraColumns}
      onClose={() => setExpandedId(null)}
      onExportXlsx={() => exportXlsx(cfg)}
      onExportPdf={() => exportPdf(cfg)}
    />
  )
})()}
```

- [ ] **Step 3: Wire expand buttons in TileCard**

In `TileCard`, the xlsx/pdf buttons are stubs. They'll be wired through `onExportXlsx`/`onExportPdf` props in Task 7/8. For now just update the TileCard signature to accept them:

```typescript
function TileCard({
  cfg, items, liveData, extraColumns, onEdit, onDelete, onExpand, onExportXlsx, onExportPdf,
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
})
```

And update the xlsx/pdf buttons in TileCard:
```typescript
<button onClick={onExportXlsx} title="Exportar Excel" className="hover:text-emerald-600 transition-colors text-[10px] font-semibold">xlsx</button>
<button onClick={onExportPdf}  title="Exportar PDF"   className="hover:text-red-600    transition-colors text-[10px] font-semibold">pdf</button>
```

And update the TileCard usages in the grid:
```typescript
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
    onExportXlsx={() => exportXlsx(cfg)}
    onExportPdf={() => exportPdf(cfg)}
  />
))}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Verify visually**

Click ⊞ on a tile → full-screen modal with all groups visible, scrollable. Escape or ✕ closes it.

- [ ] **Step 6: Commit**

```bash
git add app/reportes/ReportesClient.tsx
git commit -m "feat: reportes — ExpandedModal full-screen overlay"
```

---

## Task 7: Excel export

**Files:**
- Modify: `app/reportes/ReportesClient.tsx`

Replace the `exportXlsx` stub with real xlsx generation.

- [ ] **Step 1: Replace the exportXlsx stub**

Replace:
```typescript
const exportXlsx = useCallback((cfg: ReportTileConfig) => {
  // implemented in Task 7
  console.log('export xlsx', cfg.id)
}, [initialItems, liveData])
```

with:

```typescript
const exportXlsx = useCallback((cfg: ReportTileConfig) => {
  const filtered = applyFilters(initialItems, cfg.filters)
  const groups   = buildGroups(filtered, cfg.groupBy)

  const allCols: ColDef[] = [
    ...FIXED_COLS,
    ...extraColumns.map(c => ({ fieldKey: c.fieldKey, label: c.label, category: 'calc' as ColCategory })),
  ]
  const colDefs = cfg.columns
    .map(fk => allCols.find(c => c.fieldKey === fk))
    .filter(Boolean) as ColDef[]

  const groupLabel = GROUP_BY_OPTIONS.find(o => o.key === cfg.groupBy)?.label ?? cfg.groupBy
  const headers = [groupLabel, ...colDefs.map(c => c.label)]

  const rows: (string | number)[][] = []

  for (const group of groups) {
    const row: (string | number)[] = [group.key]
    for (const col of colDefs) {
      const fk = col.fieldKey
      if      (fk === 'qty')     row.push(group.totalQty)
      else if (fk === 'qBultos') row.push(group.totalBultos)
      else if (fk === 'cbm')     row.push(group.totalCbm)
      else if (fk === 'gwKg')    row.push(group.totalGw)
      else {
        const first = group.items.find(i => getCellValue(i, fk, liveData) !== '—')
        row.push(first ? getCellValue(first, fk, liveData) : '')
      }
    }
    rows.push(row)
  }

  // Totals row
  const totalsRow: (string | number)[] = ['TOTAL']
  for (const col of colDefs) {
    const fk = col.fieldKey
    if      (fk === 'qty')     totalsRow.push(groups.reduce((s, g) => s + g.totalQty,    0))
    else if (fk === 'qBultos') totalsRow.push(groups.reduce((s, g) => s + g.totalBultos, 0))
    else if (fk === 'cbm')     totalsRow.push(+groups.reduce((s, g) => s + g.totalCbm,   0).toFixed(4))
    else if (fk === 'gwKg')    totalsRow.push(+groups.reduce((s, g) => s + g.totalGw,    0).toFixed(2))
    else totalsRow.push('')
  }
  rows.push(totalsRow)

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, tileTitle(cfg).slice(0, 31))

  const date = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `reporte-${cfg.groupBy}-${date}.xlsx`)
}, [initialItems, extraColumns, liveData])
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify**

Click `xlsx` on a tile or in the expanded modal → `.xlsx` file downloads. Open it — should have headers row, one row per group, and a TOTAL row at the bottom.

- [ ] **Step 4: Commit**

```bash
git add app/reportes/ReportesClient.tsx
git commit -m "feat: reportes — Excel export per tile"
```

---

## Task 8: PDF export

**Files:**
- Modify: `app/reportes/ReportesClient.tsx`

Replace the `exportPdf` stub with a `window.open` + print approach.

- [ ] **Step 1: Replace the exportPdf stub**

Replace:
```typescript
const exportPdf = useCallback((cfg: ReportTileConfig) => {
  // implemented in Task 8
  console.log('export pdf', cfg.id)
}, [initialItems, liveData])
```

with:

```typescript
const exportPdf = useCallback((cfg: ReportTileConfig) => {
  const filtered = applyFilters(initialItems, cfg.filters)
  const groups   = buildGroups(filtered, cfg.groupBy)

  const allCols: ColDef[] = [
    ...FIXED_COLS,
    ...extraColumns.map(c => ({ fieldKey: c.fieldKey, label: c.label, category: 'calc' as ColCategory })),
  ]
  const colDefs = cfg.columns
    .map(fk => allCols.find(c => c.fieldKey === fk))
    .filter(Boolean) as ColDef[]

  const groupLabel = GROUP_BY_OPTIONS.find(o => o.key === cfg.groupBy)?.label ?? cfg.groupBy
  const date = new Date().toLocaleDateString('es-AR')

  const theadCells = [`<th style="text-align:left">${groupLabel}</th>`, ...colDefs.map(c => `<th style="text-align:right">${c.label}</th>`)].join('')

  const tbodyRows = groups.map(group => {
    const cells = colDefs.map(col => {
      const fk = col.fieldKey
      let val: string
      if      (fk === 'qty')     val = group.totalQty.toLocaleString('es-AR')
      else if (fk === 'qBultos') val = group.totalBultos.toLocaleString('es-AR')
      else if (fk === 'cbm')     val = String(group.totalCbm)
      else if (fk === 'gwKg')    val = String(group.totalGw)
      else {
        const first = group.items.find(i => getCellValue(i, fk, liveData) !== '—')
        val = first ? getCellValue(first, fk, liveData) : '—'
      }
      return `<td style="text-align:right">${val}</td>`
    }).join('')
    return `<tr><td>${group.key}</td>${cells}</tr>`
  }).join('')

  const totalQty    = groups.reduce((s, g) => s + g.totalQty,    0)
  const totalBultos = groups.reduce((s, g) => s + g.totalBultos, 0)
  const totalCbm    = +groups.reduce((s, g) => s + g.totalCbm,   0).toFixed(4)
  const totalGw     = +groups.reduce((s, g) => s + g.totalGw,    0).toFixed(2)

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${tileTitle(cfg)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
  h2 { font-size: 14px; margin-bottom: 4px; }
  p  { color: #666; font-size: 10px; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #f4f4f4; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #ddd; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  tr.totals { font-weight: bold; border-top: 2px solid #ccc; }
  .kpis { display: flex; gap: 24px; margin-bottom: 16px; }
  .kpi  { text-align: center; }
  .kpi-val { font-size: 18px; font-weight: bold; }
  .kpi-lbl { font-size: 9px; color: #999; text-transform: uppercase; }
</style>
</head><body>
<h2>${tileTitle(cfg)}</h2>
<p>${groups.length} grupos · ${filtered.length} ítems · generado ${date}</p>
<div class="kpis">
  <div class="kpi"><div class="kpi-val">${totalQty.toLocaleString('es-AR')}</div><div class="kpi-lbl">Qty</div></div>
  <div class="kpi"><div class="kpi-val">${totalBultos.toLocaleString('es-AR')}</div><div class="kpi-lbl">Bultos</div></div>
  <div class="kpi"><div class="kpi-val">${totalCbm}</div><div class="kpi-lbl">CBM</div></div>
  <div class="kpi"><div class="kpi-val">${totalGw}</div><div class="kpi-lbl">GW kg</div></div>
</div>
<table><thead><tr>${theadCells}</tr></thead><tbody>${tbodyRows}
<tr class="totals"><td>TOTAL</td>${colDefs.map(col => {
    const fk = col.fieldKey
    if      (fk === 'qty')     return `<td style="text-align:right">${totalQty.toLocaleString('es-AR')}</td>`
    else if (fk === 'qBultos') return `<td style="text-align:right">${totalBultos.toLocaleString('es-AR')}</td>`
    else if (fk === 'cbm')     return `<td style="text-align:right">${totalCbm}</td>`
    else if (fk === 'gwKg')    return `<td style="text-align:right">${totalGw}</td>`
    else return '<td></td>'
  }).join('')}
</tr>
</tbody></table>
<script>window.onload=function(){window.print();}</script>
</body></html>`

  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}, [initialItems, extraColumns, liveData])
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify**

Click `pdf` on a tile → new browser tab opens with a clean table, then browser print dialog appears automatically.

- [ ] **Step 4: Commit**

```bash
git add app/reportes/ReportesClient.tsx
git commit -m "feat: reportes — PDF export via window.open + print"
```

---

## Task 9: Cleanup Panel General

**Files:**
- Modify: `app/panel-general/PanelGeneralClient.tsx`

Remove the flexible groupBy/report code. Keep ASN grouping but simplify it.

- [ ] **Step 1: Remove PanelGroupByField, PANEL_GROUP_OPTIONS, buildPanelReportGroups, GPill**

Find and delete lines 705–755 (the entire block from `// ─── Report / grouping types` through the closing `}` of `GPill`):

```
// ─── Report / grouping types ──────────────────────────────────────────────────

type PanelGroupByField = ...
const PANEL_GROUP_OPTIONS = ...
function buildPanelReportGroups(...) { ... }

// ─── Panel General TotalPill ──────────────────────────────────────────────────
function GPill(...) { ... }
```

- [ ] **Step 2: Replace reportGroupBy state with groupByAsn**

Find:
```typescript
const [reportGroupBy, setReportGroupBy]   = useState<PanelGroupByField | null>(null)
```
Replace with:
```typescript
const [groupByAsn, setGroupByAsn] = useState(false)
```

- [ ] **Step 3: Update asnGroups useMemo**

Find:
```typescript
  const asnGroups = useMemo(
    () => buildPanelReportGroups(filteredItems, 'asn'),
```
Replace with:
```typescript
  const asnGroups = useMemo(
    () => {
      if (!groupByAsn) return []
      const map = new Map<string, Item[]>()
      for (const item of filteredItems) {
        const key = item.asn ?? '(sin ASN)'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(item)
      }
      const seen = new Set<string>()
      return [...map.entries()].map(([key, grpItems]) => {
        const primaryItems = grpItems.filter(i => {
          const k = i.caseNo ?? i.id
          if (seen.has(k)) return false
          seen.add(k); return true
        })
        const sos = [...new Set(grpItems.flatMap(i => [i.soPrincipal, i.soSecundario]).filter(Boolean) as string[])]
        const piNos = [...new Set(grpItems.map(i => i.piNo).filter(Boolean) as string[])]
        const tipo  = grpItems[0]?.tipoCarga ?? ''
        const categories = [...new Set(grpItems.map(i => i.categoryName).filter(Boolean) as string[])]
        return {
          key, items: grpItems, sos, piNos, tipo, categories,
          totalQty:    grpItems.reduce((s, i) => s + (i.qty    ?? 0), 0),
          totalBultos: primaryItems.reduce((s, i) => s + (i.qBultos ?? 0), 0),
          totalCbm:    +primaryItems.reduce((s, i) => s + (i.cbm   ?? 0), 0).toFixed(4),
          totalGw:     +primaryItems.reduce((s, i) => s + (i.gwKg  ?? 0), 0).toFixed(2),
        }
      })
    },
```

- [ ] **Step 4: Remove reportGroups useMemo**

Find and delete:
```typescript
  const reportGroups = useMemo(
    () => (reportGroupBy && reportGroupBy !== 'asn') ? buildPanelReportGroups(filteredItems, reportGroupBy) : [],
    [filteredItems, reportGroupBy]
  )
```

- [ ] **Step 5: Replace the groupBy select in toolbar with a simple Layers toggle**

Find (approximately lines 1249–1268):
```typescript
        <div className={`${selected.size > 0 ? '' : 'ml-auto'} flex items-center gap-2`}>
          <div className="flex items-center gap-2">
            {reportGroupBy !== null
              ? <BarChart2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              : <Layers className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            }
            <select
              value={reportGroupBy ?? ''}
              onChange={e => setReportGroupBy((e.target.value || null) as PanelGroupByField | null)}
              className={...}
            >
              <option value="">Sin agrupación</option>
              {PANEL_GROUP_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
```

Replace with:
```typescript
        <div className={`${selected.size > 0 ? '' : 'ml-auto'} flex items-center gap-2`}>
          <button
            onClick={() => setGroupByAsn(v => !v)}
            title={groupByAsn ? 'Quitar agrupación' : 'Agrupar por ASN'}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-medium transition-colors ${
              groupByAsn
                ? 'border-amber-400 bg-amber-50 text-amber-700'
                : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Agrupar ASN
          </button>
```

- [ ] **Step 6: Update ASN grouped view condition and remove grand total bar**

Find:
```typescript
      {/* ASN Grouped View */}
      {reportGroupBy === 'asn' && (
```
Replace with:
```typescript
      {/* ASN Grouped View */}
      {groupByAsn && (
```

Inside the ASN grouped view block, find and delete the grand total bar section:
```typescript
          {/* Grand total bar */}
          {asnGroups.length > 0 && (() => {
            const gQty = ...
            ...
            return (
              <div className="bg-amber-50 border border-amber-100 ...">
                ...
              </div>
            )
          })()}
```
(Delete from `{/* Grand total bar */}` through the closing `})()}` of the IIFE.)

- [ ] **Step 7: Remove Generic Report View**

Find and delete the entire block:
```typescript
      {/* Generic Report View (non-ASN groupings) */}
      {reportGroupBy !== null && reportGroupBy !== 'asn' && (
        ...
      )}
```
(From the comment through its closing `)}`)

- [ ] **Step 8: Remove BarChart2 from imports if no longer used**

Check if `BarChart2` is still referenced anywhere in the file:
```bash
grep -n "BarChart2" /workspaces/Panel-Compras/app/panel-general/PanelGeneralClient.tsx
```
If no references remain, remove it from the import line at the top.

- [ ] **Step 9: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 10: Verify visually**

Open Panel General. Should show the normal table view. "Agrupar ASN" button in toolbar; clicking it shows the ASN-grouped view (without grand totals bar). No generic groupBy dropdown.

- [ ] **Step 11: Commit**

```bash
git add app/panel-general/PanelGeneralClient.tsx
git commit -m "refactor: panel-general — remove flexible groupBy, keep simple ASN toggle"
```

---

## Task 10: Cleanup Comex Tracking

**Files:**
- Modify: `app/comex/ComexClient.tsx`

Remove the report view (ReportView component, GroupByField types, TotalPill, reporte view mode).

- [ ] **Step 1: Remove GroupByField, GROUP_BY_OPTIONS, ReportGroup, buildReportGroups**

Find and delete lines 29–64:
```typescript
type GroupByField = 'asn' | 'piNo' | ...
const GROUP_BY_OPTIONS: ...
type ReportGroup = { ... }
function buildReportGroups(items: Item[], groupBy: GroupByField): ReportGroup[] { ... }
```

- [ ] **Step 2: Remove TotalPill and ReportView components**

Find and delete the block from `// ─── TotalPill helper` through the closing `}` of `ReportView` (lines ~520–869 in the original file — it ends just before `export type ComexKpis`).

- [ ] **Step 3: Change view state type**

Find:
```typescript
  const [view,            setView]            = useState<'timeline' | 'list' | 'reporte'>('timeline')
  const [groupBy,         setGroupBy]         = useState<GroupByField>('asn')
```
Replace with:
```typescript
  const [view, setView] = useState<'timeline' | 'list'>('timeline')
```

- [ ] **Step 4: Remove group-by selector from toolbar**

Find and delete:
```typescript
        {/* Group-by selector — only in reporte view */}
        {view === 'reporte' && (
          <div className="flex items-center gap-2 ml-auto">
            <span ...>Agrupar por</span>
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as GroupByField)}
              ...
            >
              {GROUP_BY_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
        )}
```

- [ ] **Step 5: Update view mode buttons to remove reporte**

Find the view-mode button group (the three buttons for timeline / list / reporte). It looks approximately like:

```typescript
        <div className={`${view === 'list' ? '' : view === 'reporte' ? '' : 'ml-auto'} flex items-center gap-1 bg-zinc-100 rounded-xl p-1`}>
```

Change the className to:
```typescript
        <div className={`${view === 'list' ? '' : 'ml-auto'} flex items-center gap-1 bg-zinc-100 rounded-xl p-1`}>
```

Then find and delete the BarChart2 reporte button:
```typescript
              <button
                onClick={() => setView('reporte')}
                className={... view === 'reporte' ? '...' : '...'}
              >
                <BarChart2 className="w-3.5 h-3.5" />
              </button>
```

- [ ] **Step 6: Remove reporte render block**

Find and delete:
```typescript
      ) : view === 'reporte' ? (
        <ReportView
          items={bySearch}
          extraColumns={extraColumns.filter(c => visibleExtraCols.has(c.fieldKey))}
          liveData={liveData}
          visibleLogCols={visibleLogCols}
          groupBy={groupBy}
        />
```
(and its closing `)`/`:`)

The ternary chain `view === 'timeline' ? (...) : view === 'reporte' ? (...) : (...)` becomes `view === 'timeline' ? (...) : (...)`.

- [ ] **Step 7: Remove BarChart2 from imports if unused**

```bash
grep -n "BarChart2" /workspaces/Panel-Compras/app/comex/ComexClient.tsx
```
If no remaining references, remove from the import line.

- [ ] **Step 8: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 9: Verify visually**

Open Comex Tracking. Timeline and list views work normally. No "Reporte" button in the toolbar.

- [ ] **Step 10: Commit**

```bash
git add app/comex/ComexClient.tsx
git commit -m "refactor: comex — remove ReportView, groupBy, TotalPill"
```

---

## Final: TypeScript check + deploy

- [ ] **Full TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors across all files.

- [ ] **Deploy**

```bash
npx vercel deploy --prod --yes
```

- [ ] **Smoke test production**

1. `/reportes` — create 2–3 tiles with different groupings. Confirm they survive page reload. Delete one.
2. Expand a tile with ⊞ — full-screen modal, Escape closes it.
3. Export xlsx — file downloads with correct data.
4. Export PDF — new tab opens, print dialog appears.
5. `/panel-general` — "Agrupar ASN" button works, no groupBy dropdown.
6. `/comex` — no Reporte button, timeline/list work.
