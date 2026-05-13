# CIPL Multi-ASN Export + Photo Matching Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Export an Excel idéntico al HYS2604135F5T.xlsx consolidando los CIPLItems de los ASNs seleccionados en Panel General. (2) Deploy del fix de matching de fotos ya implementado en actions.ts.

**Architecture:** La generación del Excel vive en `lib/exportCipl.ts` (función pura, sin DB). Un server action en `app/panel-general/actions.ts` consulta la DB y llama a esa función, devolviendo base64. El cliente descarga directamente desde el base64. El Panel General reutiliza el `selected` Set<string> ya existente para elegir qué items exportar.

**Tech Stack:** Next.js 16 App Router, `xlsx` 0.18.5 (SheetJS, ya instalado), Prisma 7, TypeScript, React 18.

---

## Contexto crítico del codebase

### Modelo CIPLItem (prisma/schema.prisma)
Campos usados en el export:
```
asn, piNo, caseNo, qBultos, qty, codeEan, description,
w, l, h, cbm, gwKg, cbmXBulto, uniXBulto, isDangerousGood,
soPrincipal, soSecundario, linkMsds, sku, pa, modelo, qPi,
incoterm, puertoSalida, fobUnit, fobTotal,
driveLinkExcel, driveLinkCi, driveLinkPl,
categoryName, tipoCarga, date
```

### Estructura del Excel de referencia (HYS2604135F5T.xlsx)
- Sheet: `"PL Consolidado Mercaderia"`
- 28 columnas (A–AB), 2 filas de header + N filas de datos + 1 fila Total
- **Colores header (fila 0):** A=ROJO(`FF0000`), J+K+Z+AA=VERDE(`00FF00`), resto=AMARILLO(`FFFF00`)
- **Sub-header (fila 1):** Solo R="W", S="L", T="H" (sub-columnas de Dimension)
- **Merges en header:** Columnas A–N (excepto R–T) y P–AB se mergean filas 0+1. R–T se mergea horizontalmente (R1:T1 = "Dimension (cm)").
- **Merges en total row:** A–J = "Total", K–P = suma qty, R–U = suma CBM, W–AB = vacío

### Mapeo columna → campo CIPLItem
```
A  = isDangerousGood ? "X" : ""     (DG, ROJO)
B  = box_number (incremental por caseNo único dentro del export)
C  = categoryName                    (Supplier)
D  = ""                              (FACTORY ADDRESS — no disponible)
E  = ""                              (Contact Name)
F  = ""                              (Phone Number)
G  = ""                              (e-mail)
H  = piNo                            (Order Number)
I  = incoterm                        (INCOTERM)
J  = caseNo                          (PALLET/Container No, VERDE)
K  = soPrincipal                     (SO-NUMBER, VERDE)
L  = sku                             (Bidcom Internal Code)
M  = qBultos                         (CTNS)
N  = description                     (DESCRIPTION)
O  = uniXBulto                       (Quantity Per Carton)
P  = qty                             (TOTAL)
Q  = gwKg / (qBultos || 1)           (Weight/CTN kg/CTN)
R  = w                               (Dimension W)
S  = l                               (Dimension L)
T  = h                               (Dimension H)
U  = cbm                             (TOTAL CBM M3)
V  = gwKg                            (TOTAL WEIGHT kg)
W  = cbmXBulto                       (M3 por Bulto)
X  = gwKg / (qBultos || 1)           (Kg* Bulto Deposito — mismo cálculo que Q)
Y  = driveLinkPl ?? driveLinkExcel   (PL Original)
Z  = ""                              (Comments, VERDE)
AA = ""                              (Fecha Prioritaria, VERDE)
AB = pa                              (PA)
```

### Totals row
```
A–J (merged): "Total"
K–P (merged): SUM(qty)
Q:            SUM(gwKg / qBultos)
R–U (merged): SUM(cbm)
V:            SUM(gwKg)
W–AB (merged): ""
```

### PanelGeneralClient.tsx — estado relevante
- `selected: Set<string>` — IDs de CIPLItem seleccionados (línea 698)
- `toggleSelect`, `toggleSelectAll` — ya implementados (líneas 744–753)
- Export button existente en línea ~862 — hay que agregar botón "Export CIPL" al lado
- `exportRows` — items filtrados ya calculado (línea 792)

---

## Archivos a crear/modificar

| Archivo | Acción | Responsabilidad |
|---------|--------|----------------|
| `lib/exportCipl.ts` | CREAR | Función pura: recibe CIPLItem[], devuelve Buffer Excel |
| `app/panel-general/actions.ts` | MODIFICAR | Agregar server action `exportCiplAction(itemIds)` |
| `app/panel-general/PanelGeneralClient.tsx` | MODIFICAR | Botón "Export CIPL" en toolbar |
| `app/inspeccion/actions.ts` | YA MODIFICADO | Fix matching fotos — solo commit+deploy |

---

## Task 1: Commit y deploy del fix de fotos

**Files:**
- Modify: `app/inspeccion/actions.ts` (ya modificado)

- [ ] **Step 1: Verificar que el fix está en el working tree**

```bash
git diff app/inspeccion/actions.ts | head -50
```

Expected: muestra los cambios al `batchMatchToBox` (exact match primero, sin fallback).

- [ ] **Step 2: Commit**

```bash
git add app/inspeccion/actions.ts
git commit -m "fix(inspeccion): exact carton number matching, remove wrong-box fallback

Previous code silently assigned all unmatched rows to the first available
box in the ASN. Now: exact numeric match → prefix match → unique ends-with.
If no confident match, leaves row unassigned (user picks manually)."
```

- [ ] **Step 3: Deploy a Vercel**

```bash
vercel --prod --token "$VERCEL_TOKEN"
```

Expected: `Production: https://panel-comprass.vercel.app` y status READY.

---

## Task 2: Función pura de generación Excel (`lib/exportCipl.ts`)

**Files:**
- Create: `lib/exportCipl.ts`

- [ ] **Step 1: Crear el archivo con tipos e imports**

```typescript
// lib/exportCipl.ts
import * as XLSX from 'xlsx'

export type ExportItem = {
  isDangerousGood: boolean
  categoryName:    string | null
  piNo:            string | null
  caseNo:          string | null
  qBultos:         number | null
  qty:             number | null
  description:     string | null
  w:               number | null
  l:               number | null
  h:               number | null
  cbm:             number | null
  gwKg:            number | null
  cbmXBulto:       number | null
  uniXBulto:       number | null
  soPrincipal:     string | null
  sku:             string | null
  pa:              string | null
  incoterm:        string | null
  driveLinkPl:     string | null
  driveLinkExcel:  string | null
}
```

- [ ] **Step 2: Constantes de estilo y columnas**

Agregar a `lib/exportCipl.ts` después de los tipos:

```typescript
const RED    = { patternType: 'solid' as const, fgColor: { rgb: 'FFFF0000' }, bgColor: { rgb: 'FFFF0000' } }
const YELLOW = { patternType: 'solid' as const, fgColor: { rgb: 'FFFFFF00' }, bgColor: { rgb: 'FFFFFF00' } }
const GREEN  = { patternType: 'solid' as const, fgColor: { rgb: 'FF00FF00' }, bgColor: { rgb: 'FF00FF00' } }

const BOLD_FONT = { bold: true, sz: 10 }

// Header row 0: [label, color]
const HEADERS: [string, typeof RED][] = [
  ['Dangerous Goods', RED],
  ['Item',            YELLOW],
  ['Supplier',        YELLOW],
  ['FACTORY ADDRESS', YELLOW],
  ['Contact Name',    YELLOW],
  ['Phone Number',    YELLOW],
  ['e-mail',          YELLOW],
  ['Order Number',    YELLOW],
  ['INCOTERM',        YELLOW],
  ['PALLET or Container Number', GREEN],
  ['SO-NUMBER',       GREEN],
  ['Bidcom Internal Code', YELLOW],
  ['CTNS',            YELLOW],
  ['DESCRIPTION',     YELLOW],
  ['Quantity Per Carton', YELLOW],
  ['TOTAL',           YELLOW],
  ['Weight/CTN (kg/CTN)', YELLOW],
  ['Dimension (cm)',  YELLOW], // R — spans R:T in header
  ['',                YELLOW], // S (sub: L)
  ['',                YELLOW], // T (sub: H)
  ['TOTAL CBM (M3)',  YELLOW],
  ['TOTAL WEIGHT (kg)', YELLOW],
  ['M3 por Bulto',    YELLOW],
  ['Kg* Bulto Deposito', YELLOW],
  ['PL Original',     YELLOW],
  ['Comments',        GREEN],
  ['Fecha Prioritaria', GREEN],
  ['PA',              YELLOW],
]
```

- [ ] **Step 3: Función principal `buildCiplWorkbook`**

Agregar a `lib/exportCipl.ts`:

```typescript
export function buildCiplWorkbook(items: ExportItem[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const ws: XLSX.WorkSheet = {}

  const nc = HEADERS.length // 28

  // ── Helper: make a styled cell ──────────────────────────────────────────────
  function sc(v: XLSX.CellObject['v'], t: XLSX.CellObject['t'], s?: object): XLSX.CellObject {
    return { v, t, s } as XLSX.CellObject
  }
  function text(v: string | null | undefined, fill?: object): XLSX.CellObject {
    return sc(v ?? '', 's', fill ? { fill, font: BOLD_FONT } : undefined)
  }
  function num(v: number | null | undefined, fill?: object): XLSX.CellObject {
    return sc(v ?? 0, 'n', fill ? { fill, font: BOLD_FONT } : undefined)
  }

  // ── Row 0: main headers ──────────────────────────────────────────────────────
  HEADERS.forEach(([label, fill], c) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    ws[addr] = { v: label, t: 's', s: { fill, font: { ...BOLD_FONT, color: { rgb: 'FF000000' } }, alignment: { horizontal: 'center', wrapText: true } } }
  })

  // ── Row 1: sub-headers (W, L, H only) ───────────────────────────────────────
  for (let c = 0; c < nc; c++) {
    const addr = XLSX.utils.encode_cell({ r: 1, c })
    const label = c === 17 ? 'W' : c === 18 ? 'L' : c === 19 ? 'H' : ''
    ws[addr] = { v: label, t: 's', s: { fill: YELLOW, font: BOLD_FONT, alignment: { horizontal: 'center' } } }
  }

  // ── Data rows ────────────────────────────────────────────────────────────────
  // Group by unique caseNo for box numbering
  const boxNums = new Map<string, number>()
  let boxCounter = 0
  items.forEach(item => {
    const key = item.caseNo ?? `__no_case_${boxCounter}`
    if (!boxNums.has(key)) boxNums.set(key, ++boxCounter)
  })

  let sumQty = 0, sumCbm = 0, sumGw = 0, sumWtctn = 0

  items.forEach((item, i) => {
    const r = i + 2 // data starts at row index 2
    const boxNum = boxNums.get(item.caseNo ?? `__no_case_${i}`) ?? i + 1
    const wtPerCtn = item.gwKg != null && item.qBultos ? item.gwKg / item.qBultos : (item.gwKg ?? 0)

    sumQty   += item.qty     ?? 0
    sumCbm   += item.cbm     ?? 0
    sumGw    += item.gwKg    ?? 0
    sumWtctn += wtPerCtn

    const row: XLSX.CellObject[] = [
      text(item.isDangerousGood ? 'X' : ''),  // A DG
      sc(boxNum, 'n'),                          // B Item
      text(item.categoryName),                  // C Supplier
      text(''),                                 // D Factory
      text(''),                                 // E Contact
      text(''),                                 // F Phone
      text(''),                                 // G Email
      text(item.piNo),                          // H Order No
      text(item.incoterm),                      // I Incoterm
      text(item.caseNo),                        // J Container No
      text(item.soPrincipal),                   // K SO
      text(item.sku),                           // L Internal Code
      sc(item.qBultos ?? '', item.qBultos != null ? 'n' : 's'), // M CTNS
      text(item.description),                   // N Description
      sc(item.uniXBulto ?? '', item.uniXBulto != null ? 'n' : 's'), // O Qty/CTN
      sc(item.qty ?? '', item.qty != null ? 'n' : 's'),              // P TOTAL
      sc(+wtPerCtn.toFixed(4), 'n'),            // Q Weight/CTN
      sc(item.w ?? '', item.w != null ? 'n' : 's'),   // R W
      sc(item.l ?? '', item.l != null ? 'n' : 's'),   // S L
      sc(item.h ?? '', item.h != null ? 'n' : 's'),   // T H
      sc(item.cbm ?? '', item.cbm != null ? 'n' : 's'),     // U CBM
      sc(item.gwKg ?? '', item.gwKg != null ? 'n' : 's'),   // V GW total
      sc(item.cbmXBulto ?? '', item.cbmXBulto != null ? 'n' : 's'), // W M3/Bulto
      sc(+wtPerCtn.toFixed(4), 'n'),            // X Kg/Bulto Deposito
      text(item.driveLinkPl ?? item.driveLinkExcel), // Y PL Original
      text(''),                                 // Z Comments
      text(''),                                 // AA Fecha
      text(item.pa),                            // AB PA
    ]

    row.forEach((cell, c) => {
      ws[XLSX.utils.encode_cell({ r, c })] = cell
    })
  })

  // ── Total row ─────────────────────────────────────────────────────────────────
  const totalRow = items.length + 2
  for (let c = 0; c < nc; c++) {
    ws[XLSX.utils.encode_cell({ r: totalRow, c })] = { v: '', t: 's', s: { fill: YELLOW, font: BOLD_FONT } }
  }
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 0 })]  = { v: 'Total', t: 's', s: { fill: YELLOW, font: BOLD_FONT } }
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 10 })] = { v: +sumQty.toFixed(0), t: 'n', s: { fill: YELLOW, font: BOLD_FONT } }
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 16 })] = { v: +sumWtctn.toFixed(4), t: 'n', s: { fill: YELLOW, font: BOLD_FONT } }
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 17 })] = { v: +sumCbm.toFixed(5), t: 'n', s: { fill: YELLOW, font: BOLD_FONT } }
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 21 })] = { v: +sumGw.toFixed(3), t: 'n', s: { fill: YELLOW, font: BOLD_FONT } }

  // ── Merges ───────────────────────────────────────────────────────────────────
  const merges: XLSX.Range[] = []

  // Header merges: each col merges rows 0+1 (except R–T which merge horizontally)
  const singleColMerge = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,20,21,22,23,24,25,26,27]
  singleColMerge.forEach(c => merges.push({ s: { r: 0, c }, e: { r: 1, c } }))
  merges.push({ s: { r: 0, c: 17 }, e: { r: 0, c: 19 } }) // R:T horizontal merge "Dimension (cm)"

  // Total row merges
  merges.push({ s: { r: totalRow, c: 0  }, e: { r: totalRow, c: 9  } }) // A–J: "Total"
  merges.push({ s: { r: totalRow, c: 10 }, e: { r: totalRow, c: 15 } }) // K–P: sum qty
  merges.push({ s: { r: totalRow, c: 17 }, e: { r: totalRow, c: 20 } }) // R–U: sum CBM
  merges.push({ s: { r: totalRow, c: 22 }, e: { r: totalRow, c: 27 } }) // W–AB: empty

  ws['!merges'] = merges

  // ── Sheet range ──────────────────────────────────────────────────────────────
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRow, c: nc - 1 } })

  // ── Column widths (approximate from reference) ────────────────────────────────
  ws['!cols'] = [
    { wch: 18 },  // A DG
    { wch: 6  },  // B Item
    { wch: 26 },  // C Supplier
    { wch: 50 },  // D Factory
    { wch: 14 },  // E Contact
    { wch: 14 },  // F Phone
    { wch: 22 },  // G Email
    { wch: 18 },  // H Order No
    { wch: 12 },  // I Incoterm
    { wch: 26 },  // J Container
    { wch: 14 },  // K SO
    { wch: 16 },  // L Internal
    { wch: 8  },  // M CTNS
    { wch: 50 },  // N Description
    { wch: 10 },  // O Qty/CTN
    { wch: 10 },  // P TOTAL
    { wch: 14 },  // Q Wt/CTN
    { wch: 8  },  // R W
    { wch: 8  },  // S L
    { wch: 8  },  // T H
    { wch: 14 },  // U CBM
    { wch: 16 },  // V GW
    { wch: 12 },  // W M3/Bulto
    { wch: 14 },  // X Kg/Bulto
    { wch: 40 },  // Y PL Link
    { wch: 14 },  // Z Comments
    { wch: 14 },  // AA Fecha
    { wch: 18 },  // AB PA
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'PL Consolidado Mercaderia')
  return wb
}

export function workbookToBase64(wb: XLSX.WorkBook): string {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true })
  return Buffer.from(buf).toString('base64')
}
```

- [ ] **Step 4: Verificar que el módulo compila**

```bash
cd /workspaces/Panel-Compras && npx tsc --noEmit 2>&1 | grep exportCipl
```

Expected: sin errores relacionados a `exportCipl.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/exportCipl.ts
git commit -m "feat(export): pure function for CIPL Excel generation matching HYS reference format"
```

---

## Task 3: Server action `exportCiplAction`

**Files:**
- Modify: `app/panel-general/actions.ts` (agregar al final)

- [ ] **Step 1: Agregar el import y la action al final de `app/panel-general/actions.ts`**

Primero leer las últimas líneas del archivo para saber dónde insertar:
```bash
tail -20 /workspaces/Panel-Compras/app/panel-general/actions.ts
```

Luego agregar al final del archivo:

```typescript
// ─── CIPL Export ──────────────────────────────────────────────────────────────

import { buildCiplWorkbook, workbookToBase64, type ExportItem } from '@/lib/exportCipl'

export type CiplExportResult =
  | { ok: true;  base64: string; filename: string }
  | { ok: false; error: string }

export async function exportCiplAction(itemIds: string[]): Promise<CiplExportResult> {
  try {
    if (!itemIds.length) return { ok: false, error: 'No items selected' }

    const rows = await prisma.cIPLItem.findMany({
      where: { id: { in: itemIds } },
      select: {
        isDangerousGood: true,
        categoryName:    true,
        piNo:            true,
        caseNo:          true,
        qBultos:         true,
        qty:             true,
        description:     true,
        w:               true,
        l:               true,
        h:               true,
        cbm:             true,
        gwKg:            true,
        cbmXBulto:       true,
        uniXBulto:       true,
        soPrincipal:     true,
        sku:             true,
        pa:              true,
        incoterm:        true,
        driveLinkPl:     true,
        driveLinkExcel:  true,
        asn:             true,
        codeEan:         true,
      },
      orderBy: [{ asn: 'asc' }, { caseNo: 'asc' }],
    })

    if (!rows.length) return { ok: false, error: 'No data found for selected items' }

    const items: ExportItem[] = rows.map(r => ({
      isDangerousGood: r.isDangerousGood,
      categoryName:    r.categoryName,
      piNo:            r.piNo,
      caseNo:          r.caseNo,
      qBultos:         r.qBultos,
      qty:             r.qty,
      description:     r.description,
      w:               r.w,
      l:               r.l,
      h:               r.h,
      cbm:             r.cbm,
      gwKg:            r.gwKg,
      cbmXBulto:       r.cbmXBulto,
      uniXBulto:       r.uniXBulto,
      soPrincipal:     r.soPrincipal,
      sku:             r.sku,
      pa:              r.pa,
      incoterm:        r.incoterm,
      driveLinkPl:     r.driveLinkPl,
      driveLinkExcel:  r.driveLinkExcel,
    }))

    const wb       = buildCiplWorkbook(items)
    const base64   = workbookToBase64(wb)
    const asns     = [...new Set(rows.map(r => r.asn).filter(Boolean))].join('_')
    const filename = `CIPL_${asns}_${new Date().toISOString().slice(0, 10)}.xlsx`

    return { ok: true, base64, filename }
  } catch (err) {
    console.error('[exportCiplAction]', err)
    return { ok: false, error: String(err) }
  }
}
```

- [ ] **Step 2: Verificar que `prisma` ya está importado en ese archivo**

```bash
head -5 /workspaces/Panel-Compras/app/panel-general/actions.ts
```

Expected: ver `import { prisma } from '@/lib/prisma'`. Si no está, agregarlo al inicio del archivo.

- [ ] **Step 3: Build check**

```bash
cd /workspaces/Panel-Compras && npm run build 2>&1 | grep -E "error|Error|exportCipl" | head -20
```

Expected: sin errores. Si hay error de tipo, corregirlo antes de continuar.

- [ ] **Step 4: Commit**

```bash
git add app/panel-general/actions.ts
git commit -m "feat(export): add exportCiplAction server action for multi-ASN CIPL export"
```

---

## Task 4: Botón "Export CIPL" en PanelGeneralClient

**Files:**
- Modify: `app/panel-general/PanelGeneralClient.tsx`

- [ ] **Step 1: Agregar import de `exportCiplAction`**

En `app/panel-general/PanelGeneralClient.tsx`, en las líneas de imports de actions (línea ~6), agregar `exportCiplAction` y `CiplExportResult`:

```typescript
import { updateCIPLItem, deleteCIPLItem, getItemPhotos, suggestSOForItem, addPhotosToBox, deletePhoto, exportCiplAction } from './actions'
```

- [ ] **Step 2: Agregar estado de exportación**

Cerca de los otros estados (alrededor de línea 698), agregar:

```typescript
const [exportingCipl, setExportingCipl] = useState(false)
```

- [ ] **Step 3: Agregar la función `handleExportCipl`**

Después de `handleSave` o del último handler, agregar:

```typescript
async function handleExportCipl() {
  if (!selected.size) return
  setExportingCipl(true)
  try {
    // Get the actual item IDs (deduplicated — for split rows, selected has the primary item ID)
    const ids = [...selected]
    const res = await exportCiplAction(ids)
    if (!res.ok) { alert(`Error al exportar: ${res.error}`); return }

    // Trigger download from base64
    const blob = new Blob(
      [Uint8Array.from(atob(res.base64), c => c.charCodeAt(0))],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    )
    const url = URL.createObjectURL(blob)
    const a   = document.createElement('a')
    a.href     = url
    a.download = res.filename
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    alert(`Error inesperado: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    setExportingCipl(false)
  }
}
```

- [ ] **Step 4: Agregar el botón en el toolbar**

Buscar el bloque del botón "Exportar Excel" existente (alrededor de línea 855–865). Agregar el botón "Export CIPL" justo antes o después:

```tsx
{selected.size > 0 && (
  <button
    onClick={handleExportCipl}
    disabled={exportingCipl}
    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
  >
    {exportingCipl
      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
      : <FileDown className="w-3.5 h-3.5" />}
    {exportingCipl ? 'Exportando…' : `CIPL (${selected.size})`}
  </button>
)}
```

Asegurarse de importar `FileDown` de `lucide-react` en la línea de imports de íconos.

- [ ] **Step 5: Agregar `FileDown` al import de lucide-react**

Buscar la línea de import de lucide-react y agregar `FileDown`:

```typescript
import { ..., FileDown } from 'lucide-react'
```

- [ ] **Step 6: Build y verificar sin errores**

```bash
cd /workspaces/Panel-Compras && npm run build 2>&1 | tail -30
```

Expected: build limpio, sin errores de TypeScript.

- [ ] **Step 7: Test manual en dev server**

```bash
npm run dev &
```

1. Abrir http://localhost:3000/panel-general
2. Seleccionar 2–3 items con checkboxes
3. Verificar que aparece botón "CIPL (N)"
4. Click → debe descargar un `.xlsx`
5. Abrir el archivo en Excel/Sheets — verificar estructura y colores

- [ ] **Step 8: Commit**

```bash
git add app/panel-general/PanelGeneralClient.tsx
git commit -m "feat(export): add Export CIPL button to Panel General toolbar

Seleccionando items con checkboxes existentes y haciendo click en
'CIPL (N)' se descarga un Excel idéntico al formato HYS2604135F5T
con colores, 2-row header, merges y fila de totales."
```

---

## Task 5: Deploy final

- [ ] **Step 1: Deploy a Vercel**

```bash
vercel --prod --token "$VERCEL_TOKEN"
```

Expected: `Aliased: https://panel-comprass.vercel.app` y status READY.

- [ ] **Step 2: Smoke test en producción**

1. Abrir https://panel-comprass.vercel.app/panel-general
2. Seleccionar items → botón "CIPL (N)" visible
3. Click → Excel descargado con formato correcto

---

## Self-review checklist

- [x] **Spec coverage:** Export CIPL ✓, colores exactos ✓, 2-row header ✓, totales ✓, merges ✓, multi-ASN ✓, selección desde Panel General ✓, fix fotos ✓, deploy ✓
- [x] **Sin placeholders:** todo el código es completo y ejecutable
- [x] **Consistencia de tipos:** `ExportItem` definido en Task 2, usado en Task 3 con import correcto
- [x] **xlsx cellStyles:** `XLSX.write(..., { cellStyles: true })` requerido para que los colores se preserven — incluido en `workbookToBase64`
