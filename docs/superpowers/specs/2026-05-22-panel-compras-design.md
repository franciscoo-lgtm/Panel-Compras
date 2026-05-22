# Panel de Compras — Design Spec

**Goal:** A procurement management hub that tracks the full purchase lifecycle — from order creation through GSO V4, through PL upload, through customs — with KPI dashboards, automatic Comex source sync, and a PL Consolidado Excel export for the Comex team.

**Architecture:** New `/compras` module with two DB models (`Compra`, `CompraSOItem`). All logistics milestone dates come exclusively from Comex external sources via the existing `fetchAllSourcesData()` architecture — no date fields for these on the DB. Manual milestone dates (payment, PA validation, etc.) live on `Compra`. Auto-link connects CIPLItems to Compras by SO match on save.

**Tech Stack:** Next.js App Router, Prisma (PostgreSQL), Comex sources live fetch, XLSX export, existing GSO V4 `buildGSOMap()` for SO lookup.

---

## 1. Data Model

### 1.1 New model: `Compra`

```prisma
model Compra {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  userId    String?
  user      User?    @relation(fields: [userId], references: [id])

  piNo  String?   // PI number — assigned at GSO entry, known at creation
  notas String?

  // Supplier info — manual, can vary per order
  supplierName         String?
  supplierAddress      String?
  supplierContactName  String?
  supplierContactPhone String?
  supplierContactEmail String?

  // Manual milestone dates (vos los marcás)
  fechaOrden          DateTime  @default(now())
  fechaEnvio          DateTime?  // Enviada al proveedor
  fechaPago           DateTime?  // Pagada
  fechaSegundaValPA   DateTime?  // 2da Validación PA (null = no aplica o pendiente)
  fechaInstruccionCat DateTime?  // Instrucción enviada Category
  fechaLMS            DateTime?  // LMS — salida del WH DJI

  // Logistics milestones come exclusively from Comex sources (liveData)
  // Never stored in DB — read live via fetchAllSourcesData() keyed by SO

  sos  CompraSOItem[]
}
```

### 1.2 New model: `CompraSOItem`

```prisma
model CompraSOItem {
  id       String @id @default(cuid())
  compraId String
  compra   Compra @relation(fields: [compraId], references: [id], onDelete: Cascade)

  soNumber String  // "SO-09412" — join key for Comex sources and CIPLItems

  // Snapshot from GSO V4 at creation time (static, not refreshed)
  modelo   String?
  sku      String?   // Bidcom Internal Code
  qPi      Int?      // qty ordered
  fobUnit  Float?
  fobTotal Float?
  incoterm String?
  pa       String?   // posición arancelaria

  @@index([soNumber])
}
```

### 1.3 Modified model: `CIPLItem`

Add one field:
```prisma
compraId String?   // set by auto-link when CIPLItem SO matches a CompraSOItem
compra   Compra?   @relation(fields: [compraId], references: [id])
```

No new date fields — all Comex milestone dates read from `liveData` at runtime.

### 1.4 New `AppConfig` entries (seeded, not hardcoded)

Key: `COMPRA_COMEX_FIELDS`  
Value: JSON array defining which `fieldKey` values are "known Compra milestones":

```json
[
  { "fieldKey": "embarqueNo",          "label": "N° Embarque",      "type": "string" },
  { "fieldKey": "arriboWh",            "label": "Arribo WH Airsea", "type": "date"   },
  { "fieldKey": "etd",                 "label": "ETD",              "type": "date"   },
  { "fieldKey": "eta",                 "label": "ETA",              "type": "date"   },
  { "fieldKey": "fechaArriboAduana",   "label": "Arribo Aduana",    "type": "date"   },
  { "fieldKey": "fechaArriboDeposito", "label": "Arribo Depósito",  "type": "date"   }
]
```

These are just known `fieldKey` strings the system recognises. They're populated by the user mapping a Comex source column to one of these keys in `/operaciones`. Nothing hardcoded in code.

---

## 2. Comex Sources Integration

### How it works today
`fetchAllSourcesData(sources)` reads all enabled Google Sheets, joins by SO number (isJoin column), and returns `liveData: Record<SO_upper, Record<fieldKey, string>>`.

Each `ColumnMapping` in a source has a `fieldKey`. Today these are `extra_*` or known CIPLItem field names.

### What changes
The six new fieldKeys (`embarqueNo`, `arriboWh`, `etd`, `eta`, `fechaArriboAduana`, `fechaArriboDeposito`) are simply added as valid `fieldKey` values — no code changes to the sources engine. The user maps a Comex sheet column to `fieldKey: "fechaArriboAduana"` in `/operaciones`, and the engine populates it.

**No new code in comex-sources.ts is required.** The existing engine handles it.

### Display in Compra
On the Compra detail page, the server:
1. Fetches `compra` with `sos` (CompraSOItems)
2. Calls `fetchAllSourcesData(sources)` to get `liveData`
3. For each SO in `compra.sos`, reads `liveData[SO.toUpperCase()]`
4. Extracts milestone values and renders the timeline

### Extensibility
Adding a new Comex milestone in the future = zero code changes:
1. User goes to `/operaciones` → adds a new column mapping with the desired `fieldKey`
2. Optionally add the `fieldKey` to `COMPRA_COMEX_FIELDS` AppConfig (can be done in UI)
3. Compra detail reads it automatically from `liveData`

---

## 3. Routes & Pages

### 3.1 `/compras` — List + KPI Dashboard

**Server component.** Fetches:
- All Compras with their `sos` (CompraSOItems)
- CIPLItem count + qty received per SO (via aggregate query)
- `fetchAllSourcesData()` for embarqueNo + milestone dates

**KPI Section (top):**
```
┌─────────────────┬─────────────────┬──────────────────┬────────────────────┐
│  Compras activas│ FOB en tránsito │ Unidades pedidas │  Tiempo promedio   │
│       7         │  USD 184.200    │   1.240 un.      │  42 días ord→dep.  │
└─────────────────┴─────────────────┴──────────────────┴────────────────────┘
┌─────────────────┬─────────────────┬──────────────────┬────────────────────┐
│ Esperando PL    │  PLs recibidos  │  Completadas     │  Alertas           │
│     4 compras   │   esta semana 3 │   mes actual 5   │  2 sin PL +30 días │
└─────────────────┴─────────────────┴──────────────────┴────────────────────┘
```

**KPI definitions:**
- `Compras activas`: Compras where status ≠ Completada
- `FOB en tránsito`: sum of `CompraSOItem.fobTotal` for active Compras
- `Unidades pedidas`: sum `qPi` − sum `qty recibida` (CIPLItems) for active Compras
- `Tiempo promedio`: avg days from `fechaOrden` → `fechaArriboDeposito` (liveData) for completed in last 90 days
- `Esperando PL`: Compras with `fechaPago` set and zero linked CIPLItems
- `Alertas`: Compras with `fechaPago` set, no PL, and `fechaPago` > 30 days ago

**Table columns:** ID / Fecha · SOs (models) · Estado badge · Progreso unidades (bar) · PLs recibidos · FOB Total · →

**Tabs:** Todas · En proceso · Esperando PL · Completadas

### 3.2 `/compras/nueva` — Create Compra

**Client component.** Two-column layout:

Left — Step 1: SO selector
- Search input queries `buildGSOMap()` (server action) filtered by term
- Results show: SO number chip · modelo · SKU · qty · FOB unit
- Multi-select with checkboxes
- Selected SOs shown as removable chips below

Left — Step 2: Compra data
- piNo (text, required)
- notas (textarea)
- Supplier block: name, address, contact name, phone, email (all optional, all manual)

Right — Live summary (sticky):
- List of selected SOs with model + qty
- Total unidades ordered
- Total FOB
- "Crear Orden de Compra" CTA

On submit → server action `crearCompra(formData)`:
- Creates `Compra` record
- Creates one `CompraSOItem` per selected SO (with GSO snapshot)
- Redirects to `/compras/[id]`

### 3.3 `/compras/[id]` — Compra Detail

**Server component.** Fetches Compra + sos + linked CIPLItems + liveData.

**Header:**
- OC-ID, piNo, supplier name
- Status badge (derived from milestones)
- Action buttons: "Editar" → drawer, "Marcar siguiente hito" → next manual milestone modal

**Status derivation** (in order, first truthy wins):
```
fechaArriboDeposito (liveData) → Completada (auto)
fechaArriboAduana (liveData)   → En Aduana
fechaETA (liveData)            → En tránsito
fechaETD (liveData)            → Embarcado
fechaArriboWH (liveData)       → En WH Airsea
fechaLMS                       → LMS
fechaInstruccionCat            → Instrucción Category
PL linked (CIPLItems exist)    → PL Cargado
fechaSegundaValPA              → PA Validada
fechaPago                      → Pagada
fechaEnvio                     → Enviada
default                        → Borrador
```

**Timeline component** (horizontal, scrollable):
Each milestone is a circle with icon, label, date (or "pendiente"), and source tag (manual/auto).

```
Borrador → Enviada → Pagada → PA Validada → Esperando PL
→ PL Cargado → Instr. Category → LMS
→ Arribo WH → ETD → ETA → Arribo Aduana → Arribo Depósito → ✓
```

Manual milestones: clickable → date picker modal to mark the date.
Auto milestones: shows date from liveData (or "–" if not yet configured/available).

**KPI strip** (4 numbers):
- Pedido total · Recibido · En proceso · % completado

**SOs section:**
One card per CompraSOItem:
- Header: SO chip · modelo · SKU · `qty recibida / qPi` · progress bar
- Expanded body: list of linked CIPLItems grouped by ASN (embarque)
  - Each ASN row: ASN code · fecha · qty · status badge from Comex · link → Panel General
  - "Pendiente: X unidades" row if qty gap exists

**Export Consolidado button:**
- Appears if `embarqueNo` is available (from liveData)
- If multiple embarques: dropdown to select
- Downloads `.xlsx` matching PL Consolidado format

### 3.4 `/comex` — Redesign

Keep existing timeline view. Add a **Consolidado** tab.

**Consolidado tab:**
- Dropdown: select N° Embarque (populated from liveData across all CompraSOItems)
- Table preview: same columns as PL Consolidado Excel
- Button: "Descargar Excel"
- Shows supplier info pulled from the linked Compra

### 3.5 `/operaciones` — Comex Sources (extended)

Add section below existing sources config:

**"Mapeo de Hitos de Compra":**
Table with one row per known Compra milestone field:
```
Hito                   | fieldKey              | Estado
Arribo WH Airsea       | arriboWh              | ✓ Mapeado (Fuente: Tracking Sheet, col "Arribo")
ETD                    | etd                   | ⏳ Sin mapear — configurar en fuente Comex
ETA                    | eta                   | ⏳ Sin mapear
N° Embarque            | embarqueNo            | ⏳ Sin mapear
Arribo Aduana          | fechaArriboAduana     | ⏳ Sin mapear
Arribo Depósito        | fechaArriboDeposito   | ⏳ Sin mapear
```

Each row links to the source editor where the `fieldKey` can be assigned to a column.

---

## 4. PL Consolidado Excel Export

### Column mapping (A → AB)

| Col | Header | Source |
|-----|--------|--------|
| A | Dangerous Goods | `CIPLItem.isDangerousGood` → "YES"/"" |
| B | Item | row index (1-based) |
| C | Supplier | `Compra.supplierName` |
| D | FACTORY ADDRESS | `Compra.supplierAddress` |
| E | Contact Name | `Compra.supplierContactName` |
| F | Phone Number | `Compra.supplierContactPhone` |
| G | e-mail | `Compra.supplierContactEmail` |
| H | Order Number | `CIPLItem.asn` or `CIPLItem.piNo` |
| I | INCOTERM | `CompraSOItem.incoterm` |
| J | PALLET or Container Number | `CIPLItem.caseNo` |
| K | SO-NUMBER | `CIPLItem.soPrincipal` |
| L | Bidcom Internal Code | `CompraSOItem.sku` |
| M | CTNS | `CIPLItem.qBultos` |
| N | DESCRIPTION | `CIPLItem.description` |
| O | Quantity Per Carton | `CIPLItem.uniXBulto` |
| P | TOTAL | `CIPLItem.qty` |
| Q | Weight/CTN (kg/CTN) | `CIPLItem.gwKg` |
| R | W (cm) | `CIPLItem.w` |
| S | L (cm) | `CIPLItem.l` |
| T | H (cm) | `CIPLItem.h` |
| U | TOTAL CBM (M3) | `CIPLItem.cbm` |
| V | TOTAL WEIGHT (kg) | `CIPLItem.gwKg * CIPLItem.qBultos` |
| W | M3 por Bulto | `CIPLItem.cbmXBulto` |
| X | Kg* Bulto Deposito | `CIPLItem.gwKg` |
| Y | PL Original | `CIPLItem.driveLinkPl` or `driveLinkExcel` |
| Z | Comments | blank (future use) |
| AA | Fecha Prioritaria | blank (ignored per design) |
| AB | PA | `CompraSOItem.pa` |

**Total row:** SUM formulas for M, P, Q, U, V columns. Merged cells as per original.

**Filter logic:** CIPLItems where `soPrincipal` is in the Compra's SOs AND `liveData[SO]['embarqueNo'] === selectedEmbarque`.

**File name:** `PL_Consolidado_{embarqueNo}_{YYYY-MM-DD}.xlsx`

---

## 5. Auto-Link Mechanism

In `app/lib/etl.ts`, `guardarCIPL()`, after `prisma.cIPLItem.createMany()`:

```typescript
// Auto-link CIPLItems to Compra by SO match
const savedSOs = [...new Set(items.map(i => i.soPrincipal).filter(Boolean))]
if (savedSOs.length > 0) {
  const compraSOItems = await prisma.compraSOItem.findMany({
    where: { soNumber: { in: savedSOs.map(s => s!.toUpperCase()) } },
    select: { compraId: true, soNumber: true }
  })
  if (compraSOItems.length > 0) {
    const soToCompra = new Map(compraSOItems.map(c => [c.soNumber, c.compraId]))
    // Update each CIPLItem with its compraId
    for (const [so, compraId] of soToCompra.entries()) {
      await prisma.cIPLItem.updateMany({
        where: { soPrincipal: { equals: so, mode: 'insensitive' }, compraId: null },
        data: { compraId }
      })
    }
  }
}
```

No breaking changes to existing flow.

---

## 6. KPI Dashboard — Detail

All KPIs computed server-side on page load. No separate API routes needed.

**Home page (`/`) additions:**
- "Compras esta semana" counter
- "Alertas: X compras sin PL +30 días" warning card
- Link to `/compras`

**`/compras` KPI grid:**

Row 1 — Operational:
1. `Compras activas` — count(Compras where no fechaArriboDeposito in liveData)
2. `FOB en proceso` — sum(CompraSOItem.fobTotal) for active Compras
3. `Unidades por recibir` — sum(qPi) - sum(qty from CIPLItems) for active
4. `Tiempo promedio orden→depósito` — avg days for completed Compras (last 90d)

Row 2 — Status breakdown (small cards):
5. `Borrador` count
6. `Pagadas esperando PL` count
7. `PL cargado / en tránsito` count
8. `Alertas` — pagadas sin PL hace +30 días (red highlight)

---

## 7. Design System

Follows existing app aesthetic: dark background `#0A0A0A`, accent `#E30613`, card borders `rgba(255,255,255,0.06)`.

**New UI patterns:**
- `MilestoneTimeline`: horizontal scrollable row of step circles. Manual steps show pencil icon on hover → opens date picker. Auto steps show a sync icon + source tooltip.
- `CompraStatusBadge`: derived status with colored dot. Uses 12 possible states.
- `SOProgressCard`: expandable card showing SO detail + nested PL rows.
- `KPIGrid`: 4-column responsive grid, each cell has label, large number, sub-label, optional trend or color accent.
- `ConsolidadoExportButton`: triggers server action, shows loading state, auto-downloads.

---

## 8. Sidebar Update

Add entry between Inicio and Panel General:
```typescript
{ href: '/compras', label: 'Compras', icon: ShoppingCart }
```

---

## 9. Scope Boundaries

**In scope:**
- Full `/compras` CRUD (list, create, detail, edit milestones)
- Auto-link CIPLItems → Compra on save
- PL Consolidado Excel export
- Comex milestone mapping section in `/operaciones`
- Home page KPI additions
- Comex tab: Consolidado view

**Out of scope (future):**
- Role-based visibility (who can mark which milestones)
- Notifications / email alerts for overdue compras
- Repuesto consolidado (only Mercadería)
- Multi-currency support

---

## 10. Open Questions (resolved)

- Supplier fields: manual on Compra level ✓
- Comex dates: all from sources, none hardcoded ✓
- Instrucción Category + LMS: after PL cargado ✓
- Consolidado: only Mercadería ✓
- Roles: all manual milestones marked by the buyer ✓
- Segunda Validación PA: manual date, skippable ✓
- piNo: known at creation time ✓
- embarqueNo: from Comex sources, per SO ✓
