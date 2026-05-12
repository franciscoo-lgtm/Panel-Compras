# Panel General v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a localStorage-persisted column selector with group headers to the Panel General table, plus fix dual-SO Q GSO to read live data per SO instead of the stored item field.

**Architecture:** Single file — `app/panel-general/PanelGeneralClient.tsx` (782 lines). We add constants + types at module level, a `ColumnSelectorPopover` component before the main component, a `visibleCols` state in the main component, replace the `<thead>` with a two-row version, wrap body `<td>`s in visibility guards, add currently-missing Comex/Tracking columns, and fix the Q GSO lookup. No new files, no new routes, no DB changes.

**Tech Stack:** React 18 (useState, useEffect, useCallback, useRef, useMemo), Next.js App Router client component, Tailwind CSS, TypeScript.

---

## File Map

| File | Change |
|---|---|
| `app/panel-general/PanelGeneralClient.tsx` | All changes — constants, new component, state, thead, tbody, Q GSO fix |

---

### Task 1: Constants, types, and column definitions

**Files:**
- Modify: `app/panel-general/PanelGeneralClient.tsx:1` (add import) and after line 8 (add module-level constants)

No visual change yet — this just sets up the data model for visibility.

- [ ] **Step 1: Add `useRef` to the React import and add all column constants after the import block**

Find:
```tsx
import { useState, useTransition, useEffect, useCallback, useMemo } from 'react'
```

Replace with:
```tsx
import { useState, useTransition, useEffect, useCallback, useMemo, useRef } from 'react'
```

Then, after the imports block (after line 8, before `// ─── Types ───`), insert:

```tsx
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
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
cd /workspaces/Panel-Compras && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors (or only pre-existing unrelated errors — note them if any).

- [ ] **Step 3: Commit**

```bash
git add app/panel-general/PanelGeneralClient.tsx
git commit -m "feat(panel-v2): add ColKey types and group constants"
```

---

### Task 2: ColumnSelectorPopover component

**Files:**
- Modify: `app/panel-general/PanelGeneralClient.tsx` — insert new component before the `PhotoModal` component (before line 103)

- [ ] **Step 1: Insert the ColumnSelectorPopover component**

Find the comment `// ─── Photo modal ──` (around line 103) and insert before it:

```tsx
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
              <>
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
              </>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add app/panel-general/PanelGeneralClient.tsx
git commit -m "feat(panel-v2): add ColumnSelectorPopover component"
```

---

### Task 3: Add visibleCols state and Columns button to toolbar

**Files:**
- Modify: `app/panel-general/PanelGeneralClient.tsx` — main component state section (~line 380) and toolbar JSX (~line 520)

- [ ] **Step 1: Add visibleCols state after the existing state declarations**

Find the block starting with `const [tab, setTab]` (around line 380). After the last existing `useState` / `useTransition` line (`const [deleting, startDelete] = useTransition()`), add:

```tsx
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
```

- [ ] **Step 2: Add the Columns button to the toolbar**

In the toolbar JSX, find the existing `Exportar Excel` button (around line 520):

```tsx
        <button
          onClick={() => exportXLSX(exportRows, extraColumns, liveData)}
          className={`${selected.size > 0 ? '' : 'ml-auto'} flex items-center gap-1.5 h-9 px-4 rounded-xl border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors`}
        >
```

Add the `ColumnSelectorPopover` button immediately before the Excel button (preserving the `ml-auto` logic):

```tsx
        <div className={`${selected.size > 0 ? '' : 'ml-auto'} flex items-center gap-2`}>
          <ColumnSelectorPopover visibleCols={visibleCols} onChange={applyVisibleCols} />
          <button
            onClick={() => exportXLSX(exportRows, extraColumns, liveData)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {selected.size > 0 ? `Exportar ${selected.size} sel.` : 'Exportar Excel'}
          </button>
        </div>
```

(Remove the original standalone Excel button that had `ml-auto` on it.)

- [ ] **Step 3: Start dev server and verify the Columns popover appears**

```bash
npm run dev &
```

Open http://localhost:3000/panel-general — click "⊞ Columnas" and confirm the popover renders with groups and checkboxes. Toggling a checkbox should not crash (columns don't hide yet — that's Task 4).

- [ ] **Step 4: Commit**

```bash
git add app/panel-general/PanelGeneralClient.tsx
git commit -m "feat(panel-v2): add visibleCols state and column selector button"
```

---

### Task 4: Two-row thead with group headers

**Files:**
- Modify: `app/panel-general/PanelGeneralClient.tsx` — replace entire `<thead>` block (lines 533–579)

- [ ] **Step 1: Replace the entire `<thead>` block**

Find and replace the block from `<thead className="sticky top-0 z-10 bg-zinc-50">` through `</thead>` (lines 533–579) with:

```tsx
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Verify in browser**

Refresh http://localhost:3000/panel-general. The table should have two header rows — top row shows group names in their colors, second row shows individual column names. Columns don't hide yet (body not updated).

- [ ] **Step 4: Commit**

```bash
git add app/panel-general/PanelGeneralClient.tsx
git commit -m "feat(panel-v2): add two-row group header to table"
```

---

### Task 5: Wrap body cells with visibility guards + add missing Comex columns

**Files:**
- Modify: `app/panel-general/PanelGeneralClient.tsx` — tbody section (lines 580–758)

This task wraps every hideable `<td>` in `{vis.has('colKey') && ...}` and adds the six missing Comex/Tracking columns and two Comercial columns (Incoterm, Puerto Salida) that exist in the DB but have no table cells yet.

- [ ] **Step 1: Wrap Identificación columns**

Find the body cell block starting at ~line 602 (right after the checkbox `<td>`). Replace the unwrapped cells:

```tsx
                    <td className="pl-5 pr-2 py-2.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isRep ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                      }`}>
                        {isRep ? <FileSpreadsheet className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                        {item.tipoCarga}
                      </span>
                    </td>

                    <td className="px-2 py-2.5 text-zinc-400 whitespace-nowrap">{fmtDate(item.createdAt)}</td>
                    <td className="px-2 py-2.5 text-zinc-500">{item.categoryName ?? '—'}</td>
                    <td className="px-2 py-2.5 font-mono text-zinc-600">{item.asn ?? '—'}</td>
                    <td className="px-2 py-2.5 text-zinc-500 whitespace-nowrap">{fmtDate(item.date)}</td>
```

With:

```tsx
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
```

- [ ] **Step 2: Wrap Producto columns**

Find and replace the Producto cells:

```tsx
                    <td className="px-2 py-2.5 font-mono text-zinc-600">{item.piNo ?? '—'}</td>
                    <td className="px-2 py-2.5 font-mono text-zinc-600">
                      {isRep ? (item.caseNo ?? '—') : (item.qBultos != null ? `${item.qBultos} bultos` : '—')}
                    </td>
                    <td className="px-2 py-2.5 font-mono text-zinc-600">{item.codeEan ?? '—'}</td>
                    <td className="px-2 py-2.5 max-w-[180px]">
                      <span className="line-clamp-2 text-zinc-700" title={item.description ?? ''}>{item.description ?? '—'}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono text-zinc-600">{item.qty ?? '—'}</td>
```

With:

```tsx
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
```

- [ ] **Step 3: Wrap PL vs GSO cells**

The current IIFE block renders three cells unconditionally. Replace the entire `{(() => { ... })()}` block with:

```tsx
                    {vis.has('plSO') || vis.has('qGso') || vis.has('dif') ? (() => {
                      const soTotal = item._displaySO ? (soQtyMap.get(item._displaySO) ?? null) : null
                      const rawQGso = gl(item, 'qPi')
                      const qGso   = rawQGso != null ? Number(rawQGso) : (item._isPrimary ? item.qPi : null)
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
```

Note: this step also implements the Q GSO dual-SO fix (spec §6) — `gl(item, 'qPi')` reads from live data keyed by `item._displaySO`, which is `soSecundario` for split secondary rows.

- [ ] **Step 4: Wrap Dimensiones cells**

Replace the four rowspan cells and two non-rowspan cells:

```tsx
                    {!skipSet.has(rowKey) && (
                      <td className="px-2 py-2.5 text-right font-mono text-zinc-500 align-middle" rowSpan={spanMap.get(rowKey) ?? 1}>
                        {dims}
                      </td>
                    )}
                    {!skipSet.has(rowKey) && (
                      <td className="px-2 py-2.5 text-right font-mono text-zinc-600 align-middle" rowSpan={spanMap.get(rowKey) ?? 1}>
                        {fmtNum(item.gwKg, 2)}
                      </td>
                    )}
                    {!skipSet.has(rowKey) && (
                      <td className="px-2 py-2.5 text-right font-mono text-zinc-600 align-middle" rowSpan={spanMap.get(rowKey) ?? 1}>
                        {fmtNum(item.cbm, 5)}
                      </td>
                    )}
                    {!skipSet.has(rowKey) && (
                      <td className="px-2 py-2.5 text-right font-mono text-zinc-500 align-middle" rowSpan={spanMap.get(rowKey) ?? 1}>
                        {fmtNum(item.cbmXBulto, 5)}
                      </td>
                    )}
                    <td className="px-2 py-2.5 text-right font-mono text-zinc-500">
                      {fmtNum(item.uniXBulto, 4)}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      {item.isDangerousGood
                        ? <AlertTriangle className="w-3.5 h-3.5 text-orange-500 mx-auto" />
                        : <span className="text-zinc-200">—</span>}
                    </td>
```

With:

```tsx
                    {vis.has('wxlxh') && !skipSet.has(rowKey) && (
                      <td className={`px-2 py-2.5 text-right font-mono text-zinc-500 align-middle ${firstVisibleBorder(GROUPS[3],'wxlxh',vis)}`} rowSpan={spanMap.get(rowKey) ?? 1}>
                        {dims}
                      </td>
                    )}
                    {vis.has('gwKg') && !skipSet.has(rowKey) && (
                      <td className={`px-2 py-2.5 text-right font-mono text-zinc-600 align-middle ${firstVisibleBorder(GROUPS[3],'gwKg',vis)}`} rowSpan={spanMap.get(rowKey) ?? 1}>
                        {fmtNum(item.gwKg, 2)}
                      </td>
                    )}
                    {vis.has('cbm') && !skipSet.has(rowKey) && (
                      <td className={`px-2 py-2.5 text-right font-mono text-zinc-600 align-middle ${firstVisibleBorder(GROUPS[3],'cbm',vis)}`} rowSpan={spanMap.get(rowKey) ?? 1}>
                        {fmtNum(item.cbm, 5)}
                      </td>
                    )}
                    {vis.has('cbmBulto') && !skipSet.has(rowKey) && (
                      <td className={`px-2 py-2.5 text-right font-mono text-zinc-500 align-middle ${firstVisibleBorder(GROUPS[3],'cbmBulto',vis)}`} rowSpan={spanMap.get(rowKey) ?? 1}>
                        {fmtNum(item.cbmXBulto, 5)}
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
```

- [ ] **Step 5: Wrap Comercial cells and add Incoterm + Puerto Salida**

Find the SO Principal cell block (the `{/* Active SO for this display row */}` comment through the Fotos `</td>`). Replace the entire Comercial section:

```tsx
                    {/* Active SO for this display row */}
                    <td className="px-2 py-2.5">
                      ...
                    </td>
                    {/* Other SO (context, dimmed) */}
                    <td className="px-2 py-2.5">
                      ...
                    </td>
                    {/* Drive links */}
                    <td className="px-2 py-2.5">
                      ...
                    </td>
                    {/* Fotos */}
                    <td className="px-2 py-2.5 text-center">
                      ...
                    </td>
```

With (preserving all existing inner content, just adding `vis.has(...)` guards and new columns):

```tsx
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
                        {item._isPrimary && item.photoCount > 0 && (
                          <button
                            onClick={() => setViewingPhotosFor(item.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors text-[10px] font-bold"
                          >
                            <Camera className="w-3 h-3" />
                            {item.photoCount}
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
```

- [ ] **Step 6: Add Comex / Tracking cells after Comercial and before extra columns**

Find the `{/* Extra columns from live sources */}` comment. Insert the Comex cells immediately before it:

```tsx
                    {/* Comex / Tracking */}
                    {vis.has('etd')       && <td className={`px-2 py-2.5 text-zinc-600 text-[11px] whitespace-nowrap ${firstVisibleBorder(GROUPS[5],'etd',vis)}`}>{fmtDate(item.etd)}</td>}
                    {vis.has('eta')       && <td className={`px-2 py-2.5 text-zinc-600 text-[11px] whitespace-nowrap ${firstVisibleBorder(GROUPS[5],'eta',vis)}`}>{fmtDate(item.eta)}</td>}
                    {vis.has('etaCaldas') && <td className={`px-2 py-2.5 text-zinc-600 text-[11px] whitespace-nowrap ${firstVisibleBorder(GROUPS[5],'etaCaldas',vis)}`}>{fmtDate(item.etaCaldas)}</td>}
                    {vis.has('awb')       && <td className={`px-2 py-2.5 font-mono text-zinc-600 text-[11px] ${firstVisibleBorder(GROUPS[5],'awb',vis)}`}>{item.awb ?? <span className="text-zinc-200">—</span>}</td>}
                    {vis.has('arriboWh')  && <td className={`px-2 py-2.5 text-zinc-600 text-[11px] whitespace-nowrap ${firstVisibleBorder(GROUPS[5],'arriboWh',vis)}`}>{fmtDate(item.arriboWh)}</td>}
                    {vis.has('paletizado')&& <td className={`px-2 py-2.5 text-zinc-600 text-[11px] ${firstVisibleBorder(GROUPS[5],'paletizado',vis)}`}>{item.paletizado ?? <span className="text-zinc-200">—</span>}</td>}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 8: Smoke test in browser**

Open http://localhost:3000/panel-general:
1. Default view shows Esenciales columns — CBM/Bulto, Uni/Bulto, DG, Incoterm, Puerto Salida, and all Comex columns should be hidden.
2. Click "⊞ Columnas" → uncheck "ASN" → the ASN column disappears from both header rows and all body rows.
3. Click preset "Comex" → ETD, ETA, ETA Caldas, AWB, Arribo WH, Paletizado columns appear.
4. Click preset "Todos" → all columns visible.
5. Reload the page → column selection persists from localStorage.
6. Dual-SO rows (amber + sky border) should each show their own ∑ PL/SO and Dif.

- [ ] **Step 9: Commit**

```bash
git add app/panel-general/PanelGeneralClient.tsx
git commit -m "feat(panel-v2): column visibility guards, missing Comex columns, Q GSO dual-SO fix"
```

---

### Task 6: Final type-check and deploy

- [ ] **Step 1: Full type check**

```bash
npx tsc --noEmit 2>&1
```

Expected: 0 errors. Fix any that appear before proceeding.

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Deploy to Vercel**

```bash
npx vercel --token "$VERCEL_TOKEN" --prod --yes --scope fran-obrien-s-projects 2>&1 | tail -10
```

Where `VERCEL_TOKEN` is the token from the project `.env` or Vercel dashboard. Expected: `✅ Production: https://panel-comprass.vercel.app`

- [ ] **Step 4: Verify on production**

Open https://panel-comprass.vercel.app/panel-general and repeat the smoke test from Task 5 Step 8.

- [ ] **Step 5: Final commit (if any fixups)**

```bash
git add -p && git commit -m "fix(panel-v2): production build fixups"
```

---

## Self-Review

**Spec coverage check:**
- ✅ §3 Column Selector — Tasks 1, 2, 3 (constants, popover component, state + button)
- ✅ §3 localStorage persistence — Task 3 Step 1 (`applyVisibleCols`)
- ✅ §3 Presets (Esenciales, Todos, Dimensiones, Comex) — Task 2 Step 1
- ✅ §4 Two-row thead with group headers — Task 4
- ✅ §4 Dynamic colSpan via `groupSpan()` — Task 4 Step 1, uses `groupSpan` defined in Task 1
- ✅ §5 Body visibility guards — Task 5 Steps 1–6
- ✅ §6 Dual-SO Q GSO fix — Task 5 Step 3 (inside the PL vs GSO IIFE)
- ✅ §7 border-left on first visible column per group — `firstVisibleBorder()` used throughout
- ✅ §9 No DB changes, no new routes, single file — confirmed

**Placeholder scan:** No TBD/TODO/similar in any step.

**Type consistency:**
- `ColKey` defined in Task 1, used in Tasks 2, 3, 4, 5 — consistent.
- `GROUPS[1]`, `GROUPS[2]`, etc. — 0-indexed array access, matches definition order in Task 1.
- `groupSpan(group, vis)` — signature matches usage in Task 4.
- `firstVisibleBorder(group, col, vis)` — signature matches usage in Tasks 4 and 5.
- `gl(item, 'qPi')` — `gl` is defined in the main component as `getLive(item._displaySO, key, liveData)`, unchanged from current code.
