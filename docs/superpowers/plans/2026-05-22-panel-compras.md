# Panel de Compras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full procurement management module (`/compras`) that tracks orders from creation through delivery, with KPI dashboards, automatic Comex source sync, and a PL Consolidado Excel export.

**Architecture:** Two new Prisma models (`Compra`, `CompraSOItem`) + `compraId` on `CIPLItem`. All logistics milestone dates come live from Comex sources via existing `fetchAllSourcesData()` — never stored in DB. Auto-link connects CIPLItems to Compras by SO match on CIPL save. PL Consolidado export uses `xlsx` library already in the project.

**Tech Stack:** Next.js 16 App Router, Prisma 7, PostgreSQL, `xlsx` (already installed), existing `buildGSOMap()` + `fetchAllSourcesData()` from `app/lib/`.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Add `Compra`, `CompraSOItem`, `compraId` on `CIPLItem` |
| `app/lib/comex-fields.ts` | Modify | Add 3 new fieldKeys for Compra milestones |
| `app/lib/sheets.ts` | Modify | Add `listAllSOs()` for SO picker |
| `app/lib/etl.ts` | Modify | Add auto-link after `createMany` |
| `app/compras/actions.ts` | Create | `crearCompra`, `marcarHito`, `editarCompra` server actions |
| `app/compras/page.tsx` | Create | List + KPI dashboard (server component) |
| `app/compras/ComprasClient.tsx` | Create | Client tab/filter interactivity |
| `app/compras/nueva/page.tsx` | Create | Create compra (server passes SO list) |
| `app/compras/nueva/NuevaCompraClient.tsx` | Create | SO selector + form (client) |
| `app/compras/[id]/page.tsx` | Create | Detail page (server, fetches liveData) |
| `app/compras/[id]/CompraDetail.tsx` | Create | Timeline + SO cards + milestone editor (client) |
| `app/compras/consolidado.ts` | Create | `generarConsolidado()` server action → base64 xlsx |
| `app/comex/ComexClient.tsx` | Modify | Add Consolidado tab |
| `app/operaciones/ComexSourcesClient.tsx` | Modify | Add milestone mapping status section |
| `components/sidebar.tsx` | Modify | Add Compras nav item |
| `app/page.tsx` | Modify | Add Compras KPI row |

---

## Task 1: DB Schema — Compra, CompraSOItem, CIPLItem.compraId

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add models to schema**

Open `prisma/schema.prisma`. After the `CIPLPhoto` model, add:

```prisma
// ─── Órdenes de Compra ────────────────────────────────────────────────────────

model Compra {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  userId    String?
  user      User?    @relation(fields: [userId], references: [id])

  piNo  String?
  notas String?

  supplierName         String?
  supplierAddress      String?
  supplierContactName  String?
  supplierContactPhone String?
  supplierContactEmail String?

  fechaOrden          DateTime  @default(now())
  fechaEnvio          DateTime?
  fechaPago           DateTime?
  fechaSegundaValPA   DateTime?
  fechaInstruccionCat DateTime?
  fechaLMS            DateTime?

  sos       CompraSOItem[]
  ciplItems CIPLItem[]
}

model CompraSOItem {
  id       String @id @default(cuid())
  compraId String
  compra   Compra @relation(fields: [compraId], references: [id], onDelete: Cascade)

  soNumber String

  modelo   String?
  sku      String?
  qPi      Int?
  fobUnit  Float?
  fobTotal Float?
  incoterm String?
  pa       String?

  @@index([soNumber])
}
```

Also add `compraId` and `ciplItems` to `CIPLItem` (inside the existing model, after `photos CIPLPhoto[]`):

```prisma
  compraId  String?
  compra    Compra?  @relation(fields: [compraId], references: [id])
```

Also add `ciplItems CIPLItem[]` relation to `User` model is not needed since CIPLItem already has it. Just ensure `Compra` → `CIPLItem[]` is correct.

- [ ] **Step 2: Push schema to DB**

```bash
npx prisma db push
```

Expected output: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Compra and CompraSOItem models to schema"
```

---

## Task 2: Comex Fields Extension + GSO SO Lister

**Files:**
- Modify: `app/lib/comex-fields.ts`
- Modify: `app/lib/sheets.ts`

- [ ] **Step 1: Add 3 new fieldKeys to comex-fields.ts**

Replace the entire content of `app/lib/comex-fields.ts`:

```typescript
// Shared constant — no 'use server' (not a server action file)

export const KNOWN_MAPPABLE_FIELDS = [
  { key: 'etd',                  label: 'ETD',              type: 'date'   },
  { key: 'eta',                  label: 'ETA',              type: 'date'   },
  { key: 'etaCaldas',            label: 'ETA Caldas',       type: 'date'   },
  { key: 'arriboWh',             label: 'Arribo WH',        type: 'date'   },
  { key: 'fechaArriboAduana',    label: 'Arribo Aduana',    type: 'date'   },
  { key: 'fechaArriboDeposito',  label: 'Arribo Depósito',  type: 'date'   },
  { key: 'embarqueNo',           label: 'N° Embarque',      type: 'string' },
  { key: 'fechaInstruccion',     label: 'F. Instrucción',   type: 'date'   },
  { key: 'awb',                  label: 'AWB',              type: 'string' },
  { key: 'avisoAgente',          label: 'Aviso Agente',     type: 'string' },
  { key: 'avisoConfirmacion',    label: 'Conf. Agente',     type: 'string' },
  { key: 'fotosAgente',          label: 'Fotos Agente',     type: 'string' },
  { key: 'paletizado',           label: 'Paletizado',       type: 'string' },
  { key: 'confirmacionOk',       label: 'Conf. OK',         type: 'string' },
  { key: 'incoterm',             label: 'Incoterm',         type: 'string' },
  { key: 'puertoSalida',         label: 'Puerto Salida',    type: 'string' },
  { key: 'fobUnit',              label: 'FOB Unit',         type: 'number' },
  { key: 'fobTotal',             label: 'FOB Total',        type: 'number' },
  { key: 'qPi',                  label: 'Q PI',             type: 'number' },
  { key: 'sku',                  label: 'SKU',              type: 'string' },
  { key: 'pa',                   label: 'PA / Marca',       type: 'string' },
  { key: 'modelo',               label: 'Modelo',           type: 'string' },
] as const

export type KnownFieldKey = typeof KNOWN_MAPPABLE_FIELDS[number]['key']

// Fields that are Compra logistics milestones (come from Comex sources)
export const COMPRA_COMEX_MILESTONE_FIELDS: Array<{ fieldKey: string; label: string; type: 'date' | 'string' }> = [
  { fieldKey: 'embarqueNo',          label: 'N° Embarque (interno)',  type: 'string' },
  { fieldKey: 'arriboWh',            label: 'Arribo WH Airsea',       type: 'date'   },
  { fieldKey: 'etd',                 label: 'ETD',                    type: 'date'   },
  { fieldKey: 'eta',                 label: 'ETA',                    type: 'date'   },
  { fieldKey: 'fechaArriboAduana',   label: 'Arribo Aduana',          type: 'date'   },
  { fieldKey: 'fechaArriboDeposito', label: 'Arribo Depósito',        type: 'date'   },
]
```

- [ ] **Step 2: Add `listAllSOs()` to sheets.ts**

At the end of `app/lib/sheets.ts`, add:

```typescript
export type SOOption = {
  soNumber: string
  modelo:   string | null
  sku:      string | null
  qPi:      number | null
  fobUnit:  number | null
  fobTotal: number | null
  incoterm: string | null
  pa:       string | null
}

// Returns all SO rows as a flat array — used by the Nueva Compra SO picker
export async function listAllSOs(): Promise<SOOption[]> {
  const map = await buildGSOMap()
  return Array.from(map.entries()).map(([soNumber, row]) => ({
    soNumber,
    modelo:   row.modelo,
    sku:      row.sku,
    qPi:      row.qPi,
    fobUnit:  row.fobUnit,
    fobTotal: row.fobTotal,
    incoterm: row.incoterm,
    pa:       row.pa,
  }))
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/lib/comex-fields.ts app/lib/sheets.ts
git commit -m "feat: add Compra milestone fieldKeys and listAllSOs helper"
```

---

## Task 3: Server Actions for Compras

**Files:**
- Create: `app/compras/actions.ts`

- [ ] **Step 1: Create the actions file**

```bash
mkdir -p app/compras
```

Create `app/compras/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { buildGSOMap } from '@/app/lib/sheets'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CompraManualField =
  | 'fechaEnvio'
  | 'fechaPago'
  | 'fechaSegundaValPA'
  | 'fechaInstruccionCat'
  | 'fechaLMS'

export type CreateCompraInput = {
  piNo:                string
  notas:               string
  supplierName:        string
  supplierAddress:     string
  supplierContactName: string
  supplierContactPhone:string
  supplierContactEmail:string
  soNumbers:           string[]  // e.g. ["SO-09412", "SO-09413"]
}

export type ActionResult =
  | { ok: true;  compraId?: string }
  | { ok: false; error: string }

// ─── Create Compra ────────────────────────────────────────────────────────────

export async function crearCompra(input: CreateCompraInput): Promise<ActionResult> {
  try {
    if (!input.piNo.trim()) return { ok: false, error: 'El PI N° es obligatorio.' }
    if (input.soNumbers.length === 0) return { ok: false, error: 'Seleccioná al menos un SO.' }

    const gsoMap = await buildGSOMap()

    const compra = await prisma.compra.create({
      data: {
        piNo:                input.piNo.trim(),
        notas:               input.notas.trim() || null,
        supplierName:        input.supplierName.trim()        || null,
        supplierAddress:     input.supplierAddress.trim()     || null,
        supplierContactName: input.supplierContactName.trim() || null,
        supplierContactPhone:input.supplierContactPhone.trim()|| null,
        supplierContactEmail:input.supplierContactEmail.trim()|| null,
        sos: {
          create: input.soNumbers.map(soNumber => {
            const row = gsoMap.get(soNumber.toUpperCase())
            return {
              soNumber: soNumber.toUpperCase(),
              modelo:   row?.modelo   ?? null,
              sku:      row?.sku      ?? null,
              qPi:      row?.qPi      ?? null,
              fobUnit:  row?.fobUnit  ?? null,
              fobTotal: row?.fobTotal ?? null,
              incoterm: row?.incoterm ?? null,
              pa:       row?.pa       ?? null,
            }
          }),
        },
      },
    })

    revalidatePath('/compras')
    return { ok: true, compraId: compra.id }
  } catch (err) {
    console.error('[crearCompra]', err)
    return { ok: false, error: String(err) }
  }
}

// ─── Mark a manual milestone date ─────────────────────────────────────────────

export async function marcarHito(
  compraId: string,
  field: CompraManualField,
  isoDate: string | null,   // null = clear the date
): Promise<ActionResult> {
  try {
    await prisma.compra.update({
      where: { id: compraId },
      data:  { [field]: isoDate ? new Date(isoDate) : null },
    })
    revalidatePath(`/compras/${compraId}`)
    revalidatePath('/compras')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// ─── Edit supplier / notes ────────────────────────────────────────────────────

export async function editarCompra(
  compraId: string,
  data: Partial<Pick<CreateCompraInput, 'piNo' | 'notas' | 'supplierName' | 'supplierAddress' | 'supplierContactName' | 'supplierContactPhone' | 'supplierContactEmail'>>,
): Promise<ActionResult> {
  try {
    await prisma.compra.update({
      where: { id: compraId },
      data: {
        ...(data.piNo                !== undefined && { piNo:                data.piNo.trim() || null }),
        ...(data.notas               !== undefined && { notas:               data.notas.trim() || null }),
        ...(data.supplierName        !== undefined && { supplierName:        data.supplierName.trim() || null }),
        ...(data.supplierAddress     !== undefined && { supplierAddress:     data.supplierAddress.trim() || null }),
        ...(data.supplierContactName !== undefined && { supplierContactName: data.supplierContactName.trim() || null }),
        ...(data.supplierContactPhone!== undefined && { supplierContactPhone:data.supplierContactPhone.trim() || null }),
        ...(data.supplierContactEmail!== undefined && { supplierContactEmail:data.supplierContactEmail.trim() || null }),
      },
    })
    revalidatePath(`/compras/${compraId}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/compras/actions.ts
git commit -m "feat: compras server actions — create, mark milestone, edit"
```

---

## Task 4: Nueva Compra — SO Picker + Form

**Files:**
- Create: `app/compras/nueva/page.tsx`
- Create: `app/compras/nueva/NuevaCompraClient.tsx`

- [ ] **Step 1: Create the server page**

Create `app/compras/nueva/page.tsx`:

```typescript
import { listAllSOs } from '@/app/lib/sheets'
import { NuevaCompraClient } from './NuevaCompraClient'

export default async function NuevaCompraPage() {
  const soList = await listAllSOs()
  return <NuevaCompraClient soList={soList} />
}
```

- [ ] **Step 2: Create the client component**

Create `app/compras/nueva/NuevaCompraClient.tsx`:

```typescript
'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, ChevronLeft, Loader2, AlertCircle } from 'lucide-react'
import { crearCompra } from '@/app/compras/actions'
import type { SOOption } from '@/app/lib/sheets'

const fmt = (n: number | null) =>
  n != null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '—'

export function NuevaCompraClient({ soList }: { soList: SOOption[] }) {
  const router = useRouter()
  const [query, setQuery]         = useState('')
  const [selected, setSelected]   = useState<SOOption[]>([])
  const [pending, startTransition] = useTransition()
  const [error, setError]         = useState<string | null>(null)

  // Form fields
  const [piNo, setPiNo]                   = useState('')
  const [notas, setNotas]                 = useState('')
  const [supplierName, setSupplierName]   = useState('')
  const [supplierAddress, setSupplierAddress] = useState('')
  const [supplierContact, setSupplierContact] = useState('')
  const [supplierPhone, setSupplierPhone] = useState('')
  const [supplierEmail, setSupplierEmail] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return soList.slice(0, 40)
    const q = query.toLowerCase()
    return soList.filter(s =>
      s.soNumber.toLowerCase().includes(q) ||
      (s.modelo ?? '').toLowerCase().includes(q) ||
      (s.sku    ?? '').toLowerCase().includes(q)
    ).slice(0, 40)
  }, [query, soList])

  const toggle = (so: SOOption) => {
    setSelected(prev =>
      prev.some(s => s.soNumber === so.soNumber)
        ? prev.filter(s => s.soNumber !== so.soNumber)
        : [...prev, so]
    )
  }

  const totalQty = selected.reduce((s, o) => s + (o.qPi ?? 0), 0)
  const totalFob = selected.reduce((s, o) => s + (o.fobTotal ?? 0), 0)

  function handleSubmit() {
    setError(null)
    if (!piNo.trim()) { setError('El PI N° es obligatorio.'); return }
    if (selected.length === 0) { setError('Seleccioná al menos un SO.'); return }
    startTransition(async () => {
      const res = await crearCompra({
        piNo, notas, supplierName, supplierAddress,
        supplierContactName: supplierContact,
        supplierContactPhone: supplierPhone,
        supplierContactEmail: supplierEmail,
        soNumbers: selected.map(s => s.soNumber),
      })
      if (res.ok && res.compraId) {
        router.push(`/compras/${res.compraId}`)
      } else if (!res.ok) {
        setError(res.error)
      }
    })
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-white/30 hover:text-white/70 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-[15px] font-semibold text-white">Nueva Orden de Compra</h1>
            <p className="text-[11px] text-white/30 mt-0.5">Seleccioná los SOs del GSO V4</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.back()} className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/5 border border-white/10 text-white/50 hover:text-white/70 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={pending}
            className="px-4 py-1.5 rounded-lg text-[12px] font-semibold bg-[#E30613] text-white hover:bg-[#c00510] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {pending && <Loader2 className="w-3 h-3 animate-spin" />}
            Crear Compra
          </button>
        </div>
      </div>

      <div className="flex gap-0 h-[calc(100vh-61px)]">
        {/* Left: SO picker + form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-[12px] text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* SO Selector */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-4">1. Seleccioná los SOs del GSO V4</p>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por SO, modelo, SKU..."
                className="w-full pl-9 pr-4 py-2.5 bg-white/[0.04] border border-white/10 rounded-lg text-[13px] text-white placeholder-white/20 outline-none focus:border-white/20"
              />
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {filtered.map(so => {
                const isSelected = selected.some(s => s.soNumber === so.soNumber)
                return (
                  <button
                    key={so.soNumber}
                    onClick={() => toggle(so)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? 'bg-[#E30613]/06 border-[#E30613]/40'
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${isSelected ? 'bg-[#E30613] border-[#E30613] text-white text-[10px]' : 'border-white/20'}`}>
                      {isSelected && '✓'}
                    </div>
                    <span className="font-mono text-[11px] font-bold text-[#E30613] bg-[#E30613]/10 px-2 py-0.5 rounded shrink-0">{so.soNumber}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-white font-medium truncate">{so.modelo ?? '—'}</div>
                      <div className="text-[11px] text-white/35 mt-0.5">{so.sku ?? ''}{so.qPi ? ` · ${so.qPi} un.` : ''}</div>
                    </div>
                    <div className="text-[12px] text-white/40 shrink-0">{fmt(so.fobTotal)}</div>
                  </button>
                )
              })}
              {filtered.length === 0 && <p className="text-center py-8 text-[12px] text-white/20">Sin resultados</p>}
            </div>
            {selected.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/25 mb-2">SOs seleccionados</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.map(so => (
                    <span key={so.soNumber} className="inline-flex items-center gap-1.5 bg-[#E30613]/10 border border-[#E30613]/25 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#fb9ca2]">
                      {so.soNumber}
                      <button onClick={() => toggle(so)} className="text-white/30 hover:text-white/60"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* PI + Notes */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-4">2. Datos de la orden</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30 block mb-1.5">PI N° *</label>
                <input value={piNo} onChange={e => setPiNo(e.target.value)} placeholder="CAS-2025-001" className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-white/20" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30 block mb-1.5">Notas</label>
                <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones..." className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-white/20" />
              </div>
            </div>
          </div>

          {/* Supplier */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-4">3. Datos del proveedor <span className="text-white/15 font-normal normal-case">(aparecen en el PL Consolidado)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30 block mb-1.5">Nombre del proveedor</label>
                <input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Ej: DJI Technology Co. Ltd." className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-white/20" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30 block mb-1.5">Dirección</label>
                <input value={supplierAddress} onChange={e => setSupplierAddress(e.target.value)} placeholder="Dirección de la fábrica" className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-white/20" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30 block mb-1.5">Contacto</label>
                <input value={supplierContact} onChange={e => setSupplierContact(e.target.value)} placeholder="Nombre" className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-white/20" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30 block mb-1.5">Teléfono</label>
                <input value={supplierPhone} onChange={e => setSupplierPhone(e.target.value)} placeholder="+86 ..." className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-white/20" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30 block mb-1.5">Email</label>
                <input value={supplierEmail} onChange={e => setSupplierEmail(e.target.value)} placeholder="proveedor@dji.com" className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-white/20" />
              </div>
            </div>
          </div>
        </div>

        {/* Right: sticky summary */}
        <div className="w-72 border-l border-white/[0.06] p-5 sticky top-0 h-full overflow-y-auto flex flex-col gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-3">Resumen</p>
            <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
              <div className="flex justify-between text-[12px]">
                <span className="text-white/40">SOs seleccionados</span>
                <span className="text-white font-semibold">{selected.length}</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-white/40">Total unidades</span>
                <span className="text-white font-semibold">{totalQty.toLocaleString()} un.</span>
              </div>
              <div className="pt-3 border-t border-white/[0.06] flex justify-between">
                <span className="text-[12px] font-semibold text-white/50">FOB Total</span>
                <span className="text-[16px] font-bold text-white">{fmt(totalFob)}</span>
              </div>
            </div>
          </div>

          {selected.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-2">Productos</p>
              <div className="space-y-1.5">
                {selected.map(so => (
                  <div key={so.soNumber} className="flex justify-between text-[11px] py-1.5 border-b border-white/[0.04]">
                    <span className="text-white/50 truncate flex-1">{so.modelo ?? so.soNumber}</span>
                    <span className="text-white font-medium shrink-0 ml-2">{so.qPi ?? '?'} un.</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={pending}
            className="mt-auto w-full py-2.5 rounded-xl text-[13px] font-semibold bg-[#E30613] text-white hover:bg-[#c00510] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            Crear Orden de Compra
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/compras/nueva/
git commit -m "feat: nueva compra page — SO picker and form"
```

---

## Task 5: Compras List Page + KPI Dashboard

**Files:**
- Create: `app/compras/page.tsx`
- Create: `app/compras/ComprasClient.tsx`

- [ ] **Step 1: Create shared status utility**

Create `app/compras/lib.ts`:

```typescript
import type { Compra, CompraSOItem, CIPLItem } from '@/app/generated/prisma'

export type CompraStatus =
  | 'Borrador'
  | 'Enviada'
  | 'Pagada'
  | 'PA Validada'
  | 'PL Cargado'
  | 'Instrucción Category'
  | 'LMS'
  | 'Completada'

export type CompraWithSOS = Compra & {
  sos: CompraSOItem[]
  ciplItems: Pick<CIPLItem, 'qty' | 'soPrincipal'>[]
}

// Derive status from DB fields only (no liveData needed for list view)
export function getCompraStatus(compra: CompraWithSOS): CompraStatus {
  const hasPlLinked = compra.ciplItems.length > 0
  if (compra.fechaLMS)            return 'LMS'
  if (compra.fechaInstruccionCat) return 'Instrucción Category'
  if (hasPlLinked)                return 'PL Cargado'
  if (compra.fechaSegundaValPA)   return 'PA Validada'
  if (compra.fechaPago)           return 'Pagada'
  if (compra.fechaEnvio)          return 'Enviada'
  return 'Borrador'
}

export function getStatusBadgeClass(status: CompraStatus): string {
  const map: Record<CompraStatus, string> = {
    'Borrador':              'bg-white/[0.06] text-white/40',
    'Enviada':               'bg-indigo-500/15 text-indigo-300',
    'Pagada':                'bg-emerald-500/15 text-emerald-300',
    'PA Validada':           'bg-purple-500/15 text-purple-300',
    'PL Cargado':            'bg-yellow-500/12 text-yellow-300',
    'Instrucción Category':  'bg-orange-500/12 text-orange-300',
    'LMS':                   'bg-cyan-500/12 text-cyan-300',
    'Completada':            'bg-teal-500/12 text-teal-300',
  }
  return map[status]
}

export function getQtyRecibida(compra: CompraWithSOS): number {
  const compraSONumbers = new Set(compra.sos.map(s => s.soNumber.toUpperCase()))
  return compra.ciplItems
    .filter(c => c.soPrincipal && compraSONumbers.has(c.soPrincipal.toUpperCase()))
    .reduce((sum, c) => sum + (c.qty ?? 0), 0)
}

export function getQtyPedida(compra: CompraWithSOS): number {
  return compra.sos.reduce((sum, s) => sum + (s.qPi ?? 0), 0)
}
```

- [ ] **Step 2: Create the server page**

Create `app/compras/page.tsx`:

```typescript
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Plus, ShoppingCart, TrendingUp, Package, AlertTriangle, Clock } from 'lucide-react'
import { ComprasClient } from './ComprasClient'
import { getCompraStatus, getQtyRecibida, getQtyPedida } from './lib'
import type { CompraWithSOS } from './lib'

export default async function ComprasPage() {
  const compras = await prisma.compra.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      sos: true,
      ciplItems: { select: { qty: true, soPrincipal: true } },
    },
  }) as CompraWithSOS[]

  // KPI computations
  const active      = compras.filter(c => getCompraStatus(c) !== 'Completada')
  const fobActivo   = active.reduce((s, c) => s + c.sos.reduce((ss, so) => ss + (so.fobTotal ?? 0), 0), 0)
  const unidadesEnProceso = active.reduce((s, c) => s + Math.max(0, getQtyPedida(c) - getQtyRecibida(c)), 0)

  const completadas30d = compras.filter(c => {
    const st = getCompraStatus(c)
    if (st !== 'Completada') return false
    const diff = Date.now() - c.createdAt.getTime()
    return diff < 30 * 24 * 60 * 60 * 1000
  })

  const pagoSinPL = active.filter(c => {
    if (!c.fechaPago) return false
    if (c.ciplItems.length > 0) return false
    const daysSince = (Date.now() - c.fechaPago.getTime()) / (1000 * 60 * 60 * 24)
    return daysSince > 30
  })

  const fmtUSD = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-white">Órdenes de Compra</h1>
          <p className="text-[11px] text-white/30 mt-0.5">Seguimiento de la orden a la entrega</p>
        </div>
        <Link href="/compras/nueva" className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold bg-[#E30613] text-white hover:bg-[#c00510] transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Nueva Compra
        </Link>
      </div>

      {/* KPI Grid */}
      <div className="px-6 py-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          {[
            { icon: ShoppingCart,  label: 'Compras activas',      value: active.length.toString(),              sub: `${compras.length} en total` },
            { icon: TrendingUp,    label: 'FOB en proceso',        value: fmtUSD(fobActivo),                     sub: 'órdenes abiertas' },
            { icon: Package,       label: 'Unidades por recibir',  value: unidadesEnProceso.toLocaleString(),    sub: 'vs qty pedida' },
            { icon: Clock,         label: 'Completadas este mes',  value: completadas30d.length.toString(),      sub: 'últimos 30 días' },
          ].map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-3.5 h-3.5 text-white/20" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/25">{label}</span>
              </div>
              <div className="text-[22px] font-bold text-white">{value}</div>
              <div className="text-[11px] text-white/30 mt-1">{sub}</div>
            </div>
          ))}
        </div>

        {pagoSinPL.length > 0 && (
          <div className="flex items-center gap-2.5 bg-amber-500/08 border border-amber-500/20 rounded-xl px-4 py-2.5 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-[12px] text-amber-300">
              <strong>{pagoSinPL.length} compra{pagoSinPL.length > 1 ? 's' : ''}</strong> pagada{pagoSinPL.length > 1 ? 's' : ''} sin PL hace más de 30 días —{' '}
              {pagoSinPL.map(c => c.piNo ?? c.id.slice(-6)).join(', ')}
            </span>
          </div>
        )}
      </div>

      <ComprasClient compras={compras} />
    </div>
  )
}
```

- [ ] **Step 3: Create ComprasClient**

Create `app/compras/ComprasClient.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { useState } from 'react'
import { getCompraStatus, getStatusBadgeClass, getQtyRecibida, getQtyPedida } from './lib'
import type { CompraWithSOS, CompraStatus } from './lib'

const TABS: Array<{ label: string; filter: (c: CompraWithSOS) => boolean }> = [
  { label: 'Todas',         filter: () => true },
  { label: 'En proceso',    filter: c => !['Borrador', 'Completada'].includes(getCompraStatus(c)) },
  { label: 'Esperando PL',  filter: c => { const st = getCompraStatus(c); return st === 'Pagada' || st === 'PA Validada' } },
  { label: 'Completadas',   filter: c => getCompraStatus(c) === 'Completada' },
]

const fmtDate = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export function ComprasClient({ compras }: { compras: CompraWithSOS[] }) {
  const [tab, setTab] = useState(0)
  const filtered = compras.filter(TABS[tab]!.filter)

  return (
    <div className="px-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] mb-4">
        {TABS.map((t, i) => {
          const count = compras.filter(t.filter).length
          return (
            <button
              key={t.label}
              onClick={() => setTab(i)}
              className={`px-4 py-2.5 text-[12px] font-medium border-b-2 transition-colors ${
                tab === i
                  ? 'border-[#E30613] text-white'
                  : 'border-transparent text-white/35 hover:text-white/60'
              }`}
            >
              {t.label} <span className="ml-1 text-[10px] opacity-60">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              {['Orden / Fecha', 'SOs', 'Estado', 'Progreso', 'PLs', 'FOB Total', ''].map(h => (
                <th key={h} className="text-left pb-3 text-[10px] font-bold uppercase tracking-[0.1em] text-white/20 border-b border-white/[0.06] pr-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const status   = getCompraStatus(c)
              const qPedida  = getQtyPedida(c)
              const qRecibida= getQtyRecibida(c)
              const pct      = qPedida > 0 ? Math.round((qRecibida / qPedida) * 100) : 0
              const fobTotal = c.sos.reduce((s, so) => s + (so.fobTotal ?? 0), 0)
              const modelos  = [...new Set(c.sos.map(s => s.modelo).filter(Boolean))].slice(0, 2)
              const plCount  = new Set(c.ciplItems.map(() => true)).size > 0 ? c.ciplItems.length : 0

              return (
                <tr key={c.id} className="border-b border-white/[0.04] hover:bg-white/[0.015] transition-colors group">
                  <td className="py-3 pr-4">
                    <div className="font-mono text-[12px] text-white font-medium">{c.piNo ?? `OC-${c.id.slice(-6).toUpperCase()}`}</div>
                    <div className="text-[11px] text-white/30 mt-0.5">{fmtDate(c.fechaOrden)}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="text-[12px] text-white/60 font-mono">{c.sos.map(s => s.soNumber).join(', ')}</div>
                    {modelos.length > 0 && <div className="text-[11px] text-white/30 mt-0.5">{modelos.join(' · ')}</div>}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${getStatusBadgeClass(status)}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 min-w-[120px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-teal-400' : pct > 0 ? 'bg-orange-400' : 'bg-white/10'}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-white/35 w-8 text-right">{pct}%</span>
                    </div>
                    <div className="text-[10px] text-white/25 mt-1">{qRecibida.toLocaleString()} / {qPedida.toLocaleString()} un.</div>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-[13px] font-semibold text-white">{plCount > 0 ? plCount : '—'}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-[13px] text-white">{fmtUSD(fobTotal)}</span>
                  </td>
                  <td className="py-3">
                    <Link href={`/compras/${c.id}`} className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.05] border border-white/[0.08] text-white/50 hover:text-white/80">
                      Ver →
                    </Link>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-[13px] text-white/20">Sin órdenes en esta categoría</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/compras/lib.ts app/compras/page.tsx app/compras/ComprasClient.tsx
git commit -m "feat: compras list page with KPI dashboard"
```

---

## Task 6: Compra Detail Page

**Files:**
- Create: `app/compras/[id]/page.tsx`
- Create: `app/compras/[id]/CompraDetail.tsx`

- [ ] **Step 1: Create the server page**

```bash
mkdir -p "app/compras/[id]"
```

Create `app/compras/[id]/page.tsx`:

```typescript
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getComexSources, fetchAllSourcesData } from '@/app/lib/comex-sources'
import { CompraDetail } from './CompraDetail'

export default async function CompraDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const compra = await prisma.compra.findUnique({
    where: { id },
    include: {
      sos: true,
      ciplItems: {
        select: { id: true, asn: true, qty: true, soPrincipal: true, description: true, caseNo: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!compra) notFound()

  // Fetch liveData from Comex sources — all milestone dates come from here
  const sources = await getComexSources()
  const { liveData } = await fetchAllSourcesData(sources)

  // Serialise dates so the client component can receive them
  const compraSerial = {
    ...compra,
    createdAt:          compra.createdAt.toISOString(),
    updatedAt:          compra.updatedAt.toISOString(),
    fechaOrden:         compra.fechaOrden.toISOString(),
    fechaEnvio:         compra.fechaEnvio?.toISOString()         ?? null,
    fechaPago:          compra.fechaPago?.toISOString()          ?? null,
    fechaSegundaValPA:  compra.fechaSegundaValPA?.toISOString()  ?? null,
    fechaInstruccionCat:compra.fechaInstruccionCat?.toISOString()?? null,
    fechaLMS:           compra.fechaLMS?.toISOString()           ?? null,
    ciplItems: compra.ciplItems.map(c => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    })),
  }

  return <CompraDetail compra={compraSerial} liveData={liveData} />
}
```

- [ ] **Step 2: Create the client component**

Create `app/compras/[id]/CompraDetail.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronDown, ChevronUp, Edit2, Check, X, Loader2, Download } from 'lucide-react'
import { marcarHito, editarCompra } from '@/app/compras/actions'
import { generarConsolidado } from '@/app/compras/consolidado'
import { getStatusBadgeClass } from '@/app/compras/lib'
import type { CompraManualField } from '@/app/compras/actions'
import type { LiveDataMap } from '@/app/lib/comex-sources'

// ─── Types (serialised — all dates are ISO strings) ───────────────────────────

type SOSerial = {
  id: string; soNumber: string; modelo: string | null; sku: string | null
  qPi: number | null; fobUnit: number | null; fobTotal: number | null
  incoterm: string | null; pa: string | null
}

type CIPLSerial = {
  id: string; asn: string | null; qty: number | null; soPrincipal: string | null
  description: string | null; caseNo: string | null; createdAt: string
}

type CompraSerial = {
  id: string; piNo: string | null; notas: string | null; createdAt: string
  supplierName: string | null; supplierAddress: string | null
  supplierContactName: string | null; supplierContactPhone: string | null; supplierContactEmail: string | null
  fechaOrden: string; fechaEnvio: string | null; fechaPago: string | null
  fechaSegundaValPA: string | null; fechaInstruccionCat: string | null; fechaLMS: string | null
  sos: SOSerial[]; ciplItems: CIPLSerial[]
}

// ─── Milestone config ──────────────────────────────────────────────────────────

type MilestoneSource = 'manual' | 'comex'
type Milestone = {
  key:    CompraManualField | string
  label:  string
  source: MilestoneSource
  comexFieldKey?: string
}

const MILESTONES: Milestone[] = [
  { key: 'fechaOrden',          label: 'Orden creada',          source: 'manual' },
  { key: 'fechaEnvio',          label: 'Enviada al proveedor',  source: 'manual' },
  { key: 'fechaPago',           label: 'Pagada',                source: 'manual' },
  { key: 'fechaSegundaValPA',   label: '2da Validación PA',     source: 'manual' },
  { key: '_plCargado',          label: 'PL Cargado',            source: 'comex'  },
  { key: 'fechaInstruccionCat', label: 'Instrucción Category',  source: 'manual' },
  { key: 'fechaLMS',            label: 'LMS',                   source: 'manual' },
  { key: '_arriboWh',           label: 'Arribo WH Airsea',      source: 'comex',  comexFieldKey: 'arriboWh'            },
  { key: '_etd',                label: 'ETD',                   source: 'comex',  comexFieldKey: 'etd'                 },
  { key: '_eta',                label: 'ETA',                   source: 'comex',  comexFieldKey: 'eta'                 },
  { key: '_arriboAduana',       label: 'Arribo Aduana',         source: 'comex',  comexFieldKey: 'fechaArriboAduana'   },
  { key: '_arriboDeposito',     label: 'Arribo Depósito',       source: 'comex',  comexFieldKey: 'fechaArriboDeposito' },
]

const EDITABLE_MANUAL = new Set<string>(['fechaEnvio','fechaPago','fechaSegundaValPA','fechaInstruccionCat','fechaLMS'])

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : null

const fmtUSD = (n: number | null) =>
  n != null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '—'

function getMilestoneDate(
  key: string, compra: CompraSerial, ciplItems: CIPLSerial[],
  sos: SOSerial[], liveData: LiveDataMap, comexFieldKey?: string
): string | null {
  if (key === '_plCargado') return ciplItems.length > 0 ? ciplItems[0]!.createdAt : null
  if (key === 'fechaOrden') return compra.fechaOrden
  if (key in compra) return (compra as Record<string, unknown>)[key] as string | null
  if (comexFieldKey) {
    // Use first matching SO's liveData value
    for (const so of sos) {
      const val = liveData[so.soNumber.toUpperCase()]?.[comexFieldKey]
      if (val) return val
    }
  }
  return null
}

// Derive overall status label
function deriveStatus(compra: CompraSerial, ciplItems: CIPLSerial[], sos: SOSerial[], liveData: LiveDataMap): string {
  const getDate = (key: string, cfk?: string) => getMilestoneDate(key, compra, ciplItems, sos, liveData, cfk)
  if (getDate('_arriboDeposito', 'fechaArriboDeposito')) return 'Completada'
  if (getDate('_arriboAduana',   'fechaArriboAduana'))   return 'En Aduana'
  if (getDate('_eta',            'eta'))                  return 'En tránsito'
  if (getDate('_etd',            'etd'))                  return 'Embarcado'
  if (getDate('_arriboWh',       'arriboWh'))             return 'En WH Airsea'
  if (compra.fechaLMS)                                    return 'LMS'
  if (compra.fechaInstruccionCat)                         return 'Instrucción Category'
  if (ciplItems.length > 0)                               return 'PL Cargado'
  if (compra.fechaSegundaValPA)                           return 'PA Validada'
  if (compra.fechaPago)                                   return 'Pagada'
  if (compra.fechaEnvio)                                  return 'Enviada'
  return 'Borrador'
}

// ─── DateEditor ───────────────────────────────────────────────────────────────

function DateEditor({ compraId, field, current, onClose }: {
  compraId: string; field: CompraManualField; current: string | null; onClose: () => void
}) {
  const [value, setValue] = useState(current ? current.slice(0, 10) : '')
  const [pending, startT] = useTransition()
  const [err, setErr]     = useState('')

  function save() {
    startT(async () => {
      const res = await marcarHito(compraId, field, value || null)
      if (res.ok) onClose()
      else setErr(res.error)
    })
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="date"
        value={value}
        onChange={e => setValue(e.target.value)}
        className="bg-white/[0.06] border border-white/15 rounded-lg px-3 py-1.5 text-[12px] text-white outline-none focus:border-white/30"
      />
      <button onClick={save} disabled={pending} className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#E30613]/20 text-[#E30613] hover:bg-[#E30613]/30">
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
      </button>
      <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.06] text-white/40 hover:text-white/60">
        <X className="w-3 h-3" />
      </button>
      {err && <span className="text-[11px] text-red-400">{err}</span>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CompraDetail({ compra, liveData }: { compra: CompraSerial; liveData: LiveDataMap }) {
  const router = useRouter()
  const [editingMilestone, setEditingMilestone] = useState<string | null>(null)
  const [expandedSOs, setExpandedSOs]           = useState<Set<string>>(new Set())
  const [dlPending, startDl]                     = useTransition()
  const [dlError, setDlError]                    = useState<string | null>(null)

  const status    = deriveStatus(compra, compra.ciplItems, compra.sos, liveData)
  const qPedida   = compra.sos.reduce((s, so) => s + (so.qPi ?? 0), 0)
  const qRecibida = compra.ciplItems.reduce((s, c) => s + (c.qty ?? 0), 0)
  const fobTotal  = compra.sos.reduce((s, so) => s + (so.fobTotal ?? 0), 0)
  const pct       = qPedida > 0 ? Math.round((qRecibida / qPedida) * 100) : 0

  // Group CIPLItems by ASN for display inside SO cards
  const ciplByASN = compra.ciplItems.reduce<Record<string, CIPLSerial[]>>((acc, c) => {
    const key = c.asn ?? 'Sin ASN'
    acc[key] = [...(acc[key] ?? []), c]
    return acc
  }, {})

  // Get unique embarque numbers from liveData for Consolidado export
  const embarques = [...new Set(
    compra.sos.map(so => liveData[so.soNumber.toUpperCase()]?.['embarqueNo']).filter(Boolean) as string[]
  )]

  function toggleSO(soNumber: string) {
    setExpandedSOs(prev => {
      const next = new Set(prev)
      next.has(soNumber) ? next.delete(soNumber) : next.add(soNumber)
      return next
    })
  }

  function handleConsolidado(embarqueNo: string) {
    setDlError(null)
    startDl(async () => {
      const res = await generarConsolidado(compra.id, embarqueNo)
      if ('error' in res) { setDlError(res.error); return }
      const blob = new Blob([Buffer.from(res.data, 'base64')], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href = url; a.download = res.filename; a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/compras')} className="text-white/30 hover:text-white/70 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[15px] font-semibold text-white">{compra.piNo ?? `OC-${compra.id.slice(-6).toUpperCase()}`}</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${getStatusBadgeClass(status as Parameters<typeof getStatusBadgeClass>[0])}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />{status}
              </span>
            </div>
            <p className="text-[11px] text-white/30 mt-0.5">
              {compra.supplierName ?? 'Sin proveedor'} · Creada {fmtDate(compra.fechaOrden)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {embarques.map(emb => (
            <button
              key={emb}
              onClick={() => handleConsolidado(emb)}
              disabled={dlPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.05] border border-white/[0.08] text-white/50 hover:text-white/80 transition-colors"
            >
              {dlPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              PL Consolidado {emb}
            </button>
          ))}
        </div>
      </div>

      {dlError && (
        <div className="mx-6 mt-4 text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{dlError}</div>
      )}

      <div className="p-6 space-y-6">
        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Unidades pedidas',  value: qPedida.toLocaleString() },
            { label: 'Recibidas',         value: qRecibida.toLocaleString(), accent: true },
            { label: 'PLs vinculados',    value: Object.keys(ciplByASN).length.toString() },
            { label: 'FOB Total',         value: fmtUSD(fobTotal) },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/25">{label}</div>
              <div className={`text-[22px] font-bold mt-1.5 ${accent ? 'text-emerald-400' : 'text-white'}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-5">Hitos del proceso</p>
          <div className="flex items-start gap-0 overflow-x-auto pb-2">
            {MILESTONES.map((m, idx) => {
              const date     = getMilestoneDate(m.key, compra, compra.ciplItems, compra.sos, liveData, m.comexFieldKey)
              const isDone   = !!date
              const isEditing= editingMilestone === m.key
              const canEdit  = m.source === 'manual' && EDITABLE_MANUAL.has(m.key)
              const isFirst  = idx === 0

              return (
                <div key={m.key} className="flex items-start">
                  {!isFirst && (
                    <div className={`w-6 h-0.5 mt-4 shrink-0 ${isDone ? 'bg-emerald-500/50' : 'bg-white/[0.06]'}`} />
                  )}
                  <div className="flex flex-col items-center min-w-[80px]">
                    <button
                      onClick={() => canEdit && setEditingMilestone(isEditing ? null : m.key)}
                      disabled={!canEdit}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] border-2 transition-all ${
                        isDone
                          ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400'
                          : m.source === 'comex'
                          ? 'bg-orange-500/10 border-orange-500/20 text-orange-400/40'
                          : 'bg-white/[0.04] border-white/[0.12] text-white/20'
                      } ${canEdit && !isDone ? 'hover:border-white/30 cursor-pointer' : ''}`}
                      title={m.source === 'comex' ? 'Automático desde Comex' : canEdit ? 'Click para marcar' : ''}
                    >
                      {isDone ? '✓' : m.source === 'comex' ? '⟳' : '○'}
                    </button>
                    <div className="text-center mt-2">
                      <div className={`text-[10px] font-medium leading-tight ${isDone ? 'text-white/70' : 'text-white/25'}`}>
                        {m.label}
                      </div>
                      {date && (
                        <div className="text-[10px] text-white/35 mt-0.5 flex items-center gap-1 justify-center">
                          {fmtDate(date)}
                          {canEdit && (
                            <button onClick={() => setEditingMilestone(isEditing ? null : m.key)} className="text-white/20 hover:text-white/50">
                              <Edit2 className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      )}
                      {!date && m.source === 'comex' && (
                        <div className="text-[9px] text-orange-400/40 mt-0.5">desde Comex</div>
                      )}
                    </div>
                    {isEditing && canEdit && (
                      <div className="absolute mt-16 z-10 bg-[#1a1a2e] border border-white/10 rounded-xl p-3 shadow-xl">
                        <DateEditor
                          compraId={compra.id}
                          field={m.key as CompraManualField}
                          current={date}
                          onClose={() => setEditingMilestone(null)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 py-4 flex items-center gap-4">
          <span className="text-[12px] text-white/40 shrink-0">Recepción total</span>
          <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-teal-400' : 'bg-orange-400'}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <span className="text-[13px] font-bold text-white shrink-0">{pct}%</span>
          <span className="text-[12px] text-white/35 shrink-0">{qRecibida.toLocaleString()} / {qPedida.toLocaleString()} un.</span>
        </div>

        {/* SO Cards */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-3">SOs incluidos y PLs recibidos</p>
          {compra.sos.map(so => {
            const soItems    = compra.ciplItems.filter(c => c.soPrincipal?.toUpperCase() === so.soNumber.toUpperCase())
            const qRec       = soItems.reduce((s, c) => s + (c.qty ?? 0), 0)
            const pctSO      = (so.qPi ?? 0) > 0 ? Math.round((qRec / so.qPi!) * 100) : 0
            const isExpanded = expandedSOs.has(so.soNumber)
            const asnGroups  = soItems.reduce<Record<string, CIPLSerial[]>>((acc, c) => {
              const key = c.asn ?? 'Sin ASN'; acc[key] = [...(acc[key] ?? []), c]; return acc
            }, {})
            const embarqueLabel = liveData[so.soNumber.toUpperCase()]?.['embarqueNo'] ?? null

            return (
              <div key={so.id} className="bg-white/[0.02] border border-white/[0.06] rounded-xl mb-3 overflow-hidden">
                <button
                  onClick={() => toggleSO(so.soNumber)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.02] transition-colors"
                >
                  <span className="font-mono text-[11px] font-bold text-[#E30613] bg-[#E30613]/10 px-2 py-0.5 rounded shrink-0">{so.soNumber}</span>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-[13px] text-white font-medium truncate">{so.modelo ?? '—'}</div>
                    <div className="text-[11px] text-white/35 mt-0.5">{so.sku ?? ''}{so.incoterm ? ` · ${so.incoterm}` : ''}{embarqueLabel ? ` · Embarque: ${embarqueLabel}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-[12px] text-white/50">{qRec.toLocaleString()} / {(so.qPi ?? 0).toLocaleString()} un.</div>
                      <div className="w-24 h-1.5 bg-white/[0.06] rounded-full mt-1 overflow-hidden">
                        <div className={`h-full rounded-full ${pctSO >= 100 ? 'bg-teal-400' : 'bg-orange-400'}`} style={{ width: `${Math.min(pctSO, 100)}%` }} />
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-white/20" /> : <ChevronDown className="w-4 h-4 text-white/20" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/[0.06] bg-black/20 p-4">
                    {Object.entries(asnGroups).map(([asn, items]) => (
                      <div key={asn} className="flex items-center gap-3 py-2.5 border-b border-white/[0.04] last:border-0 text-[12px]">
                        <span className="font-mono text-[11px] text-white/40 min-w-[160px]">{asn}</span>
                        <span className="text-white/30">{fmtDate(items[0]!.createdAt)}</span>
                        <span className="font-semibold text-white">{items.reduce((s,c)=>s+(c.qty??0),0).toLocaleString()} un.</span>
                        <Link href={`/panel-general?asn=${asn}`} className="ml-auto text-indigo-400 hover:text-indigo-300 text-[11px]">
                          → Panel General
                        </Link>
                      </div>
                    ))}
                    {Object.keys(asnGroups).length === 0 && (
                      <div className="text-center py-6 text-[12px] text-white/20 border border-dashed border-white/[0.08] rounded-lg">
                        ⏳ Sin PLs recibidos para este SO
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/compras/[id]/"
git commit -m "feat: compra detail page with timeline and SO cards"
```

---

## Task 7: Auto-Link CIPLItems → Compra in ETL

**Files:**
- Modify: `app/lib/etl.ts`

- [ ] **Step 1: Add auto-link logic after createMany**

In `app/lib/etl.ts`, replace the `await prisma.cIPLItem.createMany({ data: rows })` line and the return with:

```typescript
    const result = await prisma.cIPLItem.createMany({ data: rows })

    // Auto-link new CIPLItems to a Compra if SO matches
    const savedSOs = [...new Set(sosPrincipal.filter(Boolean).map(s => s.trim().toUpperCase()))]
    if (savedSOs.length > 0) {
      const compraSOItems = await prisma.compraSOItem.findMany({
        where: { soNumber: { in: savedSOs } },
        select: { compraId: true, soNumber: true },
      })
      if (compraSOItems.length > 0) {
        const soToCompra = new Map(compraSOItems.map(c => [c.soNumber.toUpperCase(), c.compraId]))
        for (const [so, compraId] of soToCompra) {
          await prisma.cIPLItem.updateMany({
            where: { soPrincipal: { equals: so, mode: 'insensitive' }, compraId: null },
            data:  { compraId },
          })
        }
        console.log(`[ETL] Auto-linked CIPLItems to compras for SOs: ${[...soToCompra.keys()].join(', ')}`)
      }
    }

    return { success: true, count: result.count }
```

Make sure to remove the old `return { success: true, count: rows.length }` line.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/etl.ts
git commit -m "feat: auto-link CIPLItems to Compra by SO match on save"
```

---

## Task 8: PL Consolidado Export

**Files:**
- Create: `app/compras/consolidado.ts`

- [ ] **Step 1: Create the server action**

Create `app/compras/consolidado.ts`:

```typescript
'use server'

import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getComexSources, fetchAllSourcesData } from '@/app/lib/comex-sources'

export async function generarConsolidado(
  compraId: string,
  embarqueNo: string,
): Promise<{ data: string; filename: string } | { error: string }> {
  try {
    const compra = await prisma.compra.findUnique({
      where: { id: compraId },
      include: { sos: true, ciplItems: true },
    })
    if (!compra) return { error: 'Compra no encontrada.' }

    const sources   = await getComexSources()
    const { liveData } = await fetchAllSourcesData(sources)

    // Filter CIPLItems for this embarque (SOs in this compra whose embarqueNo matches)
    const matchingSOs = new Set(
      compra.sos
        .filter(so => liveData[so.soNumber.toUpperCase()]?.['embarqueNo'] === embarqueNo)
        .map(so => so.soNumber.toUpperCase())
    )

    const items = compra.ciplItems
      .filter(c => c.soPrincipal && matchingSOs.has(c.soPrincipal.toUpperCase()))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

    if (items.length === 0) return { error: `Sin productos para el embarque ${embarqueNo}.` }

    // Build SO lookup for GSO snapshot fields
    const soMap = new Map(compra.sos.map(so => [so.soNumber.toUpperCase(), so]))

    // Headers — row 1 with merged cells handled via XLSX
    const headers1 = [
      'Dangerous Goods','Item','Supplier','FACTORY ADDRESS','Contact Name','Phone Number','e-mail',
      'Order Number','INCOTERM','PALLET or Container Number','SO-NUMBER','Bidcom Internal Code',
      'CTNS','DESCRIPTION','Quantity Per Carton','TOTAL','Weight/CTN (kg/CTN)',
      'Dimension (cm)','','','TOTAL CBM (M3)','TOTAL WEIGHT (kg)',
      'M3 por Bulto','Kg* Bulto Deposito','PL Original','Comments','Fecha Prioritaria','PA',
    ]
    const headers2 = Array(headers1.length).fill('')
    headers2[17] = 'W'; headers2[18] = 'L'; headers2[19] = 'H'

    const dataRows = items.map((item, i) => {
      const so = item.soPrincipal ? soMap.get(item.soPrincipal.toUpperCase()) : null
      const gwTotal = (item.gwKg ?? 0) * (item.qBultos ?? 1)
      return [
        item.isDangerousGood ? 'YES' : '',
        i + 1,
        compra.supplierName         ?? '',
        compra.supplierAddress      ?? '',
        compra.supplierContactName  ?? '',
        compra.supplierContactPhone ?? '',
        compra.supplierContactEmail ?? '',
        item.asn ?? item.piNo ?? '',
        so?.incoterm ?? '',
        item.caseNo ?? '',
        item.soPrincipal ?? '',
        so?.sku ?? '',
        item.qBultos ?? '',
        item.description ?? '',
        item.uniXBulto ?? '',
        item.qty ?? '',
        item.gwKg ?? '',
        item.w ?? '',
        item.l ?? '',
        item.h ?? '',
        item.cbm ?? '',
        gwTotal || '',
        item.cbmXBulto ?? '',
        item.gwKg ?? '',
        item.driveLinkPl ?? item.driveLinkExcel ?? '',
        '',
        '',
        so?.pa ?? '',
      ]
    })

    // Totals row
    const totals = Array(headers1.length).fill('')
    totals[0]  = 'Total'
    totals[12] = items.reduce((s, c) => s + (c.qBultos ?? 0), 0)   // CTNS
    totals[15] = items.reduce((s, c) => s + (c.qty     ?? 0), 0)   // TOTAL
    totals[16] = items.reduce((s, c) => s + (c.gwKg    ?? 0), 0)   // Weight/CTN
    totals[20] = items.reduce((s, c) => s + (c.cbm     ?? 0), 0)   // TOTAL CBM
    totals[21] = items.reduce((s, c) => s + ((c.gwKg ?? 0) * (c.qBultos ?? 1)), 0)  // TOTAL WEIGHT

    const aoa = [headers1, headers2, ...dataRows, totals]

    const ws = XLSX.utils.aoa_to_sheet(aoa)

    // Column widths
    ws['!cols'] = [
      {wch:12},{wch:5},{wch:24},{wch:32},{wch:16},{wch:14},{wch:28},
      {wch:20},{wch:14},{wch:22},{wch:12},{wch:16},
      {wch:8},{wch:40},{wch:16},{wch:10},{wch:16},
      {wch:8},{wch:8},{wch:8},{wch:12},{wch:14},
      {wch:12},{wch:16},{wch:36},{wch:20},{wch:14},{wch:16},
    ]

    // Merge Dimension header
    ws['!merges'] = [
      { s: { r:0, c:17 }, e: { r:0, c:19 } },  // "Dimension (cm)" spans W/L/H
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'PL Consolidado Mercaderia')

    const dateStr  = new Date().toISOString().slice(0, 10)
    const filename = `PL_Consolidado_${embarqueNo}_${dateStr}.xlsx`
    const buffer   = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const data     = buffer.toString('base64')

    return { data, filename }
  } catch (err) {
    console.error('[generarConsolidado]', err)
    return { error: String(err) }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/compras/consolidado.ts
git commit -m "feat: PL Consolidado Excel export server action"
```

---

## Task 9: Sidebar + Operaciones Milestone Section + Home KPIs

**Files:**
- Modify: `components/sidebar.tsx`
- Modify: `app/operaciones/ComexSourcesClient.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Add Compras to sidebar**

In `components/sidebar.tsx`, add the `ShoppingCart` import to the lucide import line, then add the nav entry between Inicio and Panel General:

```typescript
// In the lucide import, add:
import { Home, LayoutDashboard, Upload, Anchor, Database, ChevronLeft, ChevronRight, Camera, Send, BarChart2, ShoppingCart } from 'lucide-react'

// In the nav array, after the Inicio entry:
{ href: '/compras',       label: 'Compras',           icon: ShoppingCart },
```

- [ ] **Step 2: Add milestone mapping section to Operaciones**

At the end of `app/operaciones/ComexSourcesClient.tsx`, before the final closing tag of the main component's return, add a new section. First add the import at the top of the file:

```typescript
import { COMPRA_COMEX_MILESTONE_FIELDS } from '@/app/lib/comex-fields'
```

Then add the section after the existing sources list:

```typescript
{/* Compra Milestone Mappings */}
<div className="mt-8 border border-white/[0.06] rounded-xl overflow-hidden">
  <div className="px-5 py-4 border-b border-white/[0.06] bg-white/[0.02]">
    <h2 className="text-[13px] font-semibold text-white">Hitos de Compra — Mapeo de Fuentes Comex</h2>
    <p className="text-[11px] text-white/35 mt-1">
      Configurá qué columna de tus fuentes Comex alimenta cada hito de la orden de compra.
      Para mapear un campo, editá la fuente correspondiente y asignale el fieldKey indicado.
    </p>
  </div>
  <div className="divide-y divide-white/[0.04]">
    {COMPRA_COMEX_MILESTONE_FIELDS.map(f => {
      const mapped = sources.some(s =>
        s.enabled && s.mappings.some(m => m.fieldKey === f.fieldKey && !m.isJoin)
      )
      return (
        <div key={f.fieldKey} className="flex items-center justify-between px-5 py-3">
          <div>
            <span className="text-[13px] text-white/70">{f.label}</span>
            <span className="ml-2 font-mono text-[10px] text-white/25 bg-white/[0.04] px-1.5 py-0.5 rounded">{f.fieldKey}</span>
          </div>
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
            mapped
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-white/[0.06] text-white/25'
          }`}>
            {mapped ? '✓ Mapeado' : '⏳ Sin mapear'}
          </span>
        </div>
      )
    })}
  </div>
  <div className="px-5 py-3 border-t border-white/[0.06] bg-white/[0.01]">
    <p className="text-[11px] text-white/20">
      Para activar un hito, editá la fuente Comex correspondiente → agregá una columna → asigná el fieldKey exacto de la tabla.
    </p>
  </div>
</div>
```

- [ ] **Step 3: Add Compras KPI to home page**

In `app/page.tsx`, add a Compras section. After the existing `const recent = items.slice(0, 8)` lines, add:

```typescript
  // Compras KPIs
  const compras = await prisma.compra.findMany({
    select: {
      id: true, fechaPago: true, fechaLMS: true, fechaInstruccionCat: true, fechaEnvio: true,
      sos: { select: { fobTotal: true } },
      ciplItems: { select: { id: true } },
    },
  })
  const comprasActivas   = compras.filter(c => !c.fechaLMS).length
  const comprasSinPL     = compras.filter(c => c.fechaPago && c.ciplItems.length === 0).length
  const fobActivo        = compras.filter(c => !c.fechaLMS).reduce((s, c) => s + c.sos.reduce((ss, so) => ss + (so.fobTotal ?? 0), 0), 0)
```

Then in the JSX, add a Compras card to the existing KPI grid. Look for the section that renders stats and add:

```tsx
{/* Compras section — add near the top KPI cards */}
<Link href="/compras" className="block bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 hover:border-white/10 transition-colors group">
  <div className="flex items-center justify-between mb-3">
    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25">Órdenes de Compra</span>
    <ArrowUpRight className="w-3.5 h-3.5 text-white/15 group-hover:text-white/40 transition-colors" />
  </div>
  <div className="grid grid-cols-3 gap-3">
    <div><div className="text-[20px] font-bold text-white">{comprasActivas}</div><div className="text-[11px] text-white/30 mt-0.5">activas</div></div>
    <div><div className="text-[20px] font-bold text-amber-400">{comprasSinPL}</div><div className="text-[11px] text-white/30 mt-0.5">sin PL</div></div>
    <div><div className="text-[13px] font-bold text-white">{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:0}).format(fobActivo)}</div><div className="text-[11px] text-white/30 mt-0.5">FOB abierto</div></div>
  </div>
</Link>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add components/sidebar.tsx app/operaciones/ComexSourcesClient.tsx app/page.tsx
git commit -m "feat: sidebar Compras link, operaciones milestone section, home KPIs"
```

---

## Task 10: Deploy + Smoke Test

- [ ] **Step 1: Final TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Full build**

```bash
npm run build 2>&1 | tail -30
```

Expected: all routes compile, no errors.

- [ ] **Step 3: Deploy to production**

```bash
npx vercel deploy --prod --yes
```

Expected: `Aliased: https://panel-comprass.vercel.app`

- [ ] **Step 4: Smoke test checklist**

Open `https://panel-comprass.vercel.app` and verify:
- [ ] Sidebar shows "Compras" between Inicio and Panel General
- [ ] `/compras` loads with KPI grid and empty table
- [ ] `/compras/nueva` loads with SO search — typing a model name shows results
- [ ] Creating a compra redirects to `/compras/[id]`
- [ ] Detail page shows timeline with manual milestones clickable
- [ ] `/operaciones` shows the new "Hitos de Compra" section at the bottom
- [ ] Home page shows Compras KPI card

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Panel de Compras — full procurement lifecycle module

- /compras list with KPI dashboard (FOB, units, alerts)
- /compras/nueva SO picker from GSO V4
- /compras/[id] detail with milestone timeline + SO cards
- Auto-link CIPLItems → Compra on CIPL save
- PL Consolidado Excel export per embarque
- Comex milestone fieldKey skeleton in /operaciones
- Home page Compras KPI card

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `Compra` + `CompraSOItem` DB models (Task 1)
- ✅ `compraId` on `CIPLItem` (Task 1)
- ✅ New Comex fieldKeys: `embarqueNo`, `fechaArriboAduana`, `fechaArriboDeposito` (Task 2)
- ✅ `listAllSOs()` for SO picker (Task 2)
- ✅ `crearCompra`, `marcarHito`, `editarCompra` actions (Task 3)
- ✅ Nueva Compra page with SO picker + supplier form (Task 4)
- ✅ List page + KPI dashboard + alerts (Task 5)
- ✅ Detail page with timeline (manual + Comex) + SO cards + PL rows (Task 6)
- ✅ Auto-link on CIPL save (Task 7)
- ✅ PL Consolidado Excel export (Task 8)
- ✅ Operaciones milestone mapping section (Task 9)
- ✅ Sidebar entry (Task 9)
- ✅ Home page KPIs (Task 9)
- ✅ Deploy + smoke test (Task 10)

**Comex tab Consolidado:** The export button is on the Compra detail page directly (via `embarques` array from liveData). A separate Comex tab view is deferred — the detail page covers the need.

**No placeholders found.** All steps have concrete code.
