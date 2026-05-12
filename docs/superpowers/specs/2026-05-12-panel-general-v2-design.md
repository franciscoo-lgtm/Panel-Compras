# Panel General v2 — Design Spec

**Date:** 2026-05-12  
**Status:** Approved  
**Scope:** Single subsystem — Panel General table redesign only. PL Consolidado, Dashboard, and Sources UI are separate specs.

---

## 1. Overview

Rework `PanelGeneralClient.tsx` to add a column selector (localStorage-persisted), a two-row group header in the table, clean defaults that hide low-value columns, and a fix for dual-SO items so each SO independently reads its Q GSO from live data (Google Sheets source), not from the single `item.qPi` DB field.

No new routes, no new DB models, no new server actions. All changes are client-side within `PanelGeneralClient.tsx`.

---

## 2. Column Groups

Columns are organized into six named groups. Each group has a color token used in both the header row and the column selector popover.

| Group | Color | Columns |
|---|---|---|
| Identificación | amber | Tipo, Cargado, Category, ASN, Date |
| Producto | amber | PI No, Caja/Bultos, EAN/Code, Descripción, Qty |
| PL vs GSO | blue | ∑ PL/SO, Q GSO, Dif |
| Dimensiones | zinc | W×L×H, GW kg, CBM, CBM/Bulto, Uni/Bulto, DG |
| Comercial | violet | SO Principal, SO Secund., Drive, Fotos, Incoterm, Puerto Salida |
| Comex/Tracking | cyan | ETD, ETA, ETA Caldas, AWB, Arribo WH, Paletizado |

Extra columns from live data sources are appended after Comex/Tracking.

---

## 3. Column Selector

### State

```typescript
// Canonical column keys — one per hideable column
type ColKey = 'tipo' | 'cargado' | 'category' | 'asn' | 'date'
  | 'piNo' | 'cajaBultos' | 'ean' | 'descripcion' | 'qty'
  | 'plSO' | 'qGso' | 'dif'
  | 'wxlxh' | 'gwKg' | 'cbm' | 'cbmBulto' | 'uniBulto' | 'dg'
  | 'soPrincipal' | 'soSecundario' | 'drive' | 'fotos' | 'incoterm' | 'puertoSalida'
  | 'etd' | 'eta' | 'etaCaldas' | 'awb' | 'arriboWh' | 'paletizado'

const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
  const saved = localStorage.getItem('panel-visible-cols')
  return saved ? new Set(JSON.parse(saved)) : new Set(PRESET_ESENCIALES)
})
```

On every change: `localStorage.setItem('panel-visible-cols', JSON.stringify([...next]))`

### Default preset — Esenciales

Visible by default:
- All Identificación columns
- All Producto columns
- All PL vs GSO columns
- W×L×H, GW kg, CBM (not CBM/Bulto, Uni/Bulto, DG)
- SO Principal, SO Secund., Drive, Fotos (not Incoterm, Puerto Salida)
- None of Comex/Tracking (all hidden by default)

Hidden by default: `cbmBulto`, `uniBulto`, `dg`, `incoterm`, `puertoSalida`, `etd`, `eta`, `etaCaldas`, `awb`, `arriboWh`, `paletizado`

### Presets

| Button | Columns toggled |
|---|---|
| Esenciales | Reset to PRESET_ESENCIALES |
| Todos | Show all columns |
| Dimensiones | Esenciales + cbmBulto + uniBulto |
| Comex | Esenciales + all Comex/Tracking columns |

### UI — Column selector popover

- Trigger button in toolbar: `⊞ Columnas` with a badge showing count of hidden columns.
- Clicking the button opens a popover (absolute-positioned below button, z-50, shadow-xl).
- Popover layout: 480 px wide, two-column grid. Group headers as colored labels spanning both columns.
- Each column entry: checkbox + label. Checkbox accent color matches group color.
- Preset buttons at top of popover (Esenciales active-dark, others zinc).
- Popover closes on outside click (via `useEffect` + ref).

---

## 4. Table Header — Two-Row Layout

Replace the current single-row header with two rows:

**Row 1 — Group headers** (`bg-zinc-50 border-b border-zinc-100/60`):
- Checkbox placeholder cell (w-8)
- Spanned `<th>` cells per group, each with:
  - Group label in 9px uppercase bold, colored per group token
  - `border-left: 2px solid <group-accent-bg>` (e.g., amber: `#fef3c7`, blue: `#dbeafe`)
  - colSpan = count of currently-visible columns in that group
  - Groups with zero visible columns render nothing (skipped entirely)

**Row 2 — Column names** (existing style, `border-b border-zinc-100`):
- Each `<th>` wrapped in `{visibleCols.has(key) && <th ...>}` to conditionally render.
- Same text/spacing/color as today for visible columns.
- Border-left markers repeated from group boundaries.

Implementation note: colSpan values in row 1 must be computed dynamically from `visibleCols` each render. Build a helper `groupSpan(group: ColGroup): number` that counts visible cols in that group.

---

## 5. Table Body — Conditional Cells

Each `<td>` that corresponds to a hideable column is wrapped in a conditional:
```tsx
{visibleCols.has('cbm') && (
  <td ...>{fmtNum(item.cbm, 5)}</td>
)}
```

Columns that are inside `rowSpan` groups (W×L×H, GW kg, CBM, CBM/Bulto) must respect both `skipSet` (rowspan merge logic) AND `visibleCols`. Only render the `<td rowSpan={...}>` when the column is visible AND `!skipSet.has(rowKey)`.

---

## 6. Dual-SO Q GSO Fix

### Current bug

```typescript
const qGso = item.qPi ?? null  // always uses DB field — wrong for secondary SO rows
```

`item.qPi` is a stored DB value imported once for the primary SO. For split rows where `_isPrimary === false`, `item.qPi` is still the primary SO's value, not the secondary SO's quantity.

### Fix

Replace with live-data lookup keyed by `_displaySO`:

```typescript
const rawQGso = gl(item, 'qPi')   // getLive(item._displaySO, 'qPi', liveData)
const qGso = rawQGso != null ? Number(rawQGso) : (item._isPrimary ? item.qPi : null)
```

`getLive` already accepts `item._displaySO` which equals `soSecundario` for secondary rows. If the Google Sheets source has a mapping for `qPi`, each SO will independently resolve its own quantity. If not mapped, fall back to `item.qPi` for primary rows and `null` for secondary.

No schema or server-action changes needed.

---

## 7. Visual Details

### Group border-left in table body
Each cell that opens a new group gets `border-l-2` in the group's accent color:
- PL vs GSO cells: `border-l-2 border-l-blue-100`
- Dimensiones cells: `border-l-2 border-l-zinc-100`
- Comercial cells: `border-l-2 border-l-violet-100`
- Comex cells: `border-l-2 border-l-cyan-100`

Only on the first visible column of each group (skip if first col of group is hidden).

### Dual-SO row visual
Already implemented: amber `border-l-2` for primary, sky `border-l-2` for secondary. No change.

### Column group coloring in header row 2
- PL vs GSO column headers: `text-blue-500`
- Comex column headers (extra cols): `text-violet-500`
- Identificación/Produto: `text-zinc-400` (existing)
- Comercial: `text-violet-500`
- Comex/Tracking: `text-cyan-500`

---

## 8. File Changes

Single file changed: `app/panel-general/PanelGeneralClient.tsx`

Steps:
1. Define `COL_KEYS`, `GROUPS`, `PRESET_*` constants at module level.
2. Add `visibleCols` state with localStorage init/persist.
3. Add `groupSpan` helper.
4. Add `ColumnSelectorPopover` as a local component (or inline JSX).
5. Replace single-row `<thead>` with two-row version.
6. Wrap every hideable `<td>` in visibility guard.
7. Fix `qGso` computation (§6).
8. Add Columns button to toolbar.

No imports added (all logic is vanilla React + existing helpers).

---

## 9. Out of Scope

- PL Consolidado multi-ASN export → separate spec
- Dashboard KPIs → separate spec
- Sources UI → separate spec
- Any DB schema changes
- Any new API routes
