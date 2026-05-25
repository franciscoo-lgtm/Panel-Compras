# Restructuración Fase 2 — Stepper + IA + Control con acciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar el módulo de Embarques con acciones interactivas en el tab Control, restylar `/comercial` al dark theme premium de Fase 1 con stepper de 5 pasos (fusionando `/inspeccion`), y mejorar la inteligencia en extracción de fotos y CIPLs.

**Architecture:** Schema migration agrega 4 campos de control a `CIPLItem` (manualQty, reviewed, reviewedAt, reviewedBy, nota). Server actions persisten cambios y el ControlTab pasa a modo edición. El flujo `/comercial` se restyla a dark theme y se expande a 5 pasos: Upload → Asignar SOs → Fotos (lógica de `/inspeccion` extraída a componente compartido) → Control → Confirm. Las mejoras de IA tocan tres puntos: `suggest-sos` con auto-accept high confidence, extracción de modelo+qty desde fotos de inspección, y parser CIPL tolerante a variaciones de header.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Prisma 7 + Neon Postgres, Tailwind v4, Anthropic SDK (`@anthropic-ai/sdk` ya instalado), `fflate` para descomprimir Excel, `xlsx`.

**Scope:** Fase 2 únicamente. Fase 3 (dashboard completo con charts, cmd+k, configuración, cleanup de módulos legacy) queda como plan separado.

**Validation strategy:** Smoke tests manuales (no hay test framework). Cada tarea tiene un paso de validación con expectativas claras.

---

## File Structure

### Nuevos archivos (Fase 2)
- `app/lib/control-actions.ts` — server actions: marcar revisado, set qty manual, set nota
- `app/comercial/_components/StepperShell.tsx` — UI del stepper visual con 5 pasos
- `app/comercial/_components/Step1Upload.tsx` — extraído del page.tsx actual, restylado
- `app/comercial/_components/Step2AssignSOs.tsx` — extraído + mejoras de IA
- `app/comercial/_components/Step3Photos.tsx` — usa nuevo `<InspectionPhotoUploader>` shared
- `app/comercial/_components/Step4Control.tsx` — control de qty+fotos antes de confirmar
- `app/comercial/_components/Step5Confirm.tsx` — finalización
- `components/shared/InspectionPhotoUploader.tsx` — extraído de `/inspeccion`, reusable
- `app/api/extract-photo-info/route.ts` — endpoint IA: model + qty desde foto

### Archivos modificados
- `prisma/schema.prisma` — agregar 5 campos a `CIPLItem`
- `app/lib/embarques.ts` — incluir nuevos campos, computar `effectiveQty`
- `app/embarques/[embarqueNo]/types.ts` — agregar fields a `EmbarqueItem`
- `app/embarques/[embarqueNo]/tabs/ControlTab.tsx` — convertir a interactivo
- `app/comercial/page.tsx` — reescribir como orquestador del stepper (delegando a componentes)
- `app/api/suggest-sos/route.ts` — agregar confidence + auto-accept setting
- `app/api/cipl-parse/route.ts` — header tolerance (si existe) o `app/lib/etl.ts`
- `app/inspeccion/page.tsx` — redirect a `/comercial?step=3` (cleanup en Fase 3)

### Untouched
- `app/lib/comex.ts`, `app/lib/embarques.ts`, `app/lib/roles.ts` — solo lectura adicional, no se restructuran
- Todo el módulo de Embarques de Fase 1 — solo se enriquece el ControlTab y `types.ts`
- Componentes shared de Fase 1 — solo se agregan nuevos

---

## Task 1: Schema migration — agregar campos de control a CIPLItem

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Agregar los 5 campos al modelo `CIPLItem`**

Abrí `prisma/schema.prisma`. Buscá el modelo `CIPLItem`. Dentro del modelo, agregá estos campos justo antes de la sección `// ── Fotos inspección ──`:

```prisma
  // ── Control (Fase 2) ───────────────────────────────────────────────────────
  controlReviewed   Boolean   @default(false)
  controlReviewedAt DateTime?
  controlReviewedBy String?
  controlNota       String?
  controlManualQty  Int?
```

- [ ] **Step 2: Aplicar la migración a la DB (db push, no migrations files)**

Ejecutar:

```bash
npx prisma db push
```

Expected output: `Your database is now in sync with your Prisma schema. Done in Xms`

Si pide confirmar la creación de columnas, responder `y`.

- [ ] **Step 3: Regenerar el client de Prisma**

Ejecutar:

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client (vX.Y.Z) to ./app/generated/prisma`

- [ ] **Step 4: Verificar que los tipos compilen**

```bash
npx tsc --noEmit
```

Expected: zero errors. Los nuevos campos están disponibles como `controlReviewed: boolean`, `controlReviewedAt: Date | null`, etc.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): agregar campos de control a CIPLItem (reviewed, nota, manualQty)"
```

Nota: el cliente generado (`app/generated/prisma/`) está gitignored — solo se commitea el schema.

---

## Task 2: Server actions para control

**Files:**
- Create: `app/lib/control-actions.ts`

- [ ] **Step 1: Crear `app/lib/control-actions.ts`**

```ts
'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getCurrentRole } from '@/app/lib/roles'

type Result = { ok: true } | { ok: false; error: string }

async function actor(): Promise<string> {
  // TODO: cuando NextAuth esté wired up, usar la sesión real
  const role = await getCurrentRole()
  return role ?? 'desconocido'
}

export async function markReviewed(itemId: string, reviewed: boolean): Promise<Result> {
  try {
    await prisma.cIPLItem.update({
      where: { id: itemId },
      data: reviewed
        ? { controlReviewed: true,  controlReviewedAt: new Date(), controlReviewedBy: await actor() }
        : { controlReviewed: false, controlReviewedAt: null,        controlReviewedBy: null },
    })
    revalidatePath('/embarques', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function setManualQty(itemId: string, qty: number | null): Promise<Result> {
  try {
    await prisma.cIPLItem.update({
      where: { id: itemId },
      data: { controlManualQty: qty },
    })
    revalidatePath('/embarques', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function setNota(itemId: string, nota: string | null): Promise<Result> {
  try {
    await prisma.cIPLItem.update({
      where: { id: itemId },
      data: { controlNota: (nota ?? '').trim() || null },
    })
    revalidatePath('/embarques', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/control-actions.ts
git commit -m "feat(control): server actions para marcar revisado, qty manual y notas"
```

---

## Task 3: Incluir campos de control en `embarques.ts` y el tipo `EmbarqueItem`

**Files:**
- Modify: `app/lib/embarques.ts`
- Modify: `app/embarques/[embarqueNo]/types.ts`

- [ ] **Step 1: Modificar `app/lib/embarques.ts`**

El `findMany` con `include: { photos: true }` ya trae todos los scalares de `CIPLItem`, por lo cual los 5 campos nuevos están incluidos automáticamente. NO requiere cambios en `embarques.ts`. Solo verificar leyendo `getEmbarqueDetail`: el include es `{ photos: true }` y eso es suficiente.

- [ ] **Step 2: Extender `EmbarqueItem` en `app/embarques/[embarqueNo]/types.ts`**

Abrí el archivo y reemplazá `EmbarqueItem` con esta versión extendida:

```ts
export type EmbarqueItem = {
  id: string
  asn: string | null
  soPrincipal: string | null
  description: string | null
  sku: string | null
  codeEan: string | null
  qty: number | null
  qPi: number | null
  diferenciaPiPl: number | null
  cbm: number | null
  gwKg: number | null
  photos: { id: string; dataUrl: string }[]
  // ── Control (Fase 2) ──────────────────────────────────────────────────────
  controlReviewed: boolean
  controlReviewedAt: string | null   // ISO string después de JSON.parse(JSON.stringify(...))
  controlReviewedBy: string | null
  controlNota: string | null
  controlManualQty: number | null
}
```

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: zero errors. (Si la versión serializada del item difiere, ajustar el tipo.)

- [ ] **Step 4: Commit**

```bash
git add app/embarques/'[embarqueNo]'/types.ts
git commit -m "feat(embarques): incluir campos de control en EmbarqueItem type"
```

---

## Task 4: ControlTab interactivo — marker, qty edit, nota

**Files:**
- Modify: `app/embarques/[embarqueNo]/tabs/ControlTab.tsx`

- [ ] **Step 1: Reemplazar `ControlTab.tsx` con la versión interactiva**

```tsx
'use client'

import { useState, useMemo, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Camera, CameraOff, CheckCircle2, AlertTriangle, MessageSquare, Pencil, Loader2 } from 'lucide-react'
import { markReviewed, setManualQty, setNota } from '@/app/lib/control-actions'
import type { EmbarqueItem } from '../types'

type Filter = 'todos' | 'con-diferencia' | 'sin-foto' | 'pendientes' | 'revisados'

function effectiveQty(it: EmbarqueItem): number {
  return it.controlManualQty ?? it.qty ?? 0
}

export function ControlTab({ items: initialItems }: { items: EmbarqueItem[] }) {
  const [items, setItems] = useState<EmbarqueItem[]>(initialItems)
  const [filter, setFilter] = useState<Filter>('todos')
  const [editing, setEditing] = useState<{ id: string; field: 'qty' | 'nota' } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [pending, start] = useTransition()
  const [savingId, setSavingId] = useState<string | null>(null)

  const summary = useMemo(() => {
    const conDiff = items.filter(i =>
      i.qPi != null && effectiveQty(i) !== i.qPi
    ).length
    const sinFoto = items.filter(i => i.photos.length === 0).length
    const revisados = items.filter(i => i.controlReviewed).length
    const pendientes = items.length - revisados
    const ok = items.length - conDiff - sinFoto
    return { conDiff, sinFoto, ok, total: items.length, revisados, pendientes }
  }, [items])

  const visible = useMemo(() => {
    return items.filter(i => {
      const eqty = effectiveQty(i)
      const hasDiff = i.qPi != null && eqty !== i.qPi
      const noPhoto = i.photos.length === 0
      switch (filter) {
        case 'todos':          return true
        case 'con-diferencia': return hasDiff
        case 'sin-foto':       return noPhoto
        case 'pendientes':     return !i.controlReviewed
        case 'revisados':      return i.controlReviewed
      }
    })
  }, [items, filter])

  const filters: { id: Filter; label: string; count: number; cls: string }[] = [
    { id: 'todos',          label: 'Todos',           count: summary.total,      cls: 'border-white/[0.1]' },
    { id: 'pendientes',     label: 'Pendientes',      count: summary.pendientes, cls: 'border-amber-500/30 text-amber-400' },
    { id: 'revisados',      label: 'Revisados',       count: summary.revisados,  cls: 'border-emerald-500/30 text-emerald-400' },
    { id: 'con-diferencia', label: 'Diferencia qty',  count: summary.conDiff,    cls: 'border-amber-500/30 text-amber-400' },
    { id: 'sin-foto',       label: 'Sin foto',        count: summary.sinFoto,    cls: 'border-red-500/30 text-red-400' },
  ]

  function patch(id: string, patch: Partial<EmbarqueItem>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  function toggleReview(it: EmbarqueItem) {
    const next = !it.controlReviewed
    patch(it.id, {
      controlReviewed: next,
      controlReviewedAt: next ? new Date().toISOString() : null,
      controlReviewedBy: next ? 'tú' : null,
    })
    setSavingId(it.id)
    start(async () => {
      const res = await markReviewed(it.id, next)
      if (!res.ok) {
        patch(it.id, {
          controlReviewed: it.controlReviewed,
          controlReviewedAt: it.controlReviewedAt,
          controlReviewedBy: it.controlReviewedBy,
        })
      }
      setSavingId(null)
    })
  }

  function startEdit(id: string, field: 'qty' | 'nota', current: string) {
    setEditing({ id, field })
    setEditValue(current)
  }

  function commitEdit() {
    if (!editing) return
    const { id, field } = editing
    setEditing(null)
    setSavingId(id)
    const trimmed = editValue.trim()
    if (field === 'qty') {
      const num = trimmed ? parseInt(trimmed, 10) : null
      if (num != null && isNaN(num)) { setSavingId(null); return }
      patch(id, { controlManualQty: num })
      start(async () => {
        const res = await setManualQty(id, num)
        if (!res.ok) console.error(res.error)
        setSavingId(null)
      })
    } else {
      patch(id, { controlNota: trimmed || null })
      start(async () => {
        const res = await setNota(id, trimmed)
        if (!res.ok) console.error(res.error)
        setSavingId(null)
      })
    }
  }

  return (
    <div>
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-[12px]">
            <thead>
              <tr className="bg-[#0d0d0d] border-b border-white/[0.06]">
                <th className="text-center text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-2 py-2.5 w-10">✓</th>
                <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">SO</th>
                <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Descripción</th>
                <th className="text-center text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Foto</th>
                <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-blue-400 px-3 py-2.5">Qty PL</th>
                <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-purple-400 px-3 py-2.5">Qty PI</th>
                <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Dif.</th>
                <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Nota</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0
                ? <tr><td colSpan={8} className="px-4 py-10 text-center text-zinc-500">Sin ítems para mostrar.</td></tr>
                : visible.map(it => {
                  const eqty = effectiveQty(it)
                  const diff = it.qPi != null ? eqty - it.qPi : 0
                  const hasDiff = diff !== 0
                  const isManual = it.controlManualQty != null
                  const isSaving = savingId === it.id
                  return (
                    <tr key={it.id} className={cn(
                      'border-b border-white/[0.04] last:border-0 group',
                      it.controlReviewed && 'opacity-60',
                    )}>
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => toggleReview(it)}
                          disabled={isSaving}
                          className={cn(
                            'w-5 h-5 rounded border flex items-center justify-center transition-colors',
                            it.controlReviewed
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                              : 'border-white/[0.15] hover:border-emerald-500/50',
                          )}
                          title={it.controlReviewed ? `Revisado por ${it.controlReviewedBy ?? '—'}` : 'Marcar como revisado'}
                        >
                          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : it.controlReviewed && <CheckCircle2 className="w-3 h-3" />}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-emerald-400">{it.soPrincipal ?? '—'}</td>
                      <td className="px-3 py-2 text-zinc-200 max-w-[280px] truncate">{it.description ?? '—'}</td>
                      <td className="px-3 py-2 text-center">
                        {it.photos.length > 0
                          ? <span className="inline-flex items-center gap-1 text-emerald-400"><Camera className="w-3 h-3" /><span className="text-[10px]">{it.photos.length}</span></span>
                          : <CameraOff className="w-3.5 h-3.5 inline text-red-400" />
                        }
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {editing?.id === it.id && editing?.field === 'qty' ? (
                          <input
                            autoFocus
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null) }}
                            className="w-16 px-1 py-0.5 rounded bg-[#0d0d0d] border border-[#E30613]/40 text-white text-right tabular-nums"
                          />
                        ) : (
                          <button
                            onClick={() => startEdit(it.id, 'qty', String(eqty))}
                            className={cn(
                              'text-blue-300 font-semibold hover:text-white transition-colors inline-flex items-center gap-1',
                              isManual && 'text-amber-400',
                            )}
                            title={isManual ? `Manual (original PL: ${it.qty})` : 'Click para editar'}
                          >
                            {eqty}
                            {isManual && <Pencil className="w-2.5 h-2.5 opacity-50" />}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-purple-300 font-semibold tabular-nums">{it.qPi ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {hasDiff
                          ? <span className={cn('px-1.5 py-0.5 rounded font-semibold', diff < 0 ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400')}>{diff > 0 ? '+' : ''}{diff}</span>
                          : <span className="text-emerald-400">0</span>
                        }
                      </td>
                      <td className="px-3 py-2 max-w-[200px]">
                        {editing?.id === it.id && editing?.field === 'nota' ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null) }}
                            className="w-full px-2 py-0.5 rounded bg-[#0d0d0d] border border-[#E30613]/40 text-white text-[11px]"
                          />
                        ) : (
                          <button
                            onClick={() => startEdit(it.id, 'nota', it.controlNota ?? '')}
                            className="text-left w-full text-[11px] text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-1.5 truncate"
                          >
                            {it.controlNota
                              ? <><MessageSquare className="w-3 h-3 text-amber-400 shrink-0" /><span className="truncate">{it.controlNota}</span></>
                              : <span className="text-zinc-600 italic">+ nota</span>
                            }
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        </div>
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

- [ ] **Step 3: Smoke test**

Levantá el dev server si no está corriendo (`npm run dev`). Abrí `/embarques/[cualquiera]` y andá al tab "Control". Verificá:
- Las filas tienen un checkbox a la izquierda. Click marca/desmarca revisado y oscurece la fila.
- La columna "Qty PL" es editable inline al click (input numérico).
- La columna "Nota" tiene un botón "+ nota" o el texto si existe; click abre input.
- Los filtros incluyen "Pendientes" y "Revisados" además de los anteriores.

- [ ] **Step 4: Commit**

```bash
git add app/embarques/'[embarqueNo]'/tabs/ControlTab.tsx
git commit -m "feat(embarques): ControlTab interactivo con review, qty manual y notas"
```

---

## Task 5: Restylar `/comercial` — migración a dark theme + extraer Step1Upload

**Files:**
- Create: `app/comercial/_components/Step1Upload.tsx`
- Modify: `app/comercial/page.tsx`

- [ ] **Step 1: Crear directorio `app/comercial/_components/`**

```bash
mkdir -p app/comercial/_components
```

- [ ] **Step 2: Crear `app/comercial/_components/Step1Upload.tsx`**

Copiar el bloque actual `Step1Upload` (líneas 22-262 aprox) de `app/comercial/page.tsx` a este nuevo archivo, manteniendo los imports necesarios al tope.

Cambios visuales requeridos (búsqueda y reemplazo dentro del archivo nuevo):

| Buscar | Reemplazar |
|---|---|
| `bg-white` | `bg-[#0d0d0d]` |
| `border-zinc-200` | `border-white/[0.08]` |
| `text-zinc-900` | `text-white` |
| `text-zinc-700` | `text-zinc-200` |
| `text-zinc-500` | `text-zinc-400` |
| `text-zinc-400` | `text-zinc-500` |
| `text-amber-600` | `text-[#E30613]` |
| `bg-amber-50` | `bg-[#E30613]/10` |
| `bg-amber-100` | `bg-[#E30613]/15` |
| `border-amber-100` | `border-[#E30613]/30` |
| `hover:bg-amber-50` | `hover:bg-[#E30613]/10` |
| `bg-emerald-50` | `bg-emerald-500/10` |
| `bg-emerald-100` | `bg-emerald-500/15` |
| `text-emerald-600` | `text-emerald-400` |
| `text-emerald-700` | `text-emerald-300` |
| `bg-red-50` | `bg-red-500/10` |
| `text-red-600` | `text-red-400` |

Agregar `export function` al inicio si no está, y eliminar `function` simple. Es decir:

```tsx
export function Step1Upload({ onDone }: { ... }) {
  ...
}
```

Imports que necesitarás al tope:

```tsx
'use client'

import React, { useState, useTransition } from 'react'
import * as XLSX from 'xlsx'
import type { ExtractedItem, DriveLinks } from '@/app/lib/etl'
import {
  Upload, FileSpreadsheet, FileText, Loader2,
  AlertTriangle, ExternalLink, FolderOpen,
} from 'lucide-react'
```

- [ ] **Step 3: Update `app/comercial/page.tsx` para importar el nuevo Step1Upload**

En la parte superior del archivo, agregar:

```tsx
import { Step1Upload } from './_components/Step1Upload'
```

Y eliminar el bloque local `function Step1Upload({ onDone }: ...)` (líneas 22-262 aproximadamente).

- [ ] **Step 4: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: zero errors. Si hay imports faltantes en Step1Upload.tsx, agregarlos.

- [ ] **Step 5: Smoke test**

`npm run dev`, abrí `/comercial`. La página debe seguir funcionando (Step 1 visible) y los colores claros (text-zinc-900, bg-white) deben ser reemplazados por el dark theme. Si algo se ve raro, ajustá los class names que falten.

- [ ] **Step 6: Commit**

```bash
git add app/comercial/_components/Step1Upload.tsx app/comercial/page.tsx
git commit -m "refactor(comercial): extraer Step1Upload a componente propio y migrar a dark theme"
```

---

## Task 6: Restylar y extraer Step2AssignSOs

**Files:**
- Create: `app/comercial/_components/Step2AssignSOs.tsx`
- Modify: `app/comercial/page.tsx`

- [ ] **Step 1: Crear `app/comercial/_components/Step2AssignSOs.tsx`**

Copiar el bloque actual `Step2Preview` de `app/comercial/page.tsx` a este nuevo archivo. Renombrar la función a `Step2AssignSOs` y exportarla.

Aplicar la misma tabla de búsqueda-y-reemplazo visual del Task 5 (bg-white → bg-[#0d0d0d], etc.).

Imports que necesitarás:

```tsx
'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { guardarCIPL } from '@/app/lib/etl'
import { fetchSalesOrders } from '@/app/lib/sheets'
import type { ExtractedItem, DriveLinks, SOSuggestion, SOSuggestionResult } from '@/app/lib/etl'
import { Loader2, Save, Sparkles, AlertTriangle, RotateCcw, Zap } from 'lucide-react'
```

- [ ] **Step 2: Update `app/comercial/page.tsx` para importar Step2AssignSOs**

En el page.tsx, reemplazar el import del bloque local con:

```tsx
import { Step2AssignSOs } from './_components/Step2AssignSOs'
```

Y reemplazar `<Step2Preview ... />` con `<Step2AssignSOs ... />`.

Eliminar el bloque local `function Step2Preview(...)`.

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Smoke test**

Visit `/comercial`, completar Step 1 (upload), llegar a Step 2. La tabla debe verse con dark theme. El botón "Sugerir SOs con IA" sigue funcionando.

- [ ] **Step 5: Commit**

```bash
git add app/comercial/_components/Step2AssignSOs.tsx app/comercial/page.tsx
git commit -m "refactor(comercial): extraer Step2AssignSOs a componente propio y migrar a dark theme"
```

---

## Task 7: Componente compartido `InspectionPhotoUploader` y Step 3 nuevo

**Files:**
- Create: `components/shared/InspectionPhotoUploader.tsx`
- Create: `app/comercial/_components/Step3Photos.tsx`
- Modify: `app/comercial/page.tsx`

- [ ] **Step 1: Crear `components/shared/InspectionPhotoUploader.tsx`**

Este componente extrae la lógica esencial del actual `InspeccionClient.tsx`. Su responsabilidad: recibir un Excel con fotos embebidas, extraerlas, llamar a la IA para matchear cajas, y devolver al padre el resultado.

Estructura mínima (no hace falta replicar toda la UI de `/inspeccion`):

```tsx
'use client'

import { useState } from 'react'
import { Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { unzipSync } from 'fflate'

export type PhotoExtractionResult = {
  rowIndex: number
  colIndex: number
  base64: string
  mediaType: string
  ai?: {
    asn?: string | null
    cartonNo?: string | null
    caseNo?: string | null
    soNo?: string | null
    modelo?: string | null
    qty?: number | null
    confidence?: 'high' | 'medium' | 'low' | null
  }
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
  return 'image/jpeg'
}

function extractImagesFromXlsx(buf: Uint8Array): PhotoExtractionResult[] {
  const files = unzipSync(buf)
  const drawingXml = new TextDecoder().decode(files['xl/drawings/drawing1.xml'] ?? new Uint8Array())
  const relsXml    = new TextDecoder().decode(files['xl/drawings/_rels/drawing1.xml.rels'] ?? new Uint8Array())

  const ridToFile: Record<string, string> = {}
  const rRe = /Id="(rId\d+)"[^>]*Target="\.\.\/media\/(image\d+\.\w+)"/g
  let rm: RegExpExecArray | null
  while ((rm = rRe.exec(relsXml)) !== null) ridToFile[rm[1]] = rm[2]

  const out: PhotoExtractionResult[] = []
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
    out.push({
      rowIndex: fromRow,
      colIndex: fromCol,
      base64: uint8ToBase64(imgBuf),
      mediaType: detectMediaType(imgBuf),
    })
  }
  return out
}

export function InspectionPhotoUploader({
  onExtracted, onAIComplete,
}: {
  onExtracted: (photos: PhotoExtractionResult[]) => void
  onAIComplete?: (photos: PhotoExtractionResult[]) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [aiRunning, setAiRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState(0)

  async function handleExtract() {
    if (!file) return
    setExtracting(true); setError(null)
    try {
      const buf = new Uint8Array(await file.arrayBuffer())
      const photos = extractImagesFromXlsx(buf)
      setCount(photos.length)
      onExtracted(photos)

      // Auto-run AI extraction
      setAiRunning(true)
      const enriched: PhotoExtractionResult[] = []
      for (const p of photos) {
        try {
          const r = await fetch('/api/extract-photo-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64: p.base64, mediaType: p.mediaType }),
          }).then(r => r.json())
          enriched.push({ ...p, ai: r.ok ? r.info : null })
        } catch {
          enriched.push(p)
        }
      }
      setAiRunning(false)
      if (onAIComplete) onAIComplete(enriched)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExtracting(false)
    }
  }

  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#0d0d0d] p-4">
      <h3 className="text-[12px] font-display font-semibold text-white mb-3">Subir Excel de inspección</h3>
      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="flex-1 text-[11px] text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-white/[0.06] file:text-white hover:file:bg-white/[0.1]"
        />
        <button
          onClick={handleExtract}
          disabled={!file || extracting || aiRunning}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-[#E30613] hover:bg-[#E30613]/85 disabled:opacity-40 text-white inline-flex items-center gap-1.5"
        >
          {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Extraer fotos
        </button>
      </div>
      {count > 0 && !aiRunning && (
        <p className="mt-2 text-[11px] text-emerald-400 inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> {count} foto{count === 1 ? '' : 's'} extraída{count === 1 ? '' : 's'}
        </p>
      )}
      {aiRunning && (
        <p className="mt-2 text-[11px] text-blue-400 inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analizando fotos con IA…
        </p>
      )}
      {error && (
        <p className="mt-2 text-[11px] text-red-400 inline-flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Crear `app/comercial/_components/Step3Photos.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { ChevronRight, ChevronLeft, SkipForward } from 'lucide-react'
import { InspectionPhotoUploader, type PhotoExtractionResult } from '@/components/shared/InspectionPhotoUploader'

export function Step3Photos({
  onBack, onContinue,
}: {
  onBack: () => void
  onContinue: (photos: PhotoExtractionResult[]) => void
}) {
  const [photos, setPhotos] = useState<PhotoExtractionResult[]>([])

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.04] p-3 text-[11px] text-blue-300">
        <strong>Paso opcional.</strong> Si tenés un Excel con fotos de inspección, subilo acá. La IA extrae las etiquetas y matchea cada foto contra los ítems del PL recién cargado. Si no, hacé click en "Saltar".
      </div>

      <InspectionPhotoUploader
        onExtracted={() => {}}
        onAIComplete={setPhotos}
      />

      {photos.length > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-3">
          <p className="text-[11px] text-zinc-400 mb-2">{photos.length} fotos analizadas. Próximamente: matching automático con los ítems del PL.</p>
          <div className="grid grid-cols-6 md:grid-cols-10 gap-1.5">
            {photos.slice(0, 30).map((p, i) => (
              <div key={i} className="aspect-square rounded overflow-hidden bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:${p.mediaType};base64,${p.base64}`} className="w-full h-full object-cover" alt="" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button onClick={onBack} className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 inline-flex items-center gap-1.5">
          <ChevronLeft className="w-3.5 h-3.5" /> Volver
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => onContinue([])} className="px-3 py-1.5 rounded-md text-[11px] font-medium text-zinc-400 hover:text-white inline-flex items-center gap-1.5">
            <SkipForward className="w-3.5 h-3.5" /> Saltar
          </button>
          <button onClick={() => onContinue(photos)} className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-[#E30613] hover:bg-[#E30613]/85 text-white inline-flex items-center gap-1.5">
            Continuar <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add components/shared/InspectionPhotoUploader.tsx app/comercial/_components/Step3Photos.tsx
git commit -m "feat(comercial): componente compartido de upload fotos + Step3Photos"
```

---

## Task 8: API IA — `/api/extract-photo-info` (modelo + qty visible)

**Files:**
- Create: `app/api/extract-photo-info/route.ts`

- [ ] **Step 1: Crear `app/api/extract-photo-info/route.ts`**

```ts
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROMPT = `Sos un asistente que analiza fotos de cajas DJI listas para inspección.
Mirá la etiqueta de la caja en la foto y extraé estos datos si están visibles:

- asn: el código ASN (formato: 3 letras + 6 dígitos + 4 caracteres alfanuméricos, ej "JDS260401LFUN")
- cartonNo: número de carton (ej "1/24", "5/12")
- caseNo: número de caso interno
- soNo: número de orden de venta (ej "SO-1234", "12345")
- modelo: nombre del modelo de producto visible (ej "DJI Mini 4 Pro", "Air 3")
- qty: cantidad visible en la etiqueta (entero)
- confidence: tu nivel de certeza ("high" | "medium" | "low")

Respondé ÚNICAMENTE con un JSON object sin markdown. Si un campo no se ve claro, ponelo en null.
Ejemplo: {"asn":"JDS260401LFUN","cartonNo":"1/24","caseNo":null,"soNo":"SO-1234","modelo":"DJI Mini 4 Pro","qty":2,"confidence":"high"}`

export async function POST(req: Request) {
  try {
    const { base64, mediaType } = await req.json() as { base64: string; mediaType: string }
    if (!base64) return NextResponse.json({ ok: false, error: 'base64 requerido' }, { status: 400 })

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png', data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    })

    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ ok: false, error: 'sin JSON en respuesta', raw: text })

    let info: Record<string, unknown> = {}
    try {
      info = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ ok: false, error: 'JSON inválido', raw: jsonMatch[0] })
    }

    return NextResponse.json({ ok: true, info })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: zero errors. Si el SDK reporta un error de tipo en `media_type`, verificar con `grep -r "image/jpeg" node_modules/@anthropic-ai/sdk/resources` cuál es el tipo aceptado y ajustar.

- [ ] **Step 3: Smoke test (manual con curl)**

Con el dev server levantado y `ANTHROPIC_API_KEY` definida en `.env`:

```bash
# Convertir una foto chica a base64 y probar
BASE64=$(base64 -w 0 /path/to/box-photo.jpg)
curl -s -X POST http://localhost:3000/api/extract-photo-info \
  -H "Content-Type: application/json" \
  -d "{\"base64\":\"$BASE64\",\"mediaType\":\"image/jpeg\"}"
```

Expected: JSON con `{ok: true, info: {asn, cartonNo, ...}}`. Si la foto no tiene etiqueta visible o no la encuentra, los campos serán `null` pero `ok: true`.

- [ ] **Step 4: Commit**

```bash
git add app/api/extract-photo-info/route.ts
git commit -m "feat(ai): endpoint que extrae ASN/modelo/qty/SO desde foto de inspección"
```

---

## Task 9: Mejorar `/api/suggest-sos` — exponer confidence + auto-accept setting

**Files:**
- Modify: `app/api/suggest-sos/route.ts`
- Modify: `app/comercial/_components/Step2AssignSOs.tsx`

- [ ] **Step 1: Inspeccionar la signature actual del endpoint**

```bash
head -40 app/api/suggest-sos/route.ts
```

Confirmar la forma del response (`suggestions: { so, reason }[]`).

- [ ] **Step 2: Agregar campo `confidence` al response del endpoint**

Editar `app/api/suggest-sos/route.ts`. En el prompt enviado a Claude, modificar la instrucción de salida:

Buscar la línea que dice algo como `[{"so":"SO-XXXX","reason":"..."},...]` y reemplazar por:

```
[{"so":"SO-XXXX","reason":"<máx 15 palabras>","confidence":"high|medium|low"},...]
```

En la parte de parseo del response (donde se hace `JSON.parse`), agregar el campo `confidence` al tipo de retorno. Si el tipo ya tenía `SOSuggestion`, exportarlo desde `app/lib/etl.ts`:

```ts
export type SOSuggestion = {
  so: string
  reason: string
  confidence?: 'high' | 'medium' | 'low'
}
```

- [ ] **Step 3: En `Step2AssignSOs.tsx`, mostrar el confidence badge y agregar toggle "Auto-aceptar high"**

Después del input de cada SO en la tabla, renderizar el badge:

```tsx
{suggestions[i]?.confidence && (
  <span className={cn(
    'ml-1 px-1 py-0.5 rounded text-[8px] font-bold uppercase',
    suggestions[i].confidence === 'high'   && 'bg-emerald-500/15 text-emerald-400',
    suggestions[i].confidence === 'medium' && 'bg-amber-500/15 text-amber-400',
    suggestions[i].confidence === 'low'    && 'bg-red-500/15 text-red-400',
  )}>{suggestions[i].confidence}</span>
)}
```

(Importar `cn` from `@/lib/utils` si no está.)

Agregar checkbox cerca del botón "Sugerir SOs con IA":

```tsx
<label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer ml-3">
  <input type="checkbox" checked={autoAcceptHigh} onChange={e => setAutoAcceptHigh(e.target.checked)} className="rounded" />
  Auto-aplicar sugerencias high confidence
</label>
```

Y en `handleSuggestSOs`, si `autoAcceptHigh` está activo, aplicar solo high confidence sin pedir confirmación:

```tsx
setSos(prev => prev.map((v, i) => {
  if (v.trim()) return v
  const s = res.suggestions[i]
  if (!s) return ''
  if (autoAcceptHigh && s.confidence !== 'high') return ''   // dejar vacío para que el usuario confirme manualmente
  return s.so
}))
```

Agregar el state al inicio del componente:

```tsx
const [autoAcceptHigh, setAutoAcceptHigh] = useState(false)
```

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/api/suggest-sos/route.ts app/comercial/_components/Step2AssignSOs.tsx app/lib/etl.ts
git commit -m "feat(ai): confidence score en suggest-sos y toggle auto-accept high"
```

---

## Task 10: Step 4 Control + Step 5 Confirm

**Files:**
- Create: `app/comercial/_components/Step4Control.tsx`
- Create: `app/comercial/_components/Step5Confirm.tsx`
- Modify: `app/comercial/page.tsx`

- [ ] **Step 1: Crear `app/comercial/_components/Step4Control.tsx`**

Este paso muestra un resumen pre-confirmación: cuántos ítems con SO asignado, cuántos sin SO, cuántas fotos subidas, cuántos con discrepancias qty (vs GSO V4 si está disponible).

```tsx
'use client'

import { ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Package, Camera } from 'lucide-react'
import type { ExtractedItem } from '@/app/lib/etl'
import type { PhotoExtractionResult } from '@/components/shared/InspectionPhotoUploader'

export function Step4Control({
  items, sos, photos, onBack, onContinue,
}: {
  items: ExtractedItem[]
  sos: string[]
  photos: PhotoExtractionResult[]
  onBack: () => void
  onContinue: () => void
}) {
  const conSO     = sos.filter(s => s.trim()).length
  const sinSO     = items.length - conSO
  const totalQty  = items.reduce((s, i) => s + (i.qty ?? 0), 0)
  const totalCbm  = items.reduce((s, i) => s + (i.cbm ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-4">
        <h3 className="text-[12px] font-display font-semibold text-white mb-3 uppercase tracking-wide">Resumen previo</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="px-3 py-2 rounded-md bg-blue-500/[0.08] border border-blue-500/20">
            <p className="text-[10px] uppercase text-blue-400/80 font-semibold flex items-center gap-1"><Package className="w-3 h-3" /> Ítems</p>
            <p className="text-xl font-display font-bold text-blue-400 tabular-nums">{items.length}</p>
          </div>
          <div className={`px-3 py-2 rounded-md border ${sinSO === 0 ? 'bg-emerald-500/[0.08] border-emerald-500/20' : 'bg-amber-500/[0.08] border-amber-500/20'}`}>
            <p className={`text-[10px] uppercase font-semibold flex items-center gap-1 ${sinSO === 0 ? 'text-emerald-400/80' : 'text-amber-400/80'}`}>
              {sinSO === 0 ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              SOs asignados
            </p>
            <p className={`text-xl font-display font-bold tabular-nums ${sinSO === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>{conSO} / {items.length}</p>
          </div>
          <div className={`px-3 py-2 rounded-md border ${photos.length > 0 ? 'bg-emerald-500/[0.08] border-emerald-500/20' : 'bg-red-500/[0.08] border-red-500/20'}`}>
            <p className={`text-[10px] uppercase font-semibold flex items-center gap-1 ${photos.length > 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
              <Camera className="w-3 h-3" /> Fotos
            </p>
            <p className={`text-xl font-display font-bold tabular-nums ${photos.length > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{photos.length}</p>
          </div>
          <div className="px-3 py-2 rounded-md bg-zinc-500/[0.06] border border-zinc-500/20">
            <p className="text-[10px] uppercase text-zinc-400/80 font-semibold">Unidades</p>
            <p className="text-xl font-display font-bold text-white tabular-nums">{totalQty.toLocaleString()}</p>
            <p className="text-[9px] text-zinc-500 mt-0.5">{totalCbm.toFixed(2)} CBM</p>
          </div>
        </div>

        {sinSO > 0 && (
          <div className="mt-4 p-3 rounded-md border border-amber-500/20 bg-amber-500/[0.04] text-[11px] text-amber-300 inline-flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{sinSO} ítems no tienen SO asignado. Podés volver al paso anterior para completarlos, o seguir y editarlos después desde Embarques.</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button onClick={onBack} className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 inline-flex items-center gap-1.5">
          <ChevronLeft className="w-3.5 h-3.5" /> Volver
        </button>
        <button onClick={onContinue} className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-[#E30613] hover:bg-[#E30613]/85 text-white inline-flex items-center gap-1.5">
          Confirmar y guardar <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Crear `app/comercial/_components/Step5Confirm.tsx`**

Este paso es esencialmente el `Step3Done` actual, restylado. Copiar el bloque actual, renombrar, y restylar a dark theme.

```tsx
'use client'

import Link from 'next/link'
import { CheckCircle2, Anchor, RotateCcw, FolderOpen, ExternalLink } from 'lucide-react'
import type { DriveLinks } from '@/app/lib/etl'

export function Step5Confirm({
  count, driveLinks, onNew,
}: {
  count: number
  driveLinks: DriveLinks
  onNew: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-6 text-center">
        <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
        <h3 className="text-lg font-display font-bold text-white mb-1">Guardado correctamente</h3>
        <p className="text-[12px] text-emerald-400/80">{count} ítem{count === 1 ? '' : 's'} cargado{count === 1 ? '' : 's'} al sistema</p>
      </div>

      {(driveLinks.excel || driveLinks.ci || driveLinks.pl) && (
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-4">
          <h3 className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2 flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" /> Archivos en Drive
          </h3>
          <div className="space-y-1">
            {driveLinks.excel && <a href={driveLinks.excel} target="_blank" rel="noopener" className="block text-[11px] text-blue-400 hover:text-blue-300 inline-flex items-center gap-1.5"><ExternalLink className="w-3 h-3" /> Excel original</a>}
            {driveLinks.ci    && <a href={driveLinks.ci}    target="_blank" rel="noopener" className="block text-[11px] text-blue-400 hover:text-blue-300 inline-flex items-center gap-1.5"><ExternalLink className="w-3 h-3" /> Commercial Invoice</a>}
            {driveLinks.pl    && <a href={driveLinks.pl}    target="_blank" rel="noopener" className="block text-[11px] text-blue-400 hover:text-blue-300 inline-flex items-center gap-1.5"><ExternalLink className="w-3 h-3" /> Packing List</a>}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-2">
        <button onClick={onNew} className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 inline-flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5" /> Cargar otro PL
        </button>
        <Link href="/embarques" className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-[#E30613] hover:bg-[#E30613]/85 text-white inline-flex items-center gap-1.5">
          <Anchor className="w-3.5 h-3.5" /> Ir a Embarques
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Refactor `app/comercial/page.tsx` para usar 5 pasos**

Reemplazar el contenido entero por:

```tsx
'use client'

import React, { useState } from 'react'
import { ChevronRight, Upload, Sparkles, Camera, ShieldCheck, CheckCircle2 } from 'lucide-react'
import type { ExtractedItem, DriveLinks } from '@/app/lib/etl'
import type { PhotoExtractionResult } from '@/components/shared/InspectionPhotoUploader'
import { Step1Upload } from './_components/Step1Upload'
import { Step2AssignSOs } from './_components/Step2AssignSOs'
import { Step3Photos } from './_components/Step3Photos'
import { Step4Control } from './_components/Step4Control'
import { Step5Confirm } from './_components/Step5Confirm'

const EMPTY_LINKS: DriveLinks = { excel: null, ci: null, pl: null }

type Step = 1 | 2 | 3 | 4 | 5

const STEPS: { n: Step; label: string; icon: React.ElementType }[] = [
  { n: 1, label: 'Cargar archivo',       icon: Upload      },
  { n: 2, label: 'Asignar SOs',          icon: Sparkles    },
  { n: 3, label: 'Fotos inspección',     icon: Camera      },
  { n: 4, label: 'Control',              icon: ShieldCheck },
  { n: 5, label: 'Confirmado',           icon: CheckCircle2},
]

export default function ComercialPage() {
  const [step, setStep] = useState<Step>(1)
  const [items, setItems] = useState<ExtractedItem[]>([])
  const [tipo, setTipo] = useState<'Repuesto' | 'Mercaderia'>('Repuesto')
  const [category, setCategory] = useState('')
  const [driveLinks, setDriveLinks] = useState<DriveLinks>(EMPTY_LINKS)
  const [sos, setSos] = useState<string[]>([])
  const [photos, setPhotos] = useState<PhotoExtractionResult[]>([])
  const [saved, setSaved] = useState(0)

  function handleExtracted(extracted: ExtractedItem[], t: 'Repuesto' | 'Mercaderia', cat: string, links: DriveLinks) {
    setItems(extracted)
    setTipo(t); setCategory(cat); setDriveLinks(links)
    setSos(Array(extracted.length).fill(''))
    setStep(2)
  }

  function handleSOsAssigned(assigned: string[]) {
    setSos(assigned)
    setStep(3)
  }

  function handlePhotosDone(p: PhotoExtractionResult[]) {
    setPhotos(p)
    setStep(4)
  }

  async function handleConfirm() {
    // Step 2 ya guarda en DB (guardarCIPL). Step 4 → 5 solo confirma visualmente.
    setSaved(items.length)
    setStep(5)
  }

  function handleReset() {
    setItems([]); setSos([]); setPhotos([]); setDriveLinks(EMPTY_LINKS); setSaved(0)
    setStep(1)
  }

  return (
    <div className="px-6 py-5 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-white tracking-tight mb-1">Carga CIPL</h1>
        <p className="text-[12px] text-zinc-500">Extraé y guardá CIPLs de Repuestos o Mercadería DJI</p>
      </div>

      <div className="flex items-center gap-1 mb-6 text-[11px] overflow-x-auto pb-1">
        {STEPS.map(({ n, label, icon: Icon }, idx) => {
          const done = step > n
          const active = step === n
          return (
            <React.Fragment key={n}>
              {idx > 0 && <ChevronRight className="w-3 h-3 text-zinc-700 shrink-0" />}
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded font-medium whitespace-nowrap ${
                active ? 'text-[#E30613] bg-[#E30613]/10' :
                done   ? 'text-emerald-400' : 'text-zinc-500'
              }`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  done   ? 'bg-emerald-500/20 text-emerald-400' :
                  active ? 'bg-[#E30613]/20 text-[#E30613]' :
                          'bg-white/[0.06] text-zinc-500'
                }`}>{n}</span>
                <Icon className="w-3.5 h-3.5" />
                {label}
              </div>
            </React.Fragment>
          )
        })}
      </div>

      {step === 1 && <Step1Upload onDone={handleExtracted} />}
      {step === 2 && (
        <Step2AssignSOs
          items={items}
          tipoCarga={tipo}
          categoryName={category}
          driveLinks={driveLinks}
          onBack={handleReset}
          onSaved={(count: number, sosAssigned: string[]) => handleSOsAssigned(sosAssigned)}
        />
      )}
      {step === 3 && <Step3Photos onBack={() => setStep(2)} onContinue={handlePhotosDone} />}
      {step === 4 && <Step4Control items={items} sos={sos} photos={photos} onBack={() => setStep(3)} onContinue={handleConfirm} />}
      {step === 5 && <Step5Confirm count={saved} driveLinks={driveLinks} onNew={handleReset} />}
    </div>
  )
}
```

Nota crítica: la firma de `Step2AssignSOs.onSaved` cambió. Tiene que devolver el array de SOs además del count. Esto requiere modificar `Step2AssignSOs.tsx` en su prop `onSaved`:

En el archivo `Step2AssignSOs.tsx`, cambiar:
```tsx
onSaved: (count: number) => void
```
a:
```tsx
onSaved: (count: number, sos: string[]) => void
```

Y en la llamada `onSaved(res.count)` cambiar a `onSaved(res.count, sos)`.

- [ ] **Step 4: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Smoke test**

`npm run dev`, ir a `/comercial`. Verificar:
- Header muestra 5 pasos en horizontal con iconos
- Step 1: upload (igual a antes)
- Step 2: asignar SOs (con dark theme y badge de confidence si IA respondió)
- Step 3: subir fotos opcionalmente o saltar
- Step 4: ver resumen pre-confirm
- Step 5: confirmación con link a Embarques

- [ ] **Step 6: Commit**

```bash
git add app/comercial/
git commit -m "feat(comercial): stepper de 5 pasos con Control + Confirm + dark theme"
```

---

## Task 11: Parser CIPL — tolerancia a variaciones de header

**Files:**
- Modify: `app/lib/etl.ts` (donde está el prompt al Claude que parsea el Excel)

- [ ] **Step 1: Inspeccionar el parser actual**

```bash
grep -n "Commercial Invoice\|Packing List\|extracted\|ExtractedItem\|prompt" app/lib/etl.ts | head -20
```

Identificar dónde se construye el prompt para Claude. Suele ser una función que toma `ciText` y `plText` y los manda a la API.

- [ ] **Step 2: Reforzar el prompt para tolerancia de headers**

En el prompt actual del parser, agregar (al final, antes de la instrucción de respuesta):

```
NOTAS DE TOLERANCIA:
- Los headers pueden variar: "ASN" puede aparecer como "Shipment No", "Reference", "ASN Number", "ASN#".
- "Qty" puede aparecer como "Quantity", "Total Qty", "Units", "CTNS x QTY".
- "Description" puede aparecer como "Item Description", "Product", "Goods Description".
- "EAN" puede aparecer como "Barcode", "Code EAN", "EAN-13".
- Si encontrás una columna sin header pero con datos que parecen códigos ASN (formato 3 letras + 6 dígitos + sufijo), asumí que es el ASN.
- Si una celda tiene un valor que es claramente un código de producto (formato CP.XX.NNNNNNN.NN), usalo como SKU aunque el header diga otra cosa.

DETECCIÓN DE PI MIXTO:
Si encontrás dos PI Numbers distintos en la misma planilla, separá los ítems en grupos por PI y mencionalo en el campo "warnings".

DANGEROUS GOODS:
Marcá isDangerousGood = true si la descripción contiene "battery", "lithium", "lipo", "lifepo4" o "energía portátil".
```

Si el prompt original retornaba `[{...item}]`, mantener la forma. Solo agregar las notas.

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Smoke test**

Subir un Excel real desde `/comercial` Step 1 y verificar que la extracción siga funcionando. Si DJI cambió el formato recientemente, esta tolerancia debería capturarlo.

- [ ] **Step 5: Commit**

```bash
git add app/lib/etl.ts
git commit -m "feat(ai): tolerancia de headers + dangerous goods en parser CIPL"
```

---

## Task 12: Redirect `/inspeccion` → `/comercial?step=3` (transition)

**Files:**
- Modify: `app/inspeccion/page.tsx`

- [ ] **Step 1: Reemplazar `app/inspeccion/page.tsx`**

```tsx
import { redirect } from 'next/navigation'

export default function InspeccionRedirectPage() {
  redirect('/comercial')
}
```

Este es un redirect temporal hasta Fase 3 (cleanup), donde se elimina `/inspeccion` y `InspeccionClient.tsx` por completo. Por ahora los bookmarks viejos siguen funcionando.

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Smoke test**

Abrí `http://localhost:3000/inspeccion` — debe redirigirte automáticamente a `/comercial`.

- [ ] **Step 4: Commit**

```bash
git add app/inspeccion/page.tsx
git commit -m "feat(comercial): redirect de /inspeccion a /comercial (fusión)"
```

---

## Task 13: Update sidebar — quitar "Inspección Fotos" del legacy

**Files:**
- Modify: `components/sidebar.tsx`

- [ ] **Step 1: Eliminar la entrada de `/inspeccion` del nav array**

Abrí `components/sidebar.tsx`. Encontrá la línea:

```ts
{ href: '/inspeccion', label: 'Inspección Fotos', icon: Camera, legacy: true, badge: null },
```

Y eliminala. El icon `Camera` puede dejarse en los imports por si se reutiliza en otro lado, pero si está sin uso, también eliminarlo de la lista de imports.

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/sidebar.tsx
git commit -m "feat(nav): quitar Inspección del sidebar (ahora vive en Carga CIPL)"
```

---

## Task 14: Final verification

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Lint del scope de Fase 2**

```bash
npm run lint 2>&1 | grep -E "(control-actions|comercial/_components|InspectionPhotoUploader|extract-photo-info|ControlTab|suggest-sos)" | head -30
```

Errores en archivos legacy (`comercial/page.tsx` originales, `inspeccion/InspeccionClient.tsx`) se pueden ignorar — se eliminan en Fase 3.

- [ ] **Step 3: Smoke test end-to-end**

Con dev server corriendo:

1. Abrí `/embarques/[cualquiera]` → tab Control → editar qty, marcar revisado, agregar nota. Recargar la página: los cambios persistieron.
2. Abrí `/comercial` → completar Step 1 (upload Excel) → Step 2 (asignar SOs, ver badges de confidence) → Step 3 (subir fotos opcional) → Step 4 (resumen) → Step 5 (confirmación).
3. Abrí `/inspeccion` → redirige a `/comercial`.
4. Verificar sidebar: Embarques arriba con badge "Nuevo", Inspección Fotos NO está. Panel General / Comex Tracking / Reportes / Fuentes siguen como legacy.

- [ ] **Step 4: Tag y commit final si hicieron falta ajustes**

Si Step 3 encontró bugs, commitearlos como `fix(fase-2): ...` separados. Después:

```bash
git log --oneline | head -25
git tag -a fase-2-stepper-control -m "Fase 2 completa: ControlTab interactivo + stepper 5 pasos + IA enhancements"
```

---

## Lo que queda para Fase 3

**Fase 3 — Dashboard completo + cmd+k + cleanup:**
- Home con charts completos (embarques/mes, top proveedores, discrepancias trend, distribución tipo carga)
- Búsqueda global cmd+k con `/api/search`
- Página `/configuracion` simplificada (URL planilla + columnas SO/Embarque)
- Tab Historial del embarque con audit log
- Eliminar `/panel-general`, `/comex`, `/inspeccion` (rutas), `/reportes`, `/operaciones`
- Eliminar `app/lib/comex-sources.ts`, `app/lib/comex-fields.ts`, `app/inspeccion/`
- Eliminar componentes de comercial usados solo por la versión vieja
- Mobile polish (cards stackeadas en lugar de tablas en sm)
- Migración explícita de COMEX_SOURCES a COMEX_CONFIG (script de admin)
