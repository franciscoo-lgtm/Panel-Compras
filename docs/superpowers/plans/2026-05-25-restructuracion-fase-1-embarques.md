# Restructuración Fase 1 — Embarques + Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new Embarques module as the central viewing experience of the system, with split shipment support, premium UI, consolidated CIPL export, and minimal KPI home — leaving the old modules in parallel for safe rollback.

**Architecture:** A new pure-function library (`app/lib/embarques.ts`) computes Embarque views by parsing the Comex Google Sheet (with comma-separated splits) and joining against `CIPLItem` records. UI is built with the existing shadcn + Tailwind v4 stack, adding shared base components (StatusPill, KPICard, DateRange, MoneyValue, DataTable) for consistency. Old modules remain functional until Fase 3 cleanup.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (Neon Postgres), TypeScript 5, Tailwind v4, shadcn/ui, Lucide icons, recharts (later phases), xlsx for Excel export.

**Scope of this plan:** Fase 1 only. Fase 2 (Carga CIPL stepper + IA + Control con acciones) and Fase 3 (Dashboard completo + cmd+k + cleanup) son planes separados a escribirse después de validar Fase 1.

**Validation strategy:** Manual smoke tests at each task (no test framework per spec section 14). Pure functions get inline `npx tsx` sanity checks where useful.

---

## File Structure

### New files (Fase 1)
- `app/lib/comex.ts` — simplified Comex sheet fetcher with split parser
- `app/lib/embarques.ts` — Embarque computed view builder
- `app/lib/roles.ts` — role checking helpers + middleware integration
- `app/embarques/page.tsx` — list page (server)
- `app/embarques/EmbarquesListClient.tsx` — interactive filterable list
- `app/embarques/[embarqueNo]/page.tsx` — detail page (server)
- `app/embarques/[embarqueNo]/EmbarqueDetailClient.tsx` — tabs container
- `app/embarques/[embarqueNo]/tabs/ResumenTab.tsx`
- `app/embarques/[embarqueNo]/tabs/ItemsTab.tsx`
- `app/embarques/[embarqueNo]/tabs/ControlTab.tsx`
- `app/embarques/[embarqueNo]/tabs/FotosTab.tsx`
- `app/embarques/[embarqueNo]/tabs/ComprasTab.tsx`
- `app/api/embarques/[embarqueNo]/export/route.ts`
- `components/shared/StatusPill.tsx`
- `components/shared/KPICard.tsx`
- `components/shared/DateRange.tsx`
- `components/shared/MoneyValue.tsx`
- `components/shared/EmbarqueChip.tsx`

### Modified files (Fase 1)
- `lib/exportCipl.ts` — extend to accept multiple CIPLItems for consolidated export
- `components/sidebar.tsx` — add Embarques link with "Nuevo" badge, mark legacy modules
- `app/page.tsx` — replace with minimal Home (4 KPI cards + alerts list, no charts yet)
- `app/layout.tsx` — verify font stack matches spec design language (Inter Tight + Inter)

### Untouched (preserved for legacy modules)
- `app/lib/comex-sources.ts` — keeps powering `/panel-general`, `/comex`, `/reportes` until Fase 3 cleanup

---

## Task 1: Add Inter Tight + Inter fonts and design tokens

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Edit `app/layout.tsx` to load both fonts via next/font**

Replace existing font imports with:

```tsx
import { Inter, Inter_Tight } from 'next/font/google'

const interBody = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const interDisplay = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['500', '600', '700'],
})
```

Apply both variables to `<html>` className: `${interBody.variable} ${interDisplay.variable}`.

- [ ] **Step 2: Add semantic color tokens in `app/globals.css`**

Add inside the `@theme inline` block (next to the existing DJI tokens):

```css
--color-status-ok: #10b981;
--color-status-warn: #f59e0b;
--color-status-error: #ef4444;
--color-status-info: #3b82f6;
--color-status-purple: #8b5cf6;
--color-surface-0: #050505;
--color-surface-1: #0a0a0a;
--color-surface-2: #0d0d0d;
--color-surface-3: #111111;
--color-border-subtle: rgba(255, 255, 255, 0.06);
--color-border-default: rgba(255, 255, 255, 0.12);
```

- [ ] **Step 3: Smoke test**

Run `npx tsc --noEmit` — expect zero errors.
Run `npm run dev`, open `http://localhost:3000`, confirm in DevTools that body uses Inter and headings can use `font-display`.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat(ui): cargar Inter + Inter Tight y agregar tokens semánticos de estado"
```

---

## Task 2: Build shared base UI components

**Files:**
- Create: `components/shared/StatusPill.tsx`
- Create: `components/shared/KPICard.tsx`
- Create: `components/shared/DateRange.tsx`
- Create: `components/shared/MoneyValue.tsx`
- Create: `components/shared/EmbarqueChip.tsx`

- [ ] **Step 1: Create `components/shared/StatusPill.tsx`**

```tsx
import { cn } from '@/lib/utils'

export type EmbarqueEstado = 'pendiente' | 'en-transito' | 'arribado' | 'desconocido'

const CONFIG: Record<EmbarqueEstado, { label: string; cls: string }> = {
  'pendiente':    { label: 'Pendiente',   cls: 'bg-amber-500/15  text-amber-400  border-amber-500/30' },
  'en-transito':  { label: 'En tránsito', cls: 'bg-blue-500/15   text-blue-400   border-blue-500/30'  },
  'arribado':     { label: 'Arribado',    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  'desconocido':  { label: 'Sin tracking',cls: 'bg-zinc-500/10   text-zinc-400   border-zinc-500/20'  },
}

export function StatusPill({ estado, className }: { estado: EmbarqueEstado; className?: string }) {
  const c = CONFIG[estado]
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border',
      c.cls, className,
    )}>
      {c.label}
    </span>
  )
}
```

- [ ] **Step 2: Create `components/shared/KPICard.tsx`**

```tsx
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

type Props = {
  label: string
  value: string
  delta?: number | null    // percentage vs previous period
  hint?: string            // secondary explanation under value
  accent?: 'red' | 'blue' | 'emerald' | 'amber' | 'zinc'
}

const ACCENT: Record<NonNullable<Props['accent']>, string> = {
  red:     'border-l-[#E30613]',
  blue:    'border-l-blue-500',
  emerald: 'border-l-emerald-500',
  amber:   'border-l-amber-500',
  zinc:    'border-l-zinc-700',
}

export function KPICard({ label, value, delta, hint, accent = 'zinc' }: Props) {
  const TrendIcon = delta == null ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const trendCls = delta == null ? 'text-zinc-500' : delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-zinc-500'
  return (
    <div className={cn(
      'bg-[#0d0d0d] border border-white/[0.06] border-l-4 rounded-lg p-4 transition-colors hover:bg-[#111]',
      ACCENT[accent],
    )}>
      <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold mb-2">{label}</p>
      <p className="text-2xl font-display font-bold text-white tabular-nums leading-tight">{value}</p>
      <div className="mt-2 flex items-center gap-1.5 text-[11px]">
        <TrendIcon className={cn('w-3.5 h-3.5', trendCls)} />
        {delta != null && <span className={trendCls}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>}
        {hint && <span className="text-zinc-500">{hint}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `components/shared/DateRange.tsx`**

```tsx
function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function DateRange({ etd, eta }: { etd: string | null; eta: string | null }) {
  return (
    <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
      {fmt(etd)} <span className="text-zinc-600">→</span> {fmt(eta)}
    </span>
  )
}
```

- [ ] **Step 4: Create `components/shared/MoneyValue.tsx`**

```tsx
import { cn } from '@/lib/utils'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function MoneyValue({ usd, className }: { usd: number; className?: string }) {
  return (
    <span className={cn('tabular-nums', className)}>{fmt.format(usd)}</span>
  )
}
```

- [ ] **Step 5: Create `components/shared/EmbarqueChip.tsx`**

```tsx
import Link from 'next/link'
import { cn } from '@/lib/utils'

export function EmbarqueChip({ embarqueNo, className }: { embarqueNo: string; className?: string }) {
  return (
    <Link
      href={`/embarques/${encodeURIComponent(embarqueNo)}`}
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-medium',
        'bg-white/[0.04] text-zinc-300 border border-white/[0.06]',
        'hover:bg-[#E30613]/10 hover:text-white hover:border-[#E30613]/30 transition-colors',
        className,
      )}
    >
      {embarqueNo}
    </Link>
  )
}
```

- [ ] **Step 6: Smoke test**

Run `npx tsc --noEmit` — expect zero errors.

- [ ] **Step 7: Commit**

```bash
git add components/shared/
git commit -m "feat(ui): componentes base compartidos (StatusPill, KPICard, DateRange, MoneyValue, EmbarqueChip)"
```

---

## Task 3: Build `app/lib/comex.ts` — Comex fetcher with split-shipment parser

**Files:**
- Create: `app/lib/comex.ts`

The new module replaces the multi-source complexity of `comex-sources.ts` with a single configured sheet, single join column (SO), and split-aware row parsing.

- [ ] **Step 1: Create `app/lib/comex.ts`**

```ts
'use server'

import { prisma } from '@/lib/prisma'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComexConfig = {
  url: string                  // browser URL of the Google Sheet
  sheetName?: string           // exact tab name
  joinCol: string              // header that contains SO numbers
  embarqueCol: string          // header that contains N° Embarque
  extraCols: { header: string; label: string }[]  // additional columns to expose
}

export type ComexShipment = {
  embarqueNo: string
  extras: Record<string, string | null>   // every value for this slice of the row
}

export type ComexSORow = {
  so: string
  shipments: ComexShipment[]   // one per embarque in the split
}

export type ComexData = {
  bySO: Map<string, ComexSORow>
  byEmbarque: Map<string, Set<string>>  // embarqueNo → set of SOs
  extraColumns: { fieldKey: string; label: string }[]
  fetchedAt: Date
  errors: string[]
}

const CONFIG_KEY = 'COMEX_CONFIG'
const LEGACY_KEY = 'COMEX_SOURCES'   // old format from comex-sources.ts

// ─── Config persistence ───────────────────────────────────────────────────────

export async function getComexConfig(): Promise<ComexConfig | null> {
  // Try new format first
  const cfg = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEY } })
  if (cfg) {
    try { return JSON.parse(cfg.value) as ComexConfig } catch { return null }
  }

  // Fallback: migrate from legacy COMEX_SOURCES (first enabled source with joinOn='so')
  const legacy = await prisma.appConfig.findUnique({ where: { key: LEGACY_KEY } })
  if (!legacy) return null
  try {
    const sources = JSON.parse(legacy.value) as Array<{
      url: string; sheetName?: string; enabled: boolean
      joinOn?: string; mappings: { sheetHeader: string; fieldKey: string; label: string; isJoin: boolean }[]
    }>
    const first = sources.find(s => s.enabled && (s.joinOn ?? 'so') === 'so')
    if (!first) return null
    const joinMap = first.mappings.find(m => m.isJoin)
    if (!joinMap) return null
    const embarqueMap = first.mappings.find(m => m.fieldKey === 'embarqueNo' || m.label.toLowerCase().includes('embarque'))
    return {
      url: first.url,
      sheetName: first.sheetName,
      joinCol: joinMap.sheetHeader,
      embarqueCol: embarqueMap?.sheetHeader ?? 'N° Embarque',
      extraCols: first.mappings
        .filter(m => !m.isJoin && m !== embarqueMap)
        .map(m => ({ header: m.sheetHeader, label: m.label })),
    }
  } catch {
    return null
  }
}

export async function saveComexConfig(cfg: ComexConfig): Promise<void> {
  await prisma.appConfig.upsert({
    where:  { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: JSON.stringify(cfg) },
    update: { value: JSON.stringify(cfg) },
  })
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

function parseCSVRow(line: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQ = false
  for (const c of line) {
    if (c === '"') { inQ = !inQ }
    else if (c === ',' && !inQ) { cols.push(cur.trim().replace(/^"|"$/g, '')); cur = '' }
    else cur += c
  }
  cols.push(cur.trim().replace(/^"|"$/g, ''))
  return cols
}

function buildCsvUrl(url: string, sheetName?: string): string {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!idMatch) return url
  const id = idMatch[1]
  if (sheetName?.trim()) {
    return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName.trim())}`
  }
  const gidMatch = url.match(/[?&#]gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
}

// ─── Split-aware row parser ───────────────────────────────────────────────────

/** Splits a comma-separated cell into trimmed pieces.  "a, b ,c" → ["a","b","c"] */
function splitCell(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(s => s.length > 0)
}

/**
 * For a single SO row, expand into N shipments using positional split.
 * - If `embarqueCol` has 2 values and any other column also has 2 values, they pair index-by-index.
 * - If another column has 1 value, it is replicated to all shipments.
 * - If lengths disagree (e.g. 2 vs 3), we use Math.min and record a warning.
 */
function expandRowToShipments(
  embarqueRaw: string,
  extras: { fieldKey: string; raw: string }[],
  errors: string[],
  rowLabel: string,
): ComexShipment[] {
  const embarques = splitCell(embarqueRaw)
  if (embarques.length === 0) return []

  const extraSplits = extras.map(e => ({ fieldKey: e.fieldKey, parts: splitCell(e.raw) }))

  return embarques.map((embarqueNo, idx) => {
    const slice: Record<string, string | null> = {}
    for (const e of extraSplits) {
      if (e.parts.length === 0) {
        slice[e.fieldKey] = null
      } else if (e.parts.length === 1) {
        slice[e.fieldKey] = e.parts[0]
      } else if (idx < e.parts.length) {
        slice[e.fieldKey] = e.parts[idx]
      } else {
        slice[e.fieldKey] = e.parts[e.parts.length - 1]
        errors.push(`Fila ${rowLabel}: columna "${e.fieldKey}" tiene menos splits que N° Embarque`)
      }
    }
    return { embarqueNo, extras: slice }
  })
}

// ─── Public: fetch live data ──────────────────────────────────────────────────

export async function fetchComexData(): Promise<ComexData> {
  const empty: ComexData = {
    bySO: new Map(),
    byEmbarque: new Map(),
    extraColumns: [],
    fetchedAt: new Date(),
    errors: [],
  }

  const cfg = await getComexConfig()
  if (!cfg) {
    empty.errors.push('Sin configuración de planilla Comex')
    return empty
  }

  try {
    const csvUrl = buildCsvUrl(cfg.url, cfg.sheetName)
    const res = await fetch(csvUrl, { cache: 'no-store' })
    if (!res.ok) {
      empty.errors.push(`HTTP ${res.status} al leer la planilla`)
      return empty
    }
    const text = await res.text()
    const lines = text.split('\n')
    const headers = parseCSVRow(lines[0] ?? '').map(h => h.trim())

    const joinIdx = headers.findIndex(h => h.toLowerCase() === cfg.joinCol.toLowerCase())
    if (joinIdx < 0) {
      empty.errors.push(`Columna "${cfg.joinCol}" no encontrada en la planilla`)
      return empty
    }

    const embarqueIdx = headers.findIndex(h => h.toLowerCase() === cfg.embarqueCol.toLowerCase())
    if (embarqueIdx < 0) {
      empty.errors.push(`Columna "${cfg.embarqueCol}" no encontrada en la planilla`)
      return empty
    }

    const extraCols = cfg.extraCols
      .map(c => ({
        fieldKey: c.header,
        label: c.label,
        colIdx: headers.findIndex(h => h.toLowerCase() === c.header.toLowerCase()),
      }))
      .filter(c => c.colIdx >= 0)

    const bySO = new Map<string, ComexSORow>()
    const byEmbarque = new Map<string, Set<string>>()
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line?.trim()) continue
      const cols = parseCSVRow(line)
      const so = (cols[joinIdx] ?? '').trim().toUpperCase()
      if (!so) continue

      const shipments = expandRowToShipments(
        cols[embarqueIdx] ?? '',
        extraCols.map(e => ({ fieldKey: e.fieldKey, raw: cols[e.colIdx] ?? '' })),
        errors,
        `SO ${so}`,
      )
      if (shipments.length === 0) continue

      bySO.set(so, { so, shipments })
      for (const ship of shipments) {
        const emb = ship.embarqueNo.toUpperCase()
        if (!byEmbarque.has(emb)) byEmbarque.set(emb, new Set())
        byEmbarque.get(emb)!.add(so)
      }
    }

    return {
      bySO,
      byEmbarque,
      extraColumns: extraCols.map(c => ({ fieldKey: c.fieldKey, label: c.label })),
      fetchedAt: new Date(),
      errors,
    }
  } catch (err) {
    empty.errors.push(`Excepción: ${err instanceof Error ? err.message : String(err)}`)
    return empty
  }
}
```

- [ ] **Step 2: Sanity-test the split parser with a synthetic input**

Create a throwaway script `/tmp/comex-test.ts`:

```ts
import { fetchComexData } from '../workspaces/Panel-Compras/app/lib/comex'
// We can't easily run server actions from CLI, so just verify the parser
// by importing parseCSVRow/splitCell shape and feeding sample data.
// For now: skip until we can wire it via /api/debug route in Task 7.
console.log('Verifying types compile...')
```

Run `npx tsc --noEmit` — expect zero errors. (Actual runtime validation happens in Task 7 once a page consumes the data.)

- [ ] **Step 3: Commit**

```bash
git add app/lib/comex.ts
git commit -m "feat(comex): nuevo fetcher simplificado con parser de split shipments por SO"
```

---

## Task 4: Build `app/lib/embarques.ts` — Embarque computed view builder

**Files:**
- Create: `app/lib/embarques.ts`

- [ ] **Step 1: Create `app/lib/embarques.ts`**

```ts
'use server'

import { prisma } from '@/lib/prisma'
import { fetchComexData, type ComexData, type ComexShipment } from '@/app/lib/comex'
import type { CIPLItem, Compra, CIPLPhoto } from '@/app/generated/prisma'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmbarqueEstado = 'pendiente' | 'en-transito' | 'arribado' | 'desconocido'

export type EmbarqueSummary = {
  embarqueNo: string
  estado: EmbarqueEstado
  etd: string | null
  eta: string | null
  awb: string | null
  sos: string[]
  totalItems: number
  totalQty: number
  totalCbm: number
  fetchedAt: Date
}

export type CIPLItemWithPhotos = CIPLItem & { photos: CIPLPhoto[] }

export type EmbarqueDetail = EmbarqueSummary & {
  shipmentsBySO: Map<string, ComexShipment>      // for each SO, the slice of the Comex row pertaining to THIS embarque
  items: CIPLItemWithPhotos[]
  compras: Compra[]
  extraColumns: { fieldKey: string; label: string }[]
  errors: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDateLoose(raw: string | null | undefined): Date | null {
  if (!raw) return null
  // Try ISO first
  const iso = new Date(raw)
  if (!isNaN(iso.getTime())) return iso
  // Try DD/MM/YY or DD/MM/YYYY (es-AR)
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    const dd = parseInt(m[1], 10)
    const mm = parseInt(m[2], 10) - 1
    let yyyy = parseInt(m[3], 10)
    if (yyyy < 100) yyyy += 2000
    const d = new Date(yyyy, mm, dd)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

const FIELD_ETD = 'etd'
const FIELD_ETA = 'eta'
const FIELD_AWB = 'awb'
const FIELD_ARRIBO_WH = 'arriboWh'

function pickField(shipment: ComexShipment, candidates: string[]): string | null {
  for (const key of Object.keys(shipment.extras)) {
    const lower = key.toLowerCase()
    if (candidates.some(c => lower.includes(c))) {
      const v = shipment.extras[key]
      if (v) return v
    }
  }
  return null
}

export function deriveStatus(shipment: ComexShipment): EmbarqueEstado {
  const arribo = parseDateLoose(pickField(shipment, ['arribo']))
  if (arribo) return 'arribado'
  const etd = parseDateLoose(pickField(shipment, ['etd']))
  if (!etd) return 'desconocido'
  return etd <= new Date() ? 'en-transito' : 'pendiente'
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns one summary row per distinct embarqueNo from the Comex sheet. */
export async function listEmbarques(): Promise<{ summaries: EmbarqueSummary[]; errors: string[] }> {
  const comex = await fetchComexData()
  const summaries: EmbarqueSummary[] = []

  for (const [embarqueNo, soSet] of comex.byEmbarque) {
    const sos = Array.from(soSet)

    // Aggregate items across all SOs in this embarque
    const items = await prisma.cIPLItem.findMany({
      where: { soPrincipal: { in: sos } },
      select: { id: true, qty: true, cbm: true },
    })

    // Take the first non-null ETD/ETA/AWB across SOs (Comex usually keeps them consistent)
    let etd: string | null = null
    let eta: string | null = null
    let awb: string | null = null
    let estado: EmbarqueEstado = 'desconocido'

    for (const so of sos) {
      const row = comex.bySO.get(so)
      if (!row) continue
      const ship = row.shipments.find(s => s.embarqueNo.toUpperCase() === embarqueNo)
      if (!ship) continue
      etd ??= pickField(ship, ['etd'])
      eta ??= pickField(ship, ['eta'])
      awb ??= pickField(ship, ['awb'])
      const st = deriveStatus(ship)
      if (st !== 'desconocido') estado = st
    }

    summaries.push({
      embarqueNo,
      estado,
      etd,
      eta,
      awb,
      sos,
      totalItems: items.length,
      totalQty:   items.reduce((s, i) => s + (i.qty ?? 0), 0),
      totalCbm:   items.reduce((s, i) => s + (i.cbm ?? 0), 0),
      fetchedAt:  comex.fetchedAt,
    })
  }

  summaries.sort((a, b) => {
    // Sort by ETD desc, then embarqueNo desc
    const ad = parseDateLoose(a.etd)?.getTime() ?? 0
    const bd = parseDateLoose(b.etd)?.getTime() ?? 0
    if (ad !== bd) return bd - ad
    return b.embarqueNo.localeCompare(a.embarqueNo)
  })

  return { summaries, errors: comex.errors }
}

/** Returns the full detail for one embarqueNo. */
export async function getEmbarqueDetail(embarqueNoRaw: string): Promise<EmbarqueDetail | null> {
  const embarqueNo = embarqueNoRaw.toUpperCase()
  const comex = await fetchComexData()
  const soSet = comex.byEmbarque.get(embarqueNo)
  if (!soSet || soSet.size === 0) return null

  const sos = Array.from(soSet)
  const items = await prisma.cIPLItem.findMany({
    where: { soPrincipal: { in: sos } },
    orderBy: [{ asn: 'asc' }, { sortOrder: 'asc' }],
    include: { photos: true },
  })

  const compras = await prisma.compra.findMany({
    where: { sos: { some: { soNumber: { in: sos } } } },
    include: { sos: true },
  })

  const shipmentsBySO = new Map<string, ComexShipment>()
  for (const so of sos) {
    const row = comex.bySO.get(so)
    if (!row) continue
    const ship = row.shipments.find(s => s.embarqueNo.toUpperCase() === embarqueNo)
    if (ship) shipmentsBySO.set(so, ship)
  }

  // Compute summary fields
  let etd: string | null = null
  let eta: string | null = null
  let awb: string | null = null
  let estado: EmbarqueEstado = 'desconocido'
  for (const ship of shipmentsBySO.values()) {
    etd ??= pickField(ship, ['etd'])
    eta ??= pickField(ship, ['eta'])
    awb ??= pickField(ship, ['awb'])
    const st = deriveStatus(ship)
    if (st !== 'desconocido') estado = st
  }

  return {
    embarqueNo,
    estado,
    etd,
    eta,
    awb,
    sos,
    totalItems: items.length,
    totalQty:   items.reduce((s, i) => s + (i.qty ?? 0), 0),
    totalCbm:   items.reduce((s, i) => s + (i.cbm ?? 0), 0),
    fetchedAt:  comex.fetchedAt,
    shipmentsBySO,
    items,
    compras,
    extraColumns: comex.extraColumns,
    errors: comex.errors,
  }
}
```

- [ ] **Step 2: Smoke test**

Run `npx tsc --noEmit` — expect zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/embarques.ts
git commit -m "feat(embarques): builder de Embarque computado con split shipments y join por SO"
```

---

## Task 5: Build `app/lib/roles.ts` — role helpers

**Files:**
- Create: `app/lib/roles.ts`

This task adds the helpers; wiring them into actual route protection lives in later tasks when those routes exist.

- [ ] **Step 1: Create `app/lib/roles.ts`**

```ts
'use server'

import { auth } from '@/lib/auth'   // adjust if the existing auth helper lives elsewhere
import { prisma } from '@/lib/prisma'

export type AppRole = 'comercial' | 'comex' | 'admin'

export const ROLE_LABELS: Record<AppRole, string> = {
  comercial: 'Comercial',
  comex:     'Comex',
  admin:     'Administrador',
}

export async function getCurrentRole(): Promise<AppRole | null> {
  try {
    const session = await auth()
    const email = session?.user?.email
    if (!email) return null
    const user = await prisma.user.findUnique({ where: { email }, select: { role: true } })
    if (!user) return null
    const r = user.role as AppRole
    return (['comercial', 'comex', 'admin'] as const).includes(r) ? r : 'comercial'
  } catch {
    return null
  }
}

export async function requireRole(allowed: AppRole[]): Promise<AppRole> {
  const role = await getCurrentRole()
  if (!role || !allowed.includes(role)) {
    throw new Error(`Acceso denegado. Roles permitidos: ${allowed.join(', ')}`)
  }
  return role
}

export function canEditCIPL(role: AppRole | null): boolean {
  return role === 'admin' || role === 'comercial'
}

export function canConfigureComex(role: AppRole | null): boolean {
  return role === 'admin' || role === 'comex'
}

export function canDeleteAnything(role: AppRole | null): boolean {
  return role === 'admin'
}
```

If the project's auth helper lives at a different path, search for it first: `rg "export.*function auth" --type ts` and update the import accordingly.

- [ ] **Step 2: Verify auth import resolves**

Run `npx tsc --noEmit` — expect zero errors. If it fails on the `auth` import, adjust to whatever auth utility the project actually exports (likely `@/auth` or `@/lib/auth` per next-auth conventions). If no auth helper exists yet, replace the `getCurrentRole` body with `return 'admin'` as a temporary stub and add a TODO comment naming the user explicitly.

- [ ] **Step 3: Commit**

```bash
git add app/lib/roles.ts
git commit -m "feat(auth): helpers de roles (comercial/comex/admin) con guards reutilizables"
```

---

## Task 6: Build `/embarques` list page

**Files:**
- Create: `app/embarques/page.tsx`
- Create: `app/embarques/EmbarquesListClient.tsx`

- [ ] **Step 1: Create `app/embarques/page.tsx`**

```tsx
export const dynamic = 'force-dynamic'

import { Anchor, AlertCircle } from 'lucide-react'
import { listEmbarques } from '@/app/lib/embarques'
import { EmbarquesListClient } from './EmbarquesListClient'

export default async function EmbarquesPage() {
  const { summaries, errors } = await listEmbarques()

  return (
    <div className="px-6 py-5">
      <div className="flex items-center gap-3 mb-5">
        <Anchor className="w-5 h-5 text-[#E30613] shrink-0" />
        <h1 className="text-xl font-display font-semibold text-white tracking-tight">Embarques</h1>
        <span className="ml-auto text-[11px] text-zinc-500">
          {summaries.length} embarque{summaries.length === 1 ? '' : 's'}
        </span>
      </div>

      {errors.length > 0 && (
        <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md border border-amber-500/20 bg-amber-500/[0.05] text-[12px] text-amber-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium mb-1">Aviso al leer la planilla Comex:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        </div>
      )}

      <EmbarquesListClient summaries={summaries} />
    </div>
  )
}
```

- [ ] **Step 2: Create `app/embarques/EmbarquesListClient.tsx`**

```tsx
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { StatusPill, type EmbarqueEstado } from '@/components/shared/StatusPill'
import { DateRange } from '@/components/shared/DateRange'
import { cn } from '@/lib/utils'

type Summary = {
  embarqueNo: string
  estado: EmbarqueEstado
  etd: string | null
  eta: string | null
  awb: string | null
  sos: string[]
  totalItems: number
  totalQty: number
  totalCbm: number
}

const FILTERS: { id: EmbarqueEstado | 'todos'; label: string }[] = [
  { id: 'todos',       label: 'Todos' },
  { id: 'en-transito', label: 'En tránsito' },
  { id: 'pendiente',   label: 'Pendiente' },
  { id: 'arribado',    label: 'Arribado' },
  { id: 'desconocido', label: 'Sin tracking' },
]

export function EmbarquesListClient({ summaries }: { summaries: Summary[] }) {
  const [filter, setFilter] = useState<EmbarqueEstado | 'todos'>('todos')
  const [query, setQuery] = useState('')

  const counts = useMemo(() => {
    const c: Record<EmbarqueEstado | 'todos', number> = {
      todos: summaries.length,
      'en-transito': 0, pendiente: 0, arribado: 0, desconocido: 0,
    }
    for (const s of summaries) c[s.estado]++
    return c
  }, [summaries])

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    return summaries.filter(s => {
      if (filter !== 'todos' && s.estado !== filter) return false
      if (q) {
        if (s.embarqueNo.toUpperCase().includes(q)) return true
        if (s.sos.some(so => so.includes(q))) return true
        if (s.awb?.toUpperCase().includes(q)) return true
        return false
      }
      return true
    })
  }, [summaries, filter, query])

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors',
              filter === f.id
                ? 'bg-[#E30613]/10 text-white border-[#E30613]/40'
                : 'bg-transparent text-zinc-400 border-white/[0.08] hover:text-white hover:border-white/[0.2]',
            )}
          >
            {f.label} <span className="text-zinc-500 ml-1">({counts[f.id]})</span>
          </button>
        ))}

        <div className="ml-auto relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar N° Embarque, SO o AWB…"
            className="pl-8 pr-3 py-1.5 w-72 rounded-md text-[11px] bg-[#0d0d0d] border border-white/[0.08] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#E30613]/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-[#0d0d0d] border-b border-white/[0.06]">
              <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">N° Embarque</th>
              <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">Estado</th>
              <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">ETD → ETA</th>
              <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">AWB</th>
              <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">SOs</th>
              <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">Unidades</th>
              <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">CBM</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-500 text-[12px]">
                  No hay embarques que coincidan con el filtro.
                </td>
              </tr>
            ) : filtered.map(s => (
              <tr key={s.embarqueNo} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/embarques/${encodeURIComponent(s.embarqueNo)}`} className="font-mono font-semibold text-white hover:text-[#E30613] transition-colors">
                    {s.embarqueNo}
                  </Link>
                </td>
                <td className="px-4 py-3"><StatusPill estado={s.estado} /></td>
                <td className="px-4 py-3"><DateRange etd={s.etd} eta={s.eta} /></td>
                <td className="px-4 py-3 font-mono text-[11px] text-zinc-500">{s.awb ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {s.sos.slice(0, 3).map(so => (
                      <span key={so} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] text-zinc-400">{so}</span>
                    ))}
                    {s.sos.length > 3 && <span className="text-[10px] text-zinc-500">+{s.sos.length - 3}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-zinc-300 tabular-nums">{s.totalQty.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-zinc-500 tabular-nums">{s.totalCbm.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Smoke test**

Run `npm run dev`, open `http://localhost:3000/embarques`.
Expected: page renders with no console errors; if no Comex config exists, the amber warning banner shows; filter buttons toggle correctly; clicking a row link goes to a 404 (detail page comes in Task 7).

- [ ] **Step 4: Commit**

```bash
git add app/embarques/page.tsx app/embarques/EmbarquesListClient.tsx
git commit -m "feat(embarques): lista de embarques con filtros por estado y búsqueda"
```

---

## Task 7: Build `/embarques/[embarqueNo]` detail page + tabs framework

**Files:**
- Create: `app/embarques/[embarqueNo]/page.tsx`
- Create: `app/embarques/[embarqueNo]/EmbarqueDetailClient.tsx`

- [ ] **Step 1: Create `app/embarques/[embarqueNo]/page.tsx`**

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Download, ExternalLink, Anchor } from 'lucide-react'
import { getEmbarqueDetail } from '@/app/lib/embarques'
import { StatusPill } from '@/components/shared/StatusPill'
import { DateRange } from '@/components/shared/DateRange'
import { EmbarqueDetailClient } from './EmbarqueDetailClient'

type Props = { params: Promise<{ embarqueNo: string }> }

export default async function EmbarqueDetailPage({ params }: Props) {
  const { embarqueNo: raw } = await params
  const detail = await getEmbarqueDetail(decodeURIComponent(raw))
  if (!detail) notFound()

  return (
    <div className="px-6 py-5">
      <div className="flex items-center gap-2 mb-3 text-[11px] text-zinc-500">
        <Link href="/embarques" className="hover:text-white transition-colors inline-flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" />
          Embarques
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Anchor className="w-5 h-5 text-[#E30613] shrink-0" />
        <h1 className="text-2xl font-display font-bold text-white tracking-tight">{detail.embarqueNo}</h1>
        <StatusPill estado={detail.estado} />

        <div className="ml-auto flex items-center gap-2">
          <DateRange etd={detail.etd} eta={detail.eta} />
          {detail.awb && (
            <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
              AWB {detail.awb}
            </span>
          )}
          <a
            href={`/api/embarques/${encodeURIComponent(detail.embarqueNo)}/export`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium bg-[#E30613] hover:bg-[#E30613]/85 text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CIPL consolidado
          </a>
        </div>
      </div>

      <EmbarqueDetailClient detail={JSON.parse(JSON.stringify({
        embarqueNo: detail.embarqueNo,
        estado: detail.estado,
        etd: detail.etd, eta: detail.eta, awb: detail.awb,
        sos: detail.sos,
        totalItems: detail.totalItems,
        totalQty: detail.totalQty,
        totalCbm: detail.totalCbm,
        items: detail.items,
        compras: detail.compras,
        shipmentsBySO: Array.from(detail.shipmentsBySO.entries()),
        extraColumns: detail.extraColumns,
      }))} />
    </div>
  )
}
```

- [ ] **Step 2: Create `app/embarques/[embarqueNo]/EmbarqueDetailClient.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ResumenTab } from './tabs/ResumenTab'
import { ItemsTab } from './tabs/ItemsTab'
import { ControlTab } from './tabs/ControlTab'
import { FotosTab } from './tabs/FotosTab'
import { ComprasTab } from './tabs/ComprasTab'

export type DetailProp = {
  embarqueNo: string
  estado: string
  etd: string | null
  eta: string | null
  awb: string | null
  sos: string[]
  totalItems: number
  totalQty: number
  totalCbm: number
  items: any[]
  compras: any[]
  shipmentsBySO: [string, { embarqueNo: string; extras: Record<string, string | null> }][]
  extraColumns: { fieldKey: string; label: string }[]
}

type TabId = 'resumen' | 'items' | 'control' | 'fotos' | 'compras'

export function EmbarqueDetailClient({ detail }: { detail: DetailProp }) {
  const [tab, setTab] = useState<TabId>('resumen')

  const photoCount = detail.items.reduce((sum, i) => sum + (i.photos?.length ?? 0), 0)
  const controlIssues = detail.items.filter((i: any) =>
    (i.diferenciaPiPl != null && i.diferenciaPiPl !== 0) || (i.photos?.length ?? 0) === 0
  ).length

  const TABS: { id: TabId; label: string; count?: number; badge?: boolean }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'items',   label: 'Ítems',   count: detail.items.length },
    { id: 'control', label: 'Control', count: controlIssues, badge: controlIssues > 0 },
    { id: 'fotos',   label: 'Fotos',   count: photoCount },
    { id: 'compras', label: 'Compras', count: detail.compras.length },
  ]

  return (
    <div>
      <div className="border-b border-white/[0.06] mb-4 flex items-center gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'relative px-3 py-2 text-[12px] font-medium transition-colors',
              tab === t.id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            <span>{t.label}</span>
            {t.count != null && (
              <span className={cn(
                'ml-1.5 text-[10px] px-1.5 py-0.5 rounded',
                t.badge ? 'bg-amber-500/15 text-amber-400' : 'bg-white/[0.06] text-zinc-500',
              )}>
                {t.count}
              </span>
            )}
            {tab === t.id && <span className="absolute bottom-0 left-0 right-0 h-px bg-[#E30613]" />}
          </button>
        ))}
      </div>

      {tab === 'resumen' && <ResumenTab detail={detail} />}
      {tab === 'items'   && <ItemsTab items={detail.items} />}
      {tab === 'control' && <ControlTab items={detail.items} />}
      {tab === 'fotos'   && <FotosTab items={detail.items} />}
      {tab === 'compras' && <ComprasTab compras={detail.compras} sos={detail.sos} />}
    </div>
  )
}
```

- [ ] **Step 3: Stub all 5 tab files so imports resolve**

For each of: `ResumenTab.tsx`, `ItemsTab.tsx`, `ControlTab.tsx`, `FotosTab.tsx`, `ComprasTab.tsx`, create a minimal placeholder:

```tsx
// app/embarques/[embarqueNo]/tabs/ResumenTab.tsx (and equivalent for others)
'use client'
export function ResumenTab(_: any) {
  return <p className="text-zinc-500 text-[12px]">Resumen — pendiente.</p>
}
```

Rename `ResumenTab` to the corresponding name in each file (`ItemsTab`, `ControlTab`, `FotosTab`, `ComprasTab`).

- [ ] **Step 4: Smoke test**

Run `npm run dev`, navigate to `/embarques`, click an embarque row.
Expected: detail page renders with title, status pill, tabs, and "pendiente" text in each tab.

- [ ] **Step 5: Commit**

```bash
git add app/embarques/\[embarqueNo\]/
git commit -m "feat(embarques): detalle con tabs y stub de cada tab"
```

---

## Task 8: Implement ResumenTab

**Files:**
- Modify: `app/embarques/[embarqueNo]/tabs/ResumenTab.tsx`

- [ ] **Step 1: Replace `ResumenTab.tsx` content**

```tsx
'use client'

import { KPICard } from '@/components/shared/KPICard'
import type { DetailProp } from '../EmbarqueDetailClient'

export function ResumenTab({ detail }: { detail: DetailProp }) {
  const photoCount = detail.items.reduce((s, i) => s + (i.photos?.length ?? 0), 0)
  const itemsConDiff = detail.items.filter((i: any) =>
    i.diferenciaPiPl != null && i.diferenciaPiPl !== 0
  ).length
  const itemsSinFoto = detail.items.filter((i: any) => (i.photos?.length ?? 0) === 0).length
  const okCount = detail.items.length - itemsConDiff - itemsSinFoto

  // Extra fields from Comex shipment slice (e.g. arriboWh, comentarios)
  const firstShipment = detail.shipmentsBySO[0]?.[1]
  const extras = firstShipment?.extras ?? {}

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="SOs incluidos" value={detail.sos.length.toString()} accent="red" />
        <KPICard label="Ítems del PL" value={detail.totalItems.toString()} accent="blue" />
        <KPICard label="Unidades" value={detail.totalQty.toLocaleString()} accent="zinc" />
        <KPICard label="CBM total" value={detail.totalCbm.toFixed(2)} accent="zinc" hint="m³" />
      </div>

      {/* Control summary */}
      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-4">
        <h3 className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">Control rápido</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="px-3 py-2 rounded-md bg-emerald-500/[0.08] border border-emerald-500/20">
            <p className="text-[10px] uppercase text-emerald-400/80 font-semibold">OK</p>
            <p className="text-xl font-display font-bold text-emerald-400 tabular-nums">{okCount}</p>
          </div>
          <div className="px-3 py-2 rounded-md bg-amber-500/[0.08] border border-amber-500/20">
            <p className="text-[10px] uppercase text-amber-400/80 font-semibold">Diferencia qty</p>
            <p className="text-xl font-display font-bold text-amber-400 tabular-nums">{itemsConDiff}</p>
          </div>
          <div className="px-3 py-2 rounded-md bg-red-500/[0.08] border border-red-500/20">
            <p className="text-[10px] uppercase text-red-400/80 font-semibold">Sin foto</p>
            <p className="text-xl font-display font-bold text-red-400 tabular-nums">{itemsSinFoto}</p>
          </div>
          <div className="px-3 py-2 rounded-md bg-blue-500/[0.08] border border-blue-500/20">
            <p className="text-[10px] uppercase text-blue-400/80 font-semibold">Fotos cargadas</p>
            <p className="text-xl font-display font-bold text-blue-400 tabular-nums">{photoCount}</p>
          </div>
        </div>
      </div>

      {/* Extra fields from Comex */}
      {detail.extraColumns.length > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-4">
          <h3 className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">Datos de Comex</h3>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-[12px]">
            {detail.extraColumns.map(col => (
              <div key={col.fieldKey} className="flex items-baseline gap-2">
                <dt className="text-zinc-500 min-w-[100px]">{col.label}</dt>
                <dd className="text-zinc-200 truncate">{extras[col.fieldKey] ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Smoke test**

Reload `/embarques/[anyEmbarque]`, click "Resumen" tab.
Expected: 4 KPI cards on top, control summary with colored boxes below.

- [ ] **Step 3: Commit**

```bash
git add app/embarques/\[embarqueNo\]/tabs/ResumenTab.tsx
git commit -m "feat(embarques): tab Resumen con KPIs y control rápido"
```

---

## Task 9: Implement ItemsTab

**Files:**
- Modify: `app/embarques/[embarqueNo]/tabs/ItemsTab.tsx`

- [ ] **Step 1: Replace `ItemsTab.tsx` content**

```tsx
'use client'

import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'

export function ItemsTab({ items }: { items: any[] }) {
  const [query, setQuery] = useState('')

  const grouped = useMemo(() => {
    const q = query.trim().toUpperCase()
    const filtered = items.filter(i => {
      if (!q) return true
      return (
        i.soPrincipal?.toUpperCase().includes(q) ||
        i.description?.toUpperCase().includes(q) ||
        i.asn?.toUpperCase().includes(q) ||
        i.codeEan?.toUpperCase().includes(q)
      )
    })
    const map = new Map<string, any[]>()
    for (const it of filtered) {
      const key = it.asn ?? '(sin ASN)'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    return Array.from(map.entries())
  }, [items, query])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-zinc-500">{items.length} ítems en este embarque</p>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar SO, descripción, EAN…"
            className="pl-8 pr-3 py-1.5 w-72 rounded-md text-[11px] bg-[#0d0d0d] border border-white/[0.08] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#E30613]/50"
          />
        </div>
      </div>

      <div className="space-y-4">
        {grouped.map(([asn, rows]) => (
          <div key={asn} className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
            <div className="px-4 py-2 bg-[#0d0d0d] border-b border-white/[0.06] flex items-center gap-3">
              <span className="font-mono text-[11px] font-semibold text-zinc-300">{asn}</span>
              <span className="text-[10px] text-zinc-500">{rows.length} ítems</span>
            </div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2">SO</th>
                  <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2">Descripción</th>
                  <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2">SKU</th>
                  <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2">EAN</th>
                  <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2">Qty</th>
                  <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2">CBM</th>
                  <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2">GW kg</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((it: any) => (
                  <tr key={it.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-2 font-mono text-[11px] text-emerald-400">{it.soPrincipal ?? '—'}</td>
                    <td className="px-4 py-2 text-zinc-200">{it.description ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-[10px] text-zinc-500">{it.sku ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-[10px] text-zinc-500">{it.codeEan ?? '—'}</td>
                    <td className="px-4 py-2 text-right text-zinc-300 tabular-nums">{it.qty ?? 0}</td>
                    <td className="px-4 py-2 text-right text-zinc-500 tabular-nums">{(it.cbm ?? 0).toFixed(3)}</td>
                    <td className="px-4 py-2 text-right text-zinc-500 tabular-nums">{(it.gwKg ?? 0).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Smoke test**

Click "Ítems" tab on a populated embarque.
Expected: items grouped by ASN, search filter works.

- [ ] **Step 3: Commit**

```bash
git add app/embarques/\[embarqueNo\]/tabs/ItemsTab.tsx
git commit -m "feat(embarques): tab Ítems agrupado por ASN con buscador"
```

---

## Task 10: Implement ControlTab (read-only for Fase 1)

**Files:**
- Modify: `app/embarques/[embarqueNo]/tabs/ControlTab.tsx`

- [ ] **Step 1: Replace `ControlTab.tsx` content**

```tsx
'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Camera, CameraOff, CheckCircle2, AlertTriangle, Info } from 'lucide-react'

type Filter = 'todos' | 'con-diferencia' | 'sin-foto' | 'ok'

export function ControlTab({ items }: { items: any[] }) {
  const [filter, setFilter] = useState<Filter>('todos')

  const summary = useMemo(() => {
    const conDiff = items.filter((i: any) => i.diferenciaPiPl != null && i.diferenciaPiPl !== 0).length
    const sinFoto = items.filter((i: any) => (i.photos?.length ?? 0) === 0).length
    const ok = items.length - conDiff - sinFoto
    return { conDiff, sinFoto, ok, total: items.length }
  }, [items])

  const visible = useMemo(() => {
    return items.filter((i: any) => {
      const hasDiff = i.diferenciaPiPl != null && i.diferenciaPiPl !== 0
      const noPhoto = (i.photos?.length ?? 0) === 0
      const isOk = !hasDiff && !noPhoto
      switch (filter) {
        case 'todos':          return true
        case 'con-diferencia': return hasDiff
        case 'sin-foto':       return noPhoto
        case 'ok':             return isOk
      }
    })
  }, [items, filter])

  const filters: { id: Filter; label: string; count: number; cls: string }[] = [
    { id: 'todos',          label: 'Todos',           count: summary.total,   cls: 'border-white/[0.1]' },
    { id: 'ok',             label: 'OK',              count: summary.ok,      cls: 'border-emerald-500/30 text-emerald-400' },
    { id: 'con-diferencia', label: 'Diferencia qty',  count: summary.conDiff, cls: 'border-amber-500/30 text-amber-400' },
    { id: 'sin-foto',       label: 'Sin foto',        count: summary.sinFoto, cls: 'border-red-500/30 text-red-400' },
  ]

  return (
    <div>
      <div className="mb-3 p-3 rounded-md border border-blue-500/20 bg-blue-500/[0.04] flex items-start gap-2 text-[11px] text-blue-300">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>Fase 1: tab de Control en modo lectura. Las acciones (marcar revisado, editar qty, agregar nota) se habilitan en Fase 2.</span>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors',
              filter === f.id ? f.cls + ' bg-white/[0.04]' : 'border-white/[0.08] text-zinc-500 hover:text-zinc-300',
            )}
          >
            {f.label} <span className="ml-1 opacity-60">({f.count})</span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-[#0d0d0d] border-b border-white/[0.06]">
              <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">SO</th>
              <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">Descripción</th>
              <th className="text-center text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">Foto</th>
              <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-blue-400 px-4 py-2.5">Qty PL</th>
              <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-purple-400 px-4 py-2.5">Qty PI</th>
              <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">Diferencia</th>
              <th className="text-center text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-4 py-2.5">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-500">Sin ítems para mostrar.</td></tr>
            ) : visible.map((it: any) => {
              const photos = it.photos?.length ?? 0
              const diff = it.diferenciaPiPl ?? 0
              const hasDiff = diff !== 0
              const noPhoto = photos === 0
              const isOk = !hasDiff && !noPhoto
              return (
                <tr key={it.id} className={cn(
                  'border-b border-white/[0.04] last:border-0',
                  hasDiff && noPhoto && 'bg-red-500/[0.04]',
                  hasDiff && !noPhoto && 'bg-amber-500/[0.04]',
                  !hasDiff && noPhoto && 'bg-red-500/[0.02]',
                )}>
                  <td className="px-4 py-2 font-mono text-[11px] text-emerald-400">{it.soPrincipal ?? '—'}</td>
                  <td className="px-4 py-2 text-zinc-200">{it.description ?? '—'}</td>
                  <td className="px-4 py-2 text-center">
                    {photos > 0 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <Camera className="w-3 h-3" /><span className="text-[10px]">{photos}</span>
                      </span>
                    ) : (
                      <CameraOff className="w-3.5 h-3.5 inline text-red-400" />
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-blue-300 font-semibold tabular-nums">{it.qty ?? 0}</td>
                  <td className="px-4 py-2 text-right text-purple-300 font-semibold tabular-nums">{it.qPi ?? '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {hasDiff ? (
                      <span className={cn('px-1.5 py-0.5 rounded font-semibold', diff < 0 ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400')}>
                        {diff > 0 ? '+' : ''}{diff}
                      </span>
                    ) : (
                      <span className="text-emerald-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {isOk
                      ? <span className="inline-flex items-center gap-1 text-emerald-400 text-[10px]"><CheckCircle2 className="w-3 h-3" />OK</span>
                      : <span className="inline-flex items-center gap-1 text-amber-400 text-[10px]"><AlertTriangle className="w-3 h-3" />Revisar</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Smoke test**

Click "Control" tab. Expected: amber/red rows for items with diff or missing photos, filter buttons work.

- [ ] **Step 3: Commit**

```bash
git add app/embarques/\[embarqueNo\]/tabs/ControlTab.tsx
git commit -m "feat(embarques): tab Control de qty y fotos en modo lectura"
```

---

## Task 11: Implement FotosTab

**Files:**
- Modify: `app/embarques/[embarqueNo]/tabs/FotosTab.tsx`

- [ ] **Step 1: Replace `FotosTab.tsx` content**

```tsx
'use client'

import { useState } from 'react'
import { Image as ImageIcon, X } from 'lucide-react'

export function FotosTab({ items }: { items: any[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null)

  const withPhotos = items.filter(i => (i.photos?.length ?? 0) > 0)

  if (withPhotos.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] py-12 text-center">
        <ImageIcon className="w-8 h-8 mx-auto text-zinc-700 mb-2" />
        <p className="text-zinc-500 text-[12px]">No hay fotos cargadas para este embarque todavía.</p>
        <p className="text-zinc-600 text-[10px] mt-1">Las fotos se suben desde el flujo de Carga CIPL.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {withPhotos.map((it: any) => (
        <div key={it.id} className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
          <div className="px-4 py-2 bg-[#0d0d0d] border-b border-white/[0.06] flex items-center gap-3">
            <span className="font-mono text-[11px] font-semibold text-emerald-400">{it.soPrincipal ?? '—'}</span>
            <span className="text-[11px] text-zinc-300 truncate">{it.description ?? ''}</span>
            <span className="ml-auto text-[10px] text-zinc-500">{it.photos.length} foto{it.photos.length === 1 ? '' : 's'}</span>
          </div>
          <div className="p-3 grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {it.photos.map((p: any) => (
              <button
                key={p.id}
                onClick={() => setLightbox(p.dataUrl)}
                className="aspect-square rounded-md overflow-hidden bg-black border border-white/[0.04] hover:border-[#E30613]/40 transition-colors group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg" alt="" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/70 hover:text-white"><X className="w-6 h-6" /></button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Smoke test**

Click "Fotos" tab. Expected: photos grouped by item, click a thumbnail opens lightbox.

- [ ] **Step 3: Commit**

```bash
git add app/embarques/\[embarqueNo\]/tabs/FotosTab.tsx
git commit -m "feat(embarques): tab Fotos con galería por ítem y lightbox"
```

---

## Task 12: Implement ComprasTab

**Files:**
- Modify: `app/embarques/[embarqueNo]/tabs/ComprasTab.tsx`

- [ ] **Step 1: Replace `ComprasTab.tsx` content**

```tsx
'use client'

import Link from 'next/link'
import { ShoppingCart, ExternalLink } from 'lucide-react'

function fmtDate(d: string | Date | null): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function ComprasTab({ compras, sos }: { compras: any[]; sos: string[] }) {
  if (compras.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] py-12 text-center">
        <ShoppingCart className="w-8 h-8 mx-auto text-zinc-700 mb-2" />
        <p className="text-zinc-500 text-[12px]">No hay compras vinculadas a los SOs de este embarque.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {compras.map((c: any) => {
        const sosEnEmbarque = (c.sos ?? []).filter((s: any) => sos.includes(s.soNumber))
        return (
          <div key={c.id} className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
            <div className="px-4 py-3 bg-[#0d0d0d] border-b border-white/[0.06] flex items-center gap-3">
              <ShoppingCart className="w-4 h-4 text-purple-400" />
              <Link href={`/compras/${c.id}`} className="text-[13px] font-medium text-white hover:text-[#E30613] transition-colors">
                {c.piNo ?? c.id.slice(0, 8)}
              </Link>
              {c.supplierName && (
                <span className="text-[11px] text-zinc-500">· {c.supplierName}</span>
              )}
              <Link href={`/compras/${c.id}`} className="ml-auto text-zinc-500 hover:text-white">
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
              <div><p className="text-zinc-500 text-[9px] uppercase tracking-wide">Fecha pago</p><p className="text-zinc-200 tabular-nums">{fmtDate(c.fechaPago)}</p></div>
              <div><p className="text-zinc-500 text-[9px] uppercase tracking-wide">Fecha LMS</p><p className="text-zinc-200 tabular-nums">{fmtDate(c.fechaLMS)}</p></div>
              <div><p className="text-zinc-500 text-[9px] uppercase tracking-wide">Fecha envío</p><p className="text-zinc-200 tabular-nums">{fmtDate(c.fechaEnvio)}</p></div>
              <div><p className="text-zinc-500 text-[9px] uppercase tracking-wide">SOs en embarque</p><p className="text-zinc-200">{sosEnEmbarque.length} / {c.sos?.length ?? 0}</p></div>
            </div>
            {sosEnEmbarque.length > 0 && (
              <div className="px-4 pb-3 flex flex-wrap gap-1">
                {sosEnEmbarque.map((s: any) => (
                  <span key={s.id} className="px-2 py-0.5 rounded font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {s.soNumber}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Smoke test**

Click "Compras" tab. Expected: linked compras with payment lifecycle and SOs highlighted.

- [ ] **Step 3: Commit**

```bash
git add app/embarques/\[embarqueNo\]/tabs/ComprasTab.tsx
git commit -m "feat(embarques): tab Compras con SOs del embarque y lifecycle de pago"
```

---

## Task 13: Extend `lib/exportCipl.ts` + add `/api/embarques/[embarqueNo]/export`

**Files:**
- Modify: `lib/exportCipl.ts`
- Create: `app/api/embarques/[embarqueNo]/export/route.ts`

- [ ] **Step 1: Inspect the current `lib/exportCipl.ts` signature**

Run `head -60 lib/exportCipl.ts` to confirm the exported function name and item shape. The current function expects an array of `ExportItem` and returns an Excel workbook. Confirm:
- The function accepts an array (`items: ExportItem[]`)
- Each item maps from a `CIPLItem` row
- The function returns a buffer or workbook that can be served as a response

If the signature is already array-based (very likely), no changes are needed; skip Step 2 and go directly to Step 3.

- [ ] **Step 2: If the function is single-item only, generalize it**

Add an export `exportCiplBuffer(items: ExportItem[], headerInfo: { embarqueNo: string; asns: string[]; fechaExport: Date }): Buffer` that:
1. Builds rows from each item (one row per item, same columns as today's single-PL export).
2. Inserts a metadata banner at the top with `embarqueNo`, comma-separated `asns`, and `fechaExport`.
3. Returns the workbook serialized as `Buffer` via `XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })`.

Reuse the existing column definitions; do not duplicate.

- [ ] **Step 3: Create `app/api/embarques/[embarqueNo]/export/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getEmbarqueDetail } from '@/app/lib/embarques'
import { exportCiplBuffer } from '@/lib/exportCipl'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ embarqueNo: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { embarqueNo: raw } = await ctx.params
  const detail = await getEmbarqueDetail(decodeURIComponent(raw))
  if (!detail) return new NextResponse('Embarque no encontrado', { status: 404 })

  const asns = Array.from(new Set(detail.items.map(i => i.asn).filter((a): a is string => !!a)))

  const items = detail.items.map(i => ({
    asn: i.asn ?? null,
    piNo: i.piNo ?? null,
    caseNo: i.caseNo ?? null,
    soPrincipal: i.soPrincipal ?? null,
    tipoCarga: i.tipoCarga,
    categoryName: i.categoryName ?? null,
    description: i.description ?? null,
    qty: i.qty ?? 0,
    qBultos: i.qBultos ?? 0,
    cbm: i.cbm ?? 0,
    gwKg: i.gwKg ?? 0,
    sku: i.sku ?? null,
    modelo: i.modelo ?? null,
    isDangerousGood: i.isDangerousGood,
    codeEan: i.codeEan ?? null,
  }))

  const buf = exportCiplBuffer(items, {
    embarqueNo: detail.embarqueNo,
    asns,
    fechaExport: new Date(),
  })

  const filename = `CIPL-${detail.embarqueNo}-${new Date().toISOString().slice(0, 10)}.xlsx`
  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
```

If `exportCiplBuffer` doesn't exist (because Step 2 was skipped), substitute the existing exported function name. Inspect `lib/exportCipl.ts` to confirm.

- [ ] **Step 4: Smoke test**

Open an embarque detail, click "Exportar CIPL consolidado".
Expected: browser downloads `CIPL-EMB-XXX-YYYY-MM-DD.xlsx`. Open it: one row per item across all ASNs of that embarque.

- [ ] **Step 5: Commit**

```bash
git add lib/exportCipl.ts app/api/embarques/
git commit -m "feat(embarques): export Excel consolidado por embarque (multi-ASN)"
```

---

## Task 14: Update sidebar nav

**Files:**
- Modify: `components/sidebar.tsx`

- [ ] **Step 1: Replace the `nav` array contents in `components/sidebar.tsx`**

```tsx
import { Home, Anchor, ShoppingCart, Upload, Settings, Camera, LayoutDashboard, BarChart2, Database } from 'lucide-react'

const nav = [
  { href: '/',            label: 'Inicio',    icon: Home,         legacy: false },
  { href: '/embarques',   label: 'Embarques', icon: Anchor,       legacy: false, badge: 'Nuevo' },
  { href: '/compras',     label: 'Compras',   icon: ShoppingCart, legacy: false },
  { href: '/comercial',   label: 'Carga CIPL', icon: Upload,      legacy: false },
  // Legacy modules — removed in Fase 3
  { href: '/panel-general', label: 'Panel General',   icon: LayoutDashboard, legacy: true },
  { href: '/comex',         label: 'Comex Tracking',  icon: Database,         legacy: true },
  { href: '/inspeccion',    label: 'Inspección',      icon: Camera,           legacy: true },
  { href: '/reportes',      label: 'Reportes',        icon: BarChart2,        legacy: true },
  { href: '/operaciones',   label: 'Fuentes',         icon: Settings,         legacy: true },
]
```

Inside the `<Link>` render, render a "Nuevo" badge when `badge` is truthy and dim legacy items:

```tsx
{nav.map(({ href, label, icon: Icon, legacy, badge }) => {
  const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')
  return (
    <Link
      key={href}
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center rounded-md text-[13px] font-medium transition-all duration-150 group',
        collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-2.5 py-2',
        active
          ? 'bg-[#E30613]/10 text-white'
          : legacy
            ? 'text-white/25 hover:text-white/50 hover:bg-white/[0.02]'
            : 'text-white/50 hover:text-white/90 hover:bg-white/[0.04]',
      )}
    >
      <Icon className={cn('w-4 h-4 shrink-0 transition-colors',
        active ? 'text-[#E30613]'
              : legacy ? 'text-white/20 group-hover:text-white/40'
              : 'text-white/40 group-hover:text-white/70')} />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && badge && (
        <span className="ml-auto text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#E30613]/15 text-[#E30613] font-semibold">{badge}</span>
      )}
      {!collapsed && active && !badge && (
        <span className="ml-auto w-1 h-5 rounded-full bg-[#E30613] shrink-0" />
      )}
    </Link>
  )
})}
```

Add a section separator between non-legacy and legacy items by checking `legacy` boundaries; insert a `<p className="px-2 pt-3 pb-1 text-[9px] uppercase tracking-[0.2em] text-white/15">Legacy</p>` when transitioning.

- [ ] **Step 2: Smoke test**

Reload any page. Expected: new sidebar with Inicio / Embarques (Nuevo badge) / Compras / Carga CIPL at top, then a "Legacy" group with the old modules dimmed.

- [ ] **Step 3: Commit**

```bash
git add components/sidebar.tsx
git commit -m "feat(nav): agregar Embarques al sidebar y marcar módulos legacy"
```

---

## Task 15: Replace `app/page.tsx` with minimal KPI home

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Anchor, AlertTriangle, Package, ShoppingCart, ArrowRight, Camera } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { listEmbarques } from '@/app/lib/embarques'
import { KPICard } from '@/components/shared/KPICard'
import { StatusPill } from '@/components/shared/StatusPill'
import { DateRange } from '@/components/shared/DateRange'
import { EmbarqueChip } from '@/components/shared/EmbarqueChip'

export default async function HomePage() {
  const { summaries, errors } = await listEmbarques()

  const activos      = summaries.filter(s => s.estado === 'en-transito' || s.estado === 'pendiente').length
  const enTransito   = summaries.filter(s => s.estado === 'en-transito').length
  const arribados    = summaries.filter(s => s.estado === 'arribado').length
  const unidades     = summaries.reduce((s, e) => s + e.totalQty, 0)

  // Items sin foto
  const itemsSinFoto = await prisma.cIPLItem.count({ where: { photos: { none: {} } } })

  // Alertas
  const alerts: { kind: 'critical' | 'warn' | 'info'; text: string; href?: string }[] = []
  const now = new Date()
  for (const s of summaries.slice(0, 30)) {
    if (s.eta) {
      const eta = new Date(s.eta)
      if (!isNaN(eta.getTime())) {
        const days = Math.round((eta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (s.estado === 'en-transito' && days >= 0 && days <= 7) {
          alerts.push({ kind: 'info', text: `${s.embarqueNo} llega en ${days} día${days === 1 ? '' : 's'}`, href: `/embarques/${encodeURIComponent(s.embarqueNo)}` })
        } else if (s.estado === 'en-transito' && days < 0) {
          alerts.push({ kind: 'critical', text: `${s.embarqueNo} ETA pasada hace ${-days} días sin arribo`, href: `/embarques/${encodeURIComponent(s.embarqueNo)}` })
        }
      }
    }
  }
  if (itemsSinFoto > 0) {
    alerts.push({ kind: 'warn', text: `${itemsSinFoto} ítems sin foto cargada`, href: '/comercial' })
  }

  return (
    <div className="px-6 py-5 max-w-7xl">
      <h1 className="text-2xl font-display font-bold text-white tracking-tight mb-1">Panel de seguimiento</h1>
      <p className="text-[12px] text-zinc-500 mb-6">Resumen operativo en tiempo real</p>

      {errors.length > 0 && (
        <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md border border-amber-500/20 bg-amber-500/[0.05] text-[12px] text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Hay {errors.length} aviso{errors.length === 1 ? '' : 's'} al leer la planilla Comex. Revisá <Link href="/embarques" className="underline">Embarques</Link>.</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KPICard label="Embarques activos"  value={activos.toString()}             hint={`${enTransito} en tránsito`}     accent="red"     />
        <KPICard label="Arribados"           value={arribados.toString()}           hint="histórico total"                  accent="emerald" />
        <KPICard label="Unidades en juego"   value={unidades.toLocaleString()}      hint="suma todos los embarques"        accent="blue"    />
        <KPICard label="Ítems sin foto"      value={itemsSinFoto.toString()}        hint="requieren inspección"            accent="amber"   />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Alerts */}
        <section className="lg:col-span-2 rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Bandeja de alertas</h2>
            <span className="ml-auto text-[10px] text-zinc-500">{alerts.length}</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {alerts.length === 0 ? (
              <p className="px-4 py-8 text-center text-zinc-500 text-[12px]">Sin alertas. Todo en orden.</p>
            ) : alerts.slice(0, 12).map((a, i) => {
              const dot = a.kind === 'critical' ? 'bg-red-500' : a.kind === 'warn' ? 'bg-amber-500' : 'bg-blue-500'
              const Body = (
                <div className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                  <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
                  <span className="text-[12px] text-zinc-300 flex-1 truncate">{a.text}</span>
                  {a.href && <ArrowRight className="w-3.5 h-3.5 text-zinc-600" />}
                </div>
              )
              return a.href
                ? <Link key={i} href={a.href}>{Body}</Link>
                : <div key={i}>{Body}</div>
            })}
          </div>
        </section>

        {/* Recent embarques */}
        <section className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Anchor className="w-4 h-4 text-[#E30613]" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Últimos embarques</h2>
            <Link href="/embarques" className="ml-auto text-[10px] text-zinc-500 hover:text-white">Ver todos →</Link>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {summaries.slice(0, 6).map(s => (
              <Link key={s.embarqueNo} href={`/embarques/${encodeURIComponent(s.embarqueNo)}`} className="px-4 py-2.5 flex items-center gap-2 hover:bg-white/[0.02] transition-colors">
                <span className="font-mono text-[11px] font-semibold text-white">{s.embarqueNo}</span>
                <StatusPill estado={s.estado} className="text-[9px]" />
                <span className="ml-auto"><DateRange etd={s.etd} eta={s.eta} /></span>
              </Link>
            ))}
            {summaries.length === 0 && <p className="px-4 py-8 text-center text-zinc-500 text-[12px]">Sin embarques cargados.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Smoke test**

Reload `/`. Expected: 4 KPI cards, alerts list with critical/warn/info dots, recent embarques list with status pills.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(home): tablero KPI minimal con bandeja de alertas y últimos embarques"
```

---

## Task 16: Mobile responsive sweep on Embarques

**Files:**
- Modify: `app/embarques/EmbarquesListClient.tsx`
- Modify: `app/embarques/[embarqueNo]/EmbarqueDetailClient.tsx`
- Modify: `app/embarques/[embarqueNo]/tabs/ItemsTab.tsx`
- Modify: `app/embarques/[embarqueNo]/tabs/ControlTab.tsx`

- [ ] **Step 1: Wrap each table in `overflow-x-auto` to allow horizontal scroll on narrow viewports**

Search for each `<table>` element inside the embarques pages and wrap with:

```tsx
<div className="overflow-x-auto -mx-2 px-2">
  <table className="w-full min-w-[640px] text-[12px]">
    ...
  </table>
</div>
```

This applies to: `EmbarquesListClient.tsx`, `ItemsTab.tsx`, `ControlTab.tsx`.

- [ ] **Step 2: Make tabs scroll horizontally if they overflow on mobile**

In `EmbarqueDetailClient.tsx`, change the tab container to:

```tsx
<div className="border-b border-white/[0.06] mb-4 flex items-center gap-1 overflow-x-auto -mx-2 px-2 scrollbar-thin">
```

- [ ] **Step 3: Make filter bar in list page wrap better on mobile**

In `EmbarquesListClient.tsx`, change the search input width from `w-72` to `w-full md:w-72` so it expands to full width on small screens.

- [ ] **Step 4: Smoke test**

Open dev tools, toggle device toolbar to iPhone 12. Navigate `/embarques` and `/embarques/[any]`.
Expected: tables can be scrolled horizontally, tabs scroll horizontally, no horizontal page scroll.

- [ ] **Step 5: Commit**

```bash
git add app/embarques/
git commit -m "feat(embarques): responsive mobile (tablas con scroll-x, tabs scrolleables)"
```

---

## Task 17: Final verification

**Files:** none modified.

- [ ] **Step 1: Run full type check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Run linter**

```bash
npm run lint
```

Expected: zero errors. Warnings about unused imports are acceptable; fix critical errors only.

- [ ] **Step 3: Manual end-to-end test**

With dev server running:

1. Open `/` → confirm KPIs render and alerts list appears.
2. Click "Embarques" in sidebar → confirm list with filters.
3. Click into an embarque → confirm tabs render: Resumen (KPIs), Ítems (grouped by ASN), Control (red/amber rows where applicable), Fotos (gallery), Compras (linked compras).
4. Click "Exportar CIPL consolidado" → confirm Excel downloads and opens correctly.
5. Open in mobile viewport → confirm tables scroll horizontally and tabs are scrollable.
6. Try with no Comex config (delete `COMEX_CONFIG` and `COMEX_SOURCES` from AppConfig in Neon UI) → confirm graceful error banner instead of crash.

- [ ] **Step 4: Final commit (only if changes were needed)**

If Steps 1-3 surfaced bugs, fix and commit each as a separate `fix:` commit per the issue.

If everything passes:

```bash
git log --oneline | head -20
```

Confirm all 16 task commits are present and create a final tag if desired:

```bash
git tag -a fase-1-embarques -m "Fase 1 completa: Embarques + Foundation + Home minimal"
```

---

## Lo que queda para Fase 2 y Fase 3

**Fase 2 — Carga CIPL stepper + IA + Control con acciones:**
- Stepper UI de 5 pasos en `/comercial`
- Fusionar `/inspeccion` adentro
- Mejorar `/api/suggest-sos` con auto-aceptar high confidence
- Mejorar extracción IA de fotos (modelo visible, qty visible)
- Parser CIPL más tolerante a layout
- Auto-detección de discrepancias
- Schema migration: agregar `controlReviewed`, `controlNota`, `controlManualQty` a CIPLItem
- Control tab acciones (mark reviewed, edit qty, add note)
- Tab Historial (audit log)

**Fase 3 — Dashboard completo + cmd+k + cleanup:**
- Home con charts completos (embarques/mes, top proveedores, discrepancias trend, distribución tipo carga)
- Búsqueda global cmd+k con `/api/search`
- Página `/configuracion` simplificada
- Eliminar `/panel-general`, `/comex`, `/inspeccion`, `/reportes`, `/operaciones`
- Eliminar `app/lib/comex-sources.ts`, `app/lib/comex-fields.ts`
- Mobile polish (cards stackeadas, etc.)
- Migración de COMEX_SOURCES a COMEX_CONFIG (script de admin)
