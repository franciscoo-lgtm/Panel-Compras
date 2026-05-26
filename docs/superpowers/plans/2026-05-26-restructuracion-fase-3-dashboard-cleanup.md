# Restructuración Fase 3 — Dashboard + cmd+k + Configuración + Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la restructuración con tablero ejecutivo completo (KPIs + 4 charts), búsqueda global cmd+k, página de configuración simplificada, tab Historial en embarques, y borrar los módulos legacy junto con sus dependencias.

**Architecture:** El home (`app/page.tsx`) pasa de un layout minimal a un tablero ejecutivo con 4 KPI cards más 4 gráficos (recharts ya instalado). Una nueva página `/configuracion` reemplaza a `/operaciones` con un form ultra-simple que persiste vía `saveComexConfig` (de `lib/comex.ts`). La búsqueda global se implementa como un componente `<CmdK>` que escucha `cmd+k`/`ctrl+k` y consulta un endpoint `/api/search` que retorna 5 buckets paralelos. Al final eliminamos `/panel-general`, `/comex`, `/inspeccion`, `/reportes`, `/operaciones`, sus actions, y `app/lib/comex-sources.ts` + `app/lib/comex-fields.ts`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Prisma 7, Tailwind v4, **recharts ^3.8** (ya en package.json), lucide-react.

**Scope:** Fase 3 completa el ciclo de restructuración. Después de esto el sistema queda con 4 módulos (Embarques, Compras, Carga CIPL, Configuración) + Home como tablero.

**Validation strategy:** Smoke tests manuales por tarea. Cleanup tasks verifican vía `git status` + `npm run build` que nada referencia código eliminado.

---

## File Structure

### Nuevos archivos (Fase 3)
- `app/configuracion/page.tsx` — server component, lee config actual
- `app/configuracion/ConfigClient.tsx` — form interactivo
- `app/lib/dashboard.ts` — helpers para KPIs ejecutivos
- `components/dashboard/EmbarquesPorMesChart.tsx` — bar chart
- `components/dashboard/TipoCargaDonut.tsx` — donut chart
- `components/dashboard/TopProveedoresChart.tsx` — horizontal bars
- `components/dashboard/DiscrepanciasTrendChart.tsx` — line chart
- `components/shared/CmdK.tsx` — modal global de búsqueda
- `app/api/search/route.ts` — endpoint de búsqueda multi-bucket
- `app/embarques/[embarqueNo]/tabs/HistorialTab.tsx` — tab nuevo

### Archivos modificados
- `app/page.tsx` — tablero ejecutivo completo (reemplaza la versión minimal de Fase 1)
- `app/lib/comex.ts` — agregar `previewSheetHeaders(url, sheetName)` para Configuración
- `app/embarques/[embarqueNo]/EmbarqueDetailClient.tsx` — agregar tab Historial
- `components/sidebar.tsx` — quitar todos los items legacy, agregar Configuración
- `components/layout-shell.tsx` — montar `<CmdK>`

### Archivos/directorios eliminados (al final)
- `app/panel-general/` (page.tsx, PanelGeneralClient.tsx, actions.ts)
- `app/comex/` (page.tsx, ComexClient.tsx)
- `app/inspeccion/` (page.tsx, InspeccionClient.tsx, actions.ts — el page.tsx ya redirige, pero borramos todo el folder)
- `app/reportes/` (page.tsx, ReportesClient.tsx)
- `app/operaciones/` (page.tsx, ComexSourcesClient.tsx)
- `app/lib/comex-sources.ts`
- `app/lib/comex-fields.ts`

---

## Task 1: Crear `/configuracion` page con form simplificado

**Files:**
- Create: `app/configuracion/page.tsx`
- Create: `app/configuracion/ConfigClient.tsx`
- Modify: `app/lib/comex.ts` (agregar `previewSheetHeaders`)

- [ ] **Step 1: Agregar `previewSheetHeaders` a `app/lib/comex.ts`**

Abrí `app/lib/comex.ts`. Después de la función `saveComexConfig`, antes de `// ─── CSV helpers ──`, agregá:

```ts
// ─── Preview de columnas para la UI de Configuración ──────────────────────────

export async function previewSheetHeaders(
  url: string,
  sheetName?: string,
): Promise<{ ok: true; headers: string[] } | { ok: false; error: string }> {
  if (!url.trim()) return { ok: false, error: 'URL vacía' }
  try {
    const csvUrl = buildCsvUrl(url, sheetName)
    const res = await fetch(csvUrl, { cache: 'no-store' })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} al leer la planilla` }
    const text = await res.text()
    const firstLine = text.replace(/\r\n/g, '\n').split('\n')[0] ?? ''
    const headers = parseCSVRow(firstLine).map(h => h.trim()).filter(h => h.length > 0)
    if (headers.length === 0) return { ok: false, error: 'Sin headers detectados' }
    return { ok: true, headers }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 2: Crear `app/configuracion/page.tsx`**

```tsx
export const dynamic = 'force-dynamic'

import { Settings } from 'lucide-react'
import { getComexConfig } from '@/app/lib/comex'
import { ConfigClient } from './ConfigClient'

export default async function ConfigPage() {
  const cfg = await getComexConfig()

  return (
    <div className="px-6 py-5 max-w-4xl">
      <div className="flex items-center gap-3 mb-5">
        <Settings className="w-5 h-5 text-[#E30613] shrink-0" />
        <h1 className="text-xl font-display font-semibold text-white tracking-tight">Configuración</h1>
      </div>

      <p className="text-[12px] text-zinc-500 mb-6">
        Solo necesitás 3 cosas: la URL de la planilla de Comex, qué columna tiene el SO,
        y qué columna tiene el N° Embarque. Las columnas adicionales se autodetectan.
      </p>

      <ConfigClient initial={cfg} />
    </div>
  )
}
```

- [ ] **Step 3: Crear `app/configuracion/ConfigClient.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Save, Loader2, AlertTriangle, CheckCircle2, Eye } from 'lucide-react'
import { saveComexConfig, previewSheetHeaders, type ComexConfig } from '@/app/lib/comex'

const EMPTY: ComexConfig = {
  url: '',
  sheetName: '',
  joinCol: '',
  embarqueCol: '',
  extraCols: [],
}

export function ConfigClient({ initial }: { initial: ComexConfig | null }) {
  const [cfg, setCfg] = useState<ComexConfig>(initial ?? EMPTY)
  const [headers, setHeaders] = useState<string[]>([])
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewing, startPreview] = useTransition()
  const [saving, startSave] = useTransition()
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null)

  function handlePreview() {
    setPreviewError(null)
    setSaveResult(null)
    startPreview(async () => {
      const res = await previewSheetHeaders(cfg.url, cfg.sheetName)
      if (res.ok) {
        setHeaders(res.headers)
      } else {
        setPreviewError(res.error)
        setHeaders([])
      }
    })
  }

  function toggleExtraCol(header: string) {
    setCfg(prev => {
      const idx = prev.extraCols.findIndex(c => c.header === header)
      if (idx >= 0) {
        return { ...prev, extraCols: prev.extraCols.filter((_, i) => i !== idx) }
      }
      return { ...prev, extraCols: [...prev.extraCols, { header, label: header }] }
    })
  }

  function handleSave() {
    setSaveResult(null)
    startSave(async () => {
      try {
        await saveComexConfig(cfg)
        setSaveResult({ ok: true, msg: 'Guardado. La nueva config aplica al siguiente refresh.' })
      } catch (err) {
        setSaveResult({ ok: false, msg: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  const canPreview = cfg.url.trim().length > 0
  const canSave = cfg.url && cfg.joinCol && cfg.embarqueCol

  const availableExtraHeaders = headers.filter(h => h !== cfg.joinCol && h !== cfg.embarqueCol)

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-5 space-y-4">
        <h3 className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">Planilla Comex</h3>

        <label className="block">
          <span className="block text-[11px] text-zinc-400 mb-1">URL de la planilla (Google Sheets)</span>
          <input
            value={cfg.url}
            onChange={e => setCfg({ ...cfg, url: e.target.value })}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="w-full px-3 py-2 rounded-md bg-[#0d0d0d] border border-white/[0.08] text-white text-[12px] placeholder:text-zinc-600 focus:outline-none focus:border-[#E30613]/50"
          />
        </label>

        <label className="block">
          <span className="block text-[11px] text-zinc-400 mb-1">Nombre de la hoja (opcional)</span>
          <input
            value={cfg.sheetName ?? ''}
            onChange={e => setCfg({ ...cfg, sheetName: e.target.value })}
            placeholder="Tracking"
            className="w-full px-3 py-2 rounded-md bg-[#0d0d0d] border border-white/[0.08] text-white text-[12px] placeholder:text-zinc-600 focus:outline-none focus:border-[#E30613]/50"
          />
        </label>

        <button
          onClick={handlePreview}
          disabled={!canPreview || previewing}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-40 text-white inline-flex items-center gap-1.5"
        >
          {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
          Previsualizar columnas
        </button>

        {previewError && (
          <p className="text-[11px] text-red-400 inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {previewError}
          </p>
        )}
      </div>

      {headers.length > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-5 space-y-4">
          <h3 className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">Columnas detectadas ({headers.length})</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] text-zinc-400 mb-1">Columna SO (obligatoria)</span>
              <select
                value={cfg.joinCol}
                onChange={e => setCfg({ ...cfg, joinCol: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-[#0d0d0d] border border-white/[0.08] text-white text-[12px] focus:outline-none focus:border-[#E30613]/50"
              >
                <option value="">— Elegí columna —</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="block text-[11px] text-zinc-400 mb-1">Columna N° Embarque (obligatoria)</span>
              <select
                value={cfg.embarqueCol}
                onChange={e => setCfg({ ...cfg, embarqueCol: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-[#0d0d0d] border border-white/[0.08] text-white text-[12px] focus:outline-none focus:border-[#E30613]/50"
              >
                <option value="">— Elegí columna —</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          </div>

          <div>
            <p className="text-[11px] text-zinc-400 mb-2">Columnas extra a mostrar (opcional, click para alternar):</p>
            <div className="flex flex-wrap gap-1.5">
              {availableExtraHeaders.map(h => {
                const enabled = cfg.extraCols.some(c => c.header === h)
                return (
                  <button
                    key={h}
                    onClick={() => toggleExtraCol(h)}
                    className={`px-2.5 py-1 rounded text-[10px] font-medium border transition-colors ${
                      enabled
                        ? 'bg-[#E30613]/10 text-white border-[#E30613]/40'
                        : 'bg-transparent text-zinc-500 border-white/[0.08] hover:text-zinc-300'
                    }`}
                  >
                    {h}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="px-4 py-2 rounded-md text-[12px] font-medium bg-[#E30613] hover:bg-[#E30613]/85 disabled:opacity-40 text-white inline-flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Guardar
        </button>

        {saveResult && (
          <span className={`text-[11px] inline-flex items-center gap-1.5 ${saveResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {saveResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {saveResult.msg}
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add app/lib/comex.ts app/configuracion/
git commit -m "feat(configuracion): página /configuracion con form simplificado (URL + columnas)"
```

---

## Task 2: Crear `app/lib/dashboard.ts` con helpers de KPIs ejecutivos

**Files:**
- Create: `app/lib/dashboard.ts`

- [ ] **Step 1: Crear el módulo**

```ts
'use server'

import { prisma } from '@/lib/prisma'
import { listEmbarques, type EmbarqueSummary } from '@/app/lib/embarques'

export type ExecutiveKPIs = {
  valorEnTransitoUSD: number    // suma FOB de SOs en embarques pendiente/en-transito
  embarquesActivos: number      // count pendiente + en-transito
  unidadesArribadasMes: number  // suma qty de items en embarques arribados este mes
  slaCumplimiento: number       // % embarques arribados <=21 días desde ETD (de los arribados)
  topProveedores: { name: string; valorUSD: number }[]
  embarquesPorMes: { month: string; count: number }[]      // últimos 12 meses
  discrepanciasPorMes: { month: string; pctConDiff: number }[]  // últimos 6 meses
  tipoCargaDist: { name: string; value: number }[]         // Repuesto / Mercaderia
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function parseDateLoose(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const iso = new Date(raw)
  if (!isNaN(iso.getTime())) return iso
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

export async function getExecutiveKPIs(): Promise<ExecutiveKPIs> {
  const { summaries } = await listEmbarques()

  // ── Active embarques + valor en tránsito ────────────────────────────────────
  const activeEmbarques = summaries.filter(s => s.estado === 'pendiente' || s.estado === 'en-transito')
  const activeSOs = new Set<string>()
  for (const s of activeEmbarques) for (const so of s.sos) activeSOs.add(so)

  const activeItems = await prisma.compraSOItem.findMany({
    where: { soNumber: { in: Array.from(activeSOs) } },
    select: { soNumber: true, fobTotal: true, compra: { select: { supplierName: true } } },
  })
  const valorEnTransitoUSD = activeItems.reduce((s, i) => s + (i.fobTotal ?? 0), 0)

  // ── Unidades arribadas en el mes ────────────────────────────────────────────
  const now = new Date()
  const thisMonth = monthKey(now)
  let unidadesArribadasMes = 0
  for (const s of summaries) {
    if (s.estado !== 'arribado') continue
    // proxy: si ETA cae en el mes, contar las unidades
    const eta = parseDateLoose(s.eta)
    if (eta && monthKey(eta) === thisMonth) unidadesArribadasMes += s.totalQty
  }

  // ── SLA cumplimiento (arribados con tránsito <= 21 días) ────────────────────
  const arribados = summaries.filter(s => s.estado === 'arribado')
  let slaOk = 0
  let slaTotal = 0
  for (const s of arribados) {
    const etd = parseDateLoose(s.etd)
    const eta = parseDateLoose(s.eta)
    if (!etd || !eta) continue
    slaTotal++
    const dias = Math.round((eta.getTime() - etd.getTime()) / (1000 * 60 * 60 * 24))
    if (dias >= 0 && dias <= 21) slaOk++
  }
  const slaCumplimiento = slaTotal === 0 ? 0 : Math.round((slaOk / slaTotal) * 100)

  // ── Top proveedores (por FOB total acumulado) ───────────────────────────────
  const byProveedor = new Map<string, number>()
  const allFobItems = await prisma.compraSOItem.findMany({
    select: { fobTotal: true, compra: { select: { supplierName: true } } },
  })
  for (const i of allFobItems) {
    const name = i.compra.supplierName ?? 'Sin proveedor'
    byProveedor.set(name, (byProveedor.get(name) ?? 0) + (i.fobTotal ?? 0))
  }
  const topProveedores = Array.from(byProveedor.entries())
    .map(([name, valorUSD]) => ({ name, valorUSD }))
    .sort((a, b) => b.valorUSD - a.valorUSD)
    .slice(0, 5)

  // ── Embarques por mes (últimos 12) ──────────────────────────────────────────
  const embByMonth = new Map<string, number>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    embByMonth.set(monthKey(d), 0)
  }
  for (const s of summaries) {
    const etd = parseDateLoose(s.etd)
    if (!etd) continue
    const k = monthKey(etd)
    if (embByMonth.has(k)) embByMonth.set(k, (embByMonth.get(k) ?? 0) + 1)
  }
  const embarquesPorMes = Array.from(embByMonth.entries()).map(([month, count]) => ({ month, count }))

  // ── Discrepancias por mes (últimos 6) ───────────────────────────────────────
  const discByMonth = new Map<string, { total: number; conDiff: number }>()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    discByMonth.set(monthKey(d), { total: 0, conDiff: 0 })
  }
  const recentItems = await prisma.cIPLItem.findMany({
    where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 6, 1) } },
    select: { createdAt: true, qty: true, qPi: true, controlManualQty: true },
  })
  for (const i of recentItems) {
    const k = monthKey(i.createdAt)
    const bucket = discByMonth.get(k)
    if (!bucket) continue
    bucket.total++
    const eq = i.controlManualQty ?? i.qty ?? 0
    if (i.qPi != null && eq !== i.qPi) bucket.conDiff++
  }
  const discrepanciasPorMes = Array.from(discByMonth.entries()).map(([month, b]) => ({
    month,
    pctConDiff: b.total === 0 ? 0 : Math.round((b.conDiff / b.total) * 100),
  }))

  // ── Tipo de carga distribución ──────────────────────────────────────────────
  const tipoCarga = await prisma.cIPLItem.groupBy({
    by: ['tipoCarga'],
    _count: { _all: true },
  })
  const tipoCargaDist = tipoCarga.map(t => ({ name: t.tipoCarga, value: t._count._all }))

  return {
    valorEnTransitoUSD,
    embarquesActivos: activeEmbarques.length,
    unidadesArribadasMes,
    slaCumplimiento,
    topProveedores,
    embarquesPorMes,
    discrepanciasPorMes,
    tipoCargaDist,
  }
}

export type AlertItem = {
  kind: 'critical' | 'warn' | 'info'
  text: string
  href?: string
}

export async function getAlerts(summaries: EmbarqueSummary[]): Promise<AlertItem[]> {
  const alerts: AlertItem[] = []
  const now = new Date()

  for (const s of summaries.slice(0, 30)) {
    const eta = parseDateLoose(s.eta)
    if (!eta) continue
    const days = Math.round((eta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (s.estado === 'en-transito' && days >= 0 && days <= 7) {
      alerts.push({ kind: 'info', text: `${s.embarqueNo} llega en ${days} día${days === 1 ? '' : 's'}`, href: `/embarques/${encodeURIComponent(s.embarqueNo)}` })
    } else if (s.estado === 'en-transito' && days < 0) {
      alerts.push({ kind: 'critical', text: `${s.embarqueNo} ETA pasada hace ${-days} días sin arribo`, href: `/embarques/${encodeURIComponent(s.embarqueNo)}` })
    }
  }

  const itemsSinFoto = await prisma.cIPLItem.count({ where: { photos: { none: {} } } })
  if (itemsSinFoto > 0) {
    alerts.push({ kind: 'warn', text: `${itemsSinFoto} ítems sin foto cargada`, href: '/comercial' })
  }

  return alerts
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: zero errors. Si Prisma reporta error con `controlManualQty`, verificar que el schema lo tiene (Fase 2 lo agregó).

- [ ] **Step 3: Commit**

```bash
git add app/lib/dashboard.ts
git commit -m "feat(dashboard): helpers de KPIs ejecutivos (valor, SLA, top proveedores, charts)"
```

---

## Task 3: Componentes de charts (recharts)

**Files:**
- Create: `components/dashboard/EmbarquesPorMesChart.tsx`
- Create: `components/dashboard/TipoCargaDonut.tsx`
- Create: `components/dashboard/TopProveedoresChart.tsx`
- Create: `components/dashboard/DiscrepanciasTrendChart.tsx`

- [ ] **Step 1: Crear directorio**

```bash
mkdir -p components/dashboard
```

- [ ] **Step 2: Crear `components/dashboard/EmbarquesPorMesChart.tsx`**

```tsx
'use client'

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

type Datum = { month: string; count: number }

function shortMonth(month: string): string {
  const [y, m] = month.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1, 1)
  return date.toLocaleDateString('es-AR', { month: 'short' })
}

export function EmbarquesPorMesChart({ data }: { data: Datum[] }) {
  const fmt = data.map(d => ({ ...d, label: shortMonth(d.month) }))
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={fmt} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: '#a1a1aa' }}
          cursor={{ fill: 'rgba(227,6,19,0.06)' }}
        />
        <Bar dataKey="count" fill="#E30613" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 3: Crear `components/dashboard/TipoCargaDonut.tsx`**

```tsx
'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

type Datum = { name: string; value: number }

const COLORS = ['#E30613', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']

export function TipoCargaDonut({ data }: { data: Datum[] }) {
  if (data.length === 0) {
    return <p className="text-[11px] text-zinc-500 text-center py-10">Sin datos</p>
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip
          contentStyle={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: '#a1a1aa' }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 4: Crear `components/dashboard/TopProveedoresChart.tsx`**

```tsx
'use client'

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

type Datum = { name: string; valorUSD: number }

const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function TopProveedoresChart({ data }: { data: Datum[] }) {
  if (data.length === 0) {
    return <p className="text-[11px] text-zinc-500 text-center py-10">Sin datos</p>
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 8, bottom: 0, left: 80 }}>
        <XAxis type="number" stroke="#71717a" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
        <YAxis type="category" dataKey="name" stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={80} />
        <Tooltip
          contentStyle={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: '#a1a1aa' }}
          formatter={(v: number) => fmtUSD.format(v)}
          cursor={{ fill: 'rgba(139,92,246,0.06)' }}
        />
        <Bar dataKey="valorUSD" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 5: Crear `components/dashboard/DiscrepanciasTrendChart.tsx`**

```tsx
'use client'

import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

type Datum = { month: string; pctConDiff: number }

function shortMonth(month: string): string {
  const [y, m] = month.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1, 1)
  return date.toLocaleDateString('es-AR', { month: 'short' })
}

export function DiscrepanciasTrendChart({ data }: { data: Datum[] }) {
  const fmt = data.map(d => ({ ...d, label: shortMonth(d.month) }))
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={fmt} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
        <Tooltip
          contentStyle={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: '#a1a1aa' }}
          formatter={(v: number) => `${v}%`}
        />
        <Line type="monotone" dataKey="pctConDiff" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 6: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: zero errors. Si recharts da issues, confirmar versión instalada con `grep "\"recharts\"" package.json`.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/
git commit -m "feat(dashboard): 4 charts con recharts (embarques/mes, donut, top proveedores, discrepancias)"
```

---

## Task 4: Reemplazar `app/page.tsx` con tablero ejecutivo completo

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Reemplazar contenido completo**

```tsx
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Anchor, AlertTriangle, ArrowRight, Building2, TrendingUp, BarChart3, Activity, PieChart } from 'lucide-react'
import { listEmbarques } from '@/app/lib/embarques'
import { getExecutiveKPIs, getAlerts } from '@/app/lib/dashboard'
import { KPICard } from '@/components/shared/KPICard'
import { StatusPill } from '@/components/shared/StatusPill'
import { DateRange } from '@/components/shared/DateRange'
import { EmbarquesPorMesChart } from '@/components/dashboard/EmbarquesPorMesChart'
import { TipoCargaDonut } from '@/components/dashboard/TipoCargaDonut'
import { TopProveedoresChart } from '@/components/dashboard/TopProveedoresChart'
import { DiscrepanciasTrendChart } from '@/components/dashboard/DiscrepanciasTrendChart'

const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default async function HomePage() {
  const [{ summaries, errors }, kpis] = await Promise.all([listEmbarques(), getExecutiveKPIs()])
  const alerts = await getAlerts(summaries)

  return (
    <div className="px-6 py-5 max-w-[1600px]">
      <h1 className="text-2xl font-display font-bold text-white tracking-tight mb-1">Tablero ejecutivo</h1>
      <p className="text-[12px] text-zinc-500 mb-6">Resumen operativo de importaciones DJI Argentina</p>

      {errors.length > 0 && (
        <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md border border-amber-500/20 bg-amber-500/[0.05] text-[12px] text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Hay {errors.length} aviso{errors.length === 1 ? '' : 's'} al leer la planilla Comex. Revisá <Link href="/configuracion" className="underline">Configuración</Link>.</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KPICard label="Valor en tránsito"   value={fmtUSD.format(kpis.valorEnTransitoUSD)} hint="FOB SOs activos"      accent="red"     />
        <KPICard label="Embarques activos"   value={kpis.embarquesActivos.toString()}        hint="pendiente + tránsito" accent="blue"    />
        <KPICard label="Unidades del mes"    value={kpis.unidadesArribadasMes.toLocaleString()} hint="arribadas este mes" accent="emerald" />
        <KPICard label="SLA cumplimiento"    value={`${kpis.slaCumplimiento}%`}              hint="arribo ≤ 21 días"    accent="amber"   />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <section className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#E30613]" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Embarques por mes</h2>
            <span className="ml-auto text-[10px] text-zinc-500">últimos 12</span>
          </div>
          <div className="p-3"><EmbarquesPorMesChart data={kpis.embarquesPorMes} /></div>
        </section>

        <section className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Building2 className="w-4 h-4 text-purple-400" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Top proveedores</h2>
            <span className="ml-auto text-[10px] text-zinc-500">por FOB total</span>
          </div>
          <div className="p-3"><TopProveedoresChart data={kpis.topProveedores} /></div>
        </section>

        <section className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Tendencia discrepancias</h2>
            <span className="ml-auto text-[10px] text-zinc-500">% ítems con dif. qty</span>
          </div>
          <div className="p-3"><DiscrepanciasTrendChart data={kpis.discrepanciasPorMes} /></div>
        </section>

        <section className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <PieChart className="w-4 h-4 text-blue-400" />
            <h2 className="text-[12px] font-display font-semibold text-white uppercase tracking-wide">Distribución tipo de carga</h2>
          </div>
          <div className="p-3"><TipoCargaDonut data={kpis.tipoCargaDist} /></div>
        </section>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
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

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(home): tablero ejecutivo completo con 4 charts + KPIs + alertas"
```

---

## Task 5: API `/api/search` para búsqueda global

**Files:**
- Create: `app/api/search/route.ts`

- [ ] **Step 1: Crear el endpoint**

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listEmbarques } from '@/app/lib/embarques'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type SearchResult = {
  embarques: { embarqueNo: string; estado: string; sos: string[] }[]
  sos:       { soNumber: string; count: number }[]
  asns:      { asn: string; count: number }[]
  productos: { id: string; description: string; sku: string | null; codeEan: string | null; soPrincipal: string | null }[]
  compras:   { id: string; piNo: string | null; supplierName: string | null }[]
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < 2) {
    return NextResponse.json<SearchResult>({ embarques: [], sos: [], asns: [], productos: [], compras: [] })
  }

  const qUpper = q.toUpperCase()

  const [{ summaries }, sosRaw, asnsRaw, productos, compras] = await Promise.all([
    listEmbarques(),
    prisma.cIPLItem.groupBy({
      where: { soPrincipal: { contains: qUpper, mode: 'insensitive' } },
      by: ['soPrincipal'],
      _count: { _all: true },
      take: 5,
    }),
    prisma.cIPLItem.groupBy({
      where: { asn: { contains: qUpper, mode: 'insensitive' } },
      by: ['asn'],
      _count: { _all: true },
      take: 5,
    }),
    prisma.cIPLItem.findMany({
      where: {
        OR: [
          { description: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
          { codeEan: { contains: q } },
        ],
      },
      select: { id: true, description: true, sku: true, codeEan: true, soPrincipal: true },
      take: 8,
    }),
    prisma.compra.findMany({
      where: {
        OR: [
          { piNo: { contains: q, mode: 'insensitive' } },
          { supplierName: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, piNo: true, supplierName: true },
      take: 5,
    }),
  ])

  const embarques = summaries
    .filter(s => s.embarqueNo.toUpperCase().includes(qUpper) || s.sos.some(so => so.includes(qUpper)))
    .slice(0, 5)
    .map(s => ({ embarqueNo: s.embarqueNo, estado: s.estado, sos: s.sos }))

  return NextResponse.json<SearchResult>({
    embarques,
    sos:  sosRaw.filter(s => s.soPrincipal != null).map(s => ({ soNumber: s.soPrincipal!, count: s._count._all })),
    asns: asnsRaw.filter(a => a.asn != null).map(a => ({ asn: a.asn!, count: a._count._all })),
    productos: productos.map(p => ({ ...p, description: p.description ?? '—' })),
    compras,
  })
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Smoke test**

Con dev server corriendo: `curl 'http://localhost:3000/api/search?q=DJI'` debería retornar JSON con los 5 buckets.

- [ ] **Step 4: Commit**

```bash
git add app/api/search/route.ts
git commit -m "feat(search): endpoint /api/search con 5 buckets (embarques, SOs, ASNs, productos, compras)"
```

---

## Task 6: Componente `<CmdK>` y wire al layout

**Files:**
- Create: `components/shared/CmdK.tsx`
- Modify: `components/layout-shell.tsx`

- [ ] **Step 1: Crear `components/shared/CmdK.tsx`**

```tsx
'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Anchor, Package, ShoppingCart, FileText, Loader2 } from 'lucide-react'
import type { SearchResult } from '@/app/api/search/route'

export function CmdK() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Global shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else { setQuery(''); setResults(null) }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) { setResults(null); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res: SearchResult = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`).then(r => r.json())
        setResults(res)
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  if (!open) return null

  const total = results
    ? results.embarques.length + results.sos.length + results.asns.length + results.productos.length + results.compras.length
    : 0

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-2xl bg-[#0a0a0a] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar embarque, SO, ASN, producto o compra…"
            className="flex-1 bg-transparent text-white text-[14px] placeholder:text-zinc-600 focus:outline-none"
          />
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />}
          <kbd className="text-[9px] font-mono text-zinc-600 border border-white/[0.08] rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim().length < 2 && (
            <p className="px-4 py-8 text-center text-zinc-500 text-[12px]">Escribí al menos 2 caracteres</p>
          )}

          {results && total === 0 && (
            <p className="px-4 py-8 text-center text-zinc-500 text-[12px]">Sin resultados para &quot;{query}&quot;</p>
          )}

          {results && total > 0 && (
            <div className="p-2 space-y-3">
              {results.embarques.length > 0 && (
                <Section title="Embarques" icon={Anchor}>
                  {results.embarques.map(e => (
                    <Row key={e.embarqueNo} onClick={() => go(`/embarques/${encodeURIComponent(e.embarqueNo)}`)}>
                      <span className="font-mono text-[12px] text-white">{e.embarqueNo}</span>
                      <span className="ml-auto text-[10px] text-zinc-500">{e.sos.length} SOs · {e.estado}</span>
                    </Row>
                  ))}
                </Section>
              )}

              {results.sos.length > 0 && (
                <Section title="SOs" icon={Package}>
                  {results.sos.map(s => (
                    <Row key={s.soNumber} onClick={() => go(`/embarques?q=${encodeURIComponent(s.soNumber)}`)}>
                      <span className="font-mono text-[12px] text-emerald-400">{s.soNumber}</span>
                      <span className="ml-auto text-[10px] text-zinc-500">{s.count} ítem{s.count === 1 ? '' : 's'}</span>
                    </Row>
                  ))}
                </Section>
              )}

              {results.asns.length > 0 && (
                <Section title="ASNs" icon={Package}>
                  {results.asns.map(a => (
                    <Row key={a.asn} onClick={() => go(`/embarques?q=${encodeURIComponent(a.asn)}`)}>
                      <span className="font-mono text-[12px] text-amber-400">{a.asn}</span>
                      <span className="ml-auto text-[10px] text-zinc-500">{a.count} ítem{a.count === 1 ? '' : 's'}</span>
                    </Row>
                  ))}
                </Section>
              )}

              {results.productos.length > 0 && (
                <Section title="Productos" icon={FileText}>
                  {results.productos.map(p => (
                    <Row key={p.id} onClick={() => go(p.soPrincipal ? `/embarques?q=${encodeURIComponent(p.soPrincipal)}` : '/embarques')}>
                      <span className="text-[12px] text-zinc-200 truncate">{p.description}</span>
                      <span className="ml-auto text-[10px] text-zinc-500 font-mono">{p.sku ?? p.codeEan ?? ''}</span>
                    </Row>
                  ))}
                </Section>
              )}

              {results.compras.length > 0 && (
                <Section title="Compras" icon={ShoppingCart}>
                  {results.compras.map(c => (
                    <Row key={c.id} onClick={() => go(`/compras/${c.id}`)}>
                      <span className="text-[12px] text-white">{c.piNo ?? c.id.slice(0, 8)}</span>
                      {c.supplierName && <span className="ml-2 text-[11px] text-zinc-500 truncate">{c.supplierName}</span>}
                    </Row>
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-white/[0.06] flex items-center gap-3 text-[10px] text-zinc-500">
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span className="ml-auto">⌘K / Ctrl+K para abrir</span>
        </div>
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-2 pb-1 text-[9px] uppercase tracking-wider text-zinc-600 font-semibold flex items-center gap-1.5">
        <Icon className="w-3 h-3" /> {title}
      </p>
      <div>{children}</div>
    </div>
  )
}

function Row({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/[0.04] text-left"
    >
      {children}
    </button>
  )
}
```

- [ ] **Step 2: Wire en `components/layout-shell.tsx`**

Leer el archivo actual. Agregar el import:

```tsx
import { CmdK } from './shared/CmdK'
```

(Si `CmdK` está en `components/shared/CmdK.tsx`, el import desde `layout-shell.tsx` es `./shared/CmdK`.)

Renderizar `<CmdK />` justo después de `<Sidebar ... />` (o al final del flex container). Por ejemplo, dentro del `<div className="flex h-screen ...">`:

```tsx
<div className="flex h-screen overflow-hidden">
  <Sidebar collapsed={collapsed} onToggle={toggle} />
  <main ...>{children}</main>
  <CmdK />
</div>
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Smoke test**

Con dev server: presionar cmd+k (o ctrl+k). Debería abrir el modal. Escribir "DJI" y ver resultados. Escape o click fuera cierra.

- [ ] **Step 5: Commit**

```bash
git add components/shared/CmdK.tsx components/layout-shell.tsx
git commit -m "feat(search): componente CmdK con atajo global cmd+k y resultados agrupados"
```

---

## Task 7: Tab Historial en embarque detail

**Files:**
- Create: `app/embarques/[embarqueNo]/tabs/HistorialTab.tsx`
- Modify: `app/embarques/[embarqueNo]/EmbarqueDetailClient.tsx`

- [ ] **Step 1: Crear `HistorialTab.tsx`**

```tsx
'use client'

import { History, CheckCircle2, MessageSquare, Pencil } from 'lucide-react'
import type { EmbarqueItem } from '../types'

type Event = {
  ts: string
  kind: 'reviewed' | 'manual-qty' | 'nota'
  itemDesc: string
  detail: string
  by: string | null
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function HistorialTab({ items }: { items: EmbarqueItem[] }) {
  const events: Event[] = []

  for (const it of items) {
    const desc = it.description ?? it.soPrincipal ?? it.id.slice(0, 8)
    if (it.controlReviewed && it.controlReviewedAt) {
      events.push({
        ts: it.controlReviewedAt,
        kind: 'reviewed',
        itemDesc: desc,
        detail: 'marcó revisado',
        by: it.controlReviewedBy,
      })
    }
    if (it.controlManualQty != null) {
      events.push({
        ts: it.controlReviewedAt ?? new Date().toISOString(),
        kind: 'manual-qty',
        itemDesc: desc,
        detail: `qty manual ${it.controlManualQty} (original PL: ${it.qty ?? '—'})`,
        by: it.controlReviewedBy,
      })
    }
    if (it.controlNota) {
      events.push({
        ts: it.controlReviewedAt ?? new Date().toISOString(),
        kind: 'nota',
        itemDesc: desc,
        detail: `nota: "${it.controlNota}"`,
        by: it.controlReviewedBy,
      })
    }
  }

  events.sort((a, b) => b.ts.localeCompare(a.ts))

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] py-12 text-center">
        <History className="w-8 h-8 mx-auto text-zinc-700 mb-2" />
        <p className="text-zinc-500 text-[12px]">Sin actividad de control registrada en este embarque.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
      <div className="divide-y divide-white/[0.04]">
        {events.map((e, i) => {
          const Icon = e.kind === 'reviewed' ? CheckCircle2 : e.kind === 'manual-qty' ? Pencil : MessageSquare
          const cls = e.kind === 'reviewed' ? 'text-emerald-400' : e.kind === 'manual-qty' ? 'text-amber-400' : 'text-blue-400'
          return (
            <div key={i} className="px-4 py-3 flex items-start gap-3">
              <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cls}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-zinc-200 truncate">
                  <span className="text-zinc-500">{e.by ?? '—'}</span> {e.detail}
                </p>
                <p className="text-[10px] text-zinc-600 truncate">{e.itemDesc}</p>
              </div>
              <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">{fmtDate(e.ts)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Modificar `EmbarqueDetailClient.tsx` para incluir el tab**

Leer el archivo. Buscar el array `TABS`. Agregar al final:

```tsx
{ id: 'historial', label: 'Historial' },
```

Buscar el `TabId` type union y agregar `| 'historial'`.

Buscar la lista de imports al tope y agregar:

```tsx
import { HistorialTab } from './tabs/HistorialTab'
```

Buscar la sección de rendering condicional (`{tab === 'compras' && ...}`) y agregar al final:

```tsx
{tab === 'historial' && <HistorialTab items={detail.items} />}
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add 'app/embarques/[embarqueNo]/'
git commit -m "feat(embarques): tab Historial con audit log de control"
```

---

## Task 8: Sidebar limpio + agregar Configuración

**Files:**
- Modify: `components/sidebar.tsx`

- [ ] **Step 1: Reemplazar el array `nav`**

Leer el archivo. Encontrar `const nav = [...]`. Reemplazar TODO el array con:

```ts
const nav = [
  { href: '/',              label: 'Inicio',        icon: Home,         legacy: false, badge: null },
  { href: '/embarques',     label: 'Embarques',     icon: Anchor,       legacy: false, badge: null },
  { href: '/compras',       label: 'Compras',       icon: ShoppingCart, legacy: false, badge: null },
  { href: '/comercial',     label: 'Carga CIPL',    icon: Upload,       legacy: false, badge: null },
  { href: '/configuracion', label: 'Configuración', icon: Settings,     legacy: false, badge: null },
]
```

Notas:
- Removimos TODAS las entradas legacy. El sistema queda con 5 entries (incluida Inicio y Configuración).
- El "Nuevo" badge en Embarques se quita ya que pasamos de Beta a stable.
- `Settings` ya estaba importado; verificar que `LayoutDashboard`, `Database`, `BarChart2` se pueden eliminar de los imports si nadie más los usa en este archivo. Mantener solo: `Home, Anchor, Upload, ChevronLeft, ChevronRight, Send, ShoppingCart, Settings`.

- [ ] **Step 2: Limpiar el rendering condicional**

Buscar la sección que renderiza el "Legacy" header (algo como `{showLegacyHeader && !collapsed && (...)`). Removerla completamente — ya no hay items legacy.

También remover el cálculo de `firstLegacyIdx` si está al inicio del map.

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit
```

Expected: zero errors. Si hay errores de imports no usados, removerlos.

- [ ] **Step 4: Commit**

```bash
git add components/sidebar.tsx
git commit -m "feat(nav): sidebar limpio con solo módulos activos + Configuración"
```

---

## Task 9: Eliminar módulos legacy (rutas)

**Files:**
- Delete: `app/panel-general/` (entire directory)
- Delete: `app/comex/` (entire directory)
- Delete: `app/inspeccion/` (entire directory)
- Delete: `app/reportes/` (entire directory)
- Delete: `app/operaciones/` (entire directory)

- [ ] **Step 1: Verificar que no hay imports activos hacia estos módulos**

```bash
grep -rE "from '@/app/(panel-general|comex|inspeccion|reportes|operaciones)/" /workspaces/Panel-Compras/app /workspaces/Panel-Compras/components /workspaces/Panel-Compras/lib 2>/dev/null | grep -v "node_modules" | head -10
```

Si hay imports activos desde código no-legacy, frenar y reportar. Si solo hay imports DENTRO de estos módulos (entre sí), proceder.

- [ ] **Step 2: Eliminar directorios**

```bash
rm -rf /workspaces/Panel-Compras/app/panel-general
rm -rf /workspaces/Panel-Compras/app/comex
rm -rf /workspaces/Panel-Compras/app/inspeccion
rm -rf /workspaces/Panel-Compras/app/reportes
rm -rf /workspaces/Panel-Compras/app/operaciones
```

- [ ] **Step 3: Verificar que tsc sigue pasando**

```bash
npx tsc --noEmit
```

Si hay errores en otros archivos referenciando estos módulos, identificarlos y limpiar los imports huérfanos.

- [ ] **Step 4: Commit**

```bash
git add -A app/panel-general app/comex app/inspeccion app/reportes app/operaciones
git commit -m "chore(cleanup): eliminar módulos legacy (panel-general, comex, inspeccion, reportes, operaciones)"
```

---

## Task 10: Eliminar libs legacy

**Files:**
- Delete: `app/lib/comex-sources.ts`
- Delete: `app/lib/comex-fields.ts`

- [ ] **Step 1: Verificar imports**

```bash
grep -rE "from '@/app/lib/(comex-sources|comex-fields)'" /workspaces/Panel-Compras/app /workspaces/Panel-Compras/components 2>/dev/null | head -10
```

Si hay referencias en código que SOBREVIVE (no en módulos eliminados), reportarlas. La fallback de Fase 1 en `app/lib/comex.ts` lee la config legacy directamente vía Prisma — no necesita importar `comex-sources.ts`.

- [ ] **Step 2: Eliminar**

```bash
rm /workspaces/Panel-Compras/app/lib/comex-sources.ts
rm /workspaces/Panel-Compras/app/lib/comex-fields.ts
```

- [ ] **Step 3: Verificar tsc**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add app/lib/
git commit -m "chore(cleanup): eliminar comex-sources.ts y comex-fields.ts (reemplazados por comex.ts)"
```

---

## Task 11: Mobile polish — cards stackeadas en lista de embarques

**Files:**
- Modify: `app/embarques/EmbarquesListClient.tsx`

- [ ] **Step 1: Agregar vista mobile alternativa**

La tabla actual tiene `overflow-x-auto` para mobile, pero scroll horizontal en mobile es feo. Agregar una vista de cards stackeadas que se muestre en `sm:` y la tabla en `md:` para arriba.

Leer `app/embarques/EmbarquesListClient.tsx`. Encontrar el bloque `<div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">` con la tabla adentro.

Reemplazar ese bloque con esto (mantiene la tabla para `md+` y agrega cards para mobile):

```tsx
{/* Mobile: cards */}
<div className="md:hidden space-y-2">
  {filtered.length === 0 ? (
    <p className="px-4 py-10 text-center text-zinc-500 text-[12px] rounded-lg border border-white/[0.06] bg-[#0a0a0a]">
      No hay embarques que coincidan con el filtro.
    </p>
  ) : filtered.map(s => (
    <Link
      key={s.embarqueNo}
      href={`/embarques/${encodeURIComponent(s.embarqueNo)}`}
      className="block rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-3 hover:bg-white/[0.02] transition-colors"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono font-semibold text-white text-[13px]">{s.embarqueNo}</span>
        <StatusPill estado={s.estado} className="ml-auto" />
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <DateRange etd={s.etd} eta={s.eta} />
        {s.awb && <span className="font-mono text-[10px] text-zinc-500">· {s.awb}</span>}
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {s.sos.slice(0, 4).map(so => (
          <span key={so} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/[0.04] text-zinc-400">{so}</span>
        ))}
        {s.sos.length > 4 && <span className="text-[9px] text-zinc-500">+{s.sos.length - 4}</span>}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-zinc-500 pt-2 border-t border-white/[0.04]">
        <span>{s.totalQty.toLocaleString()} unidades</span>
        <span>{s.totalCbm.toFixed(2)} CBM</span>
      </div>
    </Link>
  ))}
</div>

{/* Desktop: table */}
<div className="hidden md:block rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
  <div className="overflow-x-auto -mx-2 px-2">
    {/* el contenido <table>...</table> EXISTENTE va acá adentro sin cambios */}
  </div>
</div>
```

Importante: el `<table>...</table>` EXISTING que estaba dentro del div eliminado tiene que quedar adentro del nuevo `<div className="hidden md:block ...">` para que se siga viendo en desktop.

- [ ] **Step 2: Verificar tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Smoke test**

Abrir `/embarques` en desktop → tabla normal. Resize a < 768px (mobile) → cards stackeadas.

- [ ] **Step 4: Commit**

```bash
git add app/embarques/EmbarquesListClient.tsx
git commit -m "feat(embarques): cards stackeadas en mobile en lugar de scroll horizontal"
```

---

## Task 12: Final verification

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Lint sweep**

```bash
npm run lint 2>&1 | tail -40
```

Identificar warnings/errors residuales. Errores deben arreglarse; warnings pueden quedar.

- [ ] **Step 3: Build check (production)**

```bash
npm run build 2>&1 | tail -30
```

Expected: build succeeds. Si falla, identificar el archivo y arreglar.

- [ ] **Step 4: Smoke test end-to-end**

Con dev server:

1. `/` → tablero ejecutivo: 4 KPIs, 4 charts (recharts renderiza), bandeja alertas, últimos embarques.
2. Presionar cmd+k → modal de búsqueda. Escribir "EMB" o un SO → resultados agrupados aparecen.
3. `/configuracion` → form con URL, sheet, columnas. Click "Previsualizar columnas" → lista de headers detectados. Toggle extra cols.
4. `/embarques/[id]` → tab Historial aparece como sexta opción. Si hay items con `controlReviewed=true` o nota, los lista.
5. Sidebar: solo 5 items (Inicio, Embarques, Compras, Carga CIPL, Configuración).
6. `/inspeccion`, `/panel-general`, `/comex`, `/reportes`, `/operaciones` → 404 (rutas eliminadas).
7. Mobile (viewport iPhone 12): `/embarques` muestra cards stackeadas.

- [ ] **Step 5: Tag final**

```bash
git tag -a fase-3-completa -m "Fase 3 completa: tablero ejecutivo + cmd+k + configuración + cleanup"
```

---

## Lo que queda (futuro, no Fase 3)

Estos quedaron explícitamente fuera de scope (spec section 11):
- Notificaciones push / email
- Versionado/history más detallado que el actual (eventos individuales con full audit)
- Integración bidireccional con Comex (solo leemos)
- Multi-empresa / multi-tenant
- API pública
- Migración de DB structure (la actual ya funciona)

El sistema queda en estado producción-ready después de Fase 3.
