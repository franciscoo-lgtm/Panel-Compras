# Panel de Reportes — Design Spec

## Objetivo

Crear una nueva página `/reportes` que centraliza todos los reportes del sistema. El usuario puede agregar múltiples "tiles" de reporte, cada uno con su propia configuración (agrupación, filtros, columnas). Los tiles persisten en localStorage y desaparecen solo cuando el usuario los elimina explícitamente. Se eliminan las vistas de reporte de Panel General y Comex Tracking.

---

## Contexto del sistema existente

- **Datos base:** `CIPLItem` en PostgreSQL via Prisma. Campos relevantes: `asn`, `piNo`, `soPrincipal`, `tipoCarga`, `categoryName`, `caseNo`, `description`, `qty`, `qBultos`, `cbm`, `gwKg`, `etd`, `eta`, `arriboWh`, `etaCaldas`, `awb`, `avisoAgente`.
- **Fuentes live:** `fetchAllSourcesData(sources)` en `app/lib/comex-sources.ts` retorna `{ liveData: LiveDataMap, extraColumns: ExtraColumn[] }`. `liveData` está indexado por `soPrincipal.toUpperCase()`. `extraColumns` son columnas `extra_*` que varían según las fuentes configuradas.
- **Patrón de fetch:** igual al de Panel General — server component fetcha ítems + fuentes, pasa al client component.
- **Columna calculada "días":** `arriboWh - etd` en días. Si no hay `arriboWh`, usar fecha de hoy si ya pasó ETA (demorado).

---

## Arquitectura

### Archivos nuevos

| Archivo | Responsabilidad |
|---|---|
| `app/reportes/page.tsx` | Server component: fetch CIPLItems + fetchAllSourcesData, pasa props al client |
| `app/reportes/ReportesClient.tsx` | Client component: dashboard de tiles, localStorage, drawer de config, exportar |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `components/sidebar.tsx` | Agregar entrada "Reportes" con ícono `BarChart2` |
| `app/panel-general/PanelGeneralClient.tsx` | Eliminar `reportGroupBy`, `reportGroups`, `buildPanelReportGroups`, `GPill`, vista de reporte, el `<select>` de agrupar; volver a `groupByAsn: boolean` simple |
| `app/comex/ComexClient.tsx` | Eliminar `groupBy`, `buildReportGroups`, `ReportView`, `TotalPill`, `type ReportGroup`, `type GroupByField`, `GROUP_BY_OPTIONS`; botón BarChart2 y vista `'reporte'` |

---

## Tipos principales (`ReportesClient.tsx`)

```typescript
type ReportTileConfig = {
  id: string                    // uuid v4, generado al crear
  groupBy: GroupByField
  filters: {
    dateFrom: string | null     // ISO date string
    dateTo: string | null       // ISO date string
    tipoCarga: string | null    // 'Mercaderia' | 'Repuesto' | null = todos
    search: string              // ASN / PI / SO text filter
  }
  columns: string[]             // fieldKeys de columnas visibles, en orden
}

type GroupByField =
  | 'asn' | 'piNo' | 'soPrincipal' | 'tipoCarga' | 'categoryName' | 'caseNo'

// CIPLItem row shape (subset of Prisma model, serialized from server)
type CIPLItemRow = {
  id: string; asn: string | null; piNo: string | null; caseNo: string | null
  soPrincipal: string | null; tipoCarga: string; categoryName: string | null
  description: string | null; qty: number | null; qBultos: number | null
  cbm: number | null; gwKg: number | null
  etd: string | null; eta: string | null; arriboWh: string | null
  etaCaldas: string | null; awb: string | null; avisoAgente: string | null
}

type ReportGroup = {
  key: string
  items: CIPLItemRow[]
  totalQty: number
  totalBultos: number
  totalCbm: number
  totalGw: number
}
```

---

## Columnas disponibles en el drawer de configuración

Las columnas que el usuario puede activar/desactivar en cada tile son la unión de:

1. **Columnas fijas** (siempre disponibles):
   - `qty` · `qBultos` · `cbm` · `gwKg` · `etd` · `eta` · `arriboWh` · `etaCaldas` · `awb` · `avisoAgente` · `description` · `caseNo` · `piNo` · `soPrincipal` · `tipoCarga` · `categoryName`

2. **Columna calculada** (siempre disponible):
   - `_diasTransito`: días entre `etd` y `arriboWh` (o badge "demorado" si ETA < hoy y sin arribo)

3. **Extra columns de Fuentes** (dinámicas):
   - `extraColumns` recibidas como prop desde el server component. Se agregan automáticamente al selector cuando el usuario agrega nuevas fuentes.

El valor de una columna `extra_*` se resuelve via `liveData[so?.toUpperCase()]?.[fieldKey]`.

---

## Persistencia de tiles (localStorage)

```typescript
const STORAGE_KEY = 'reportes-dashboard-v1'

// Leer
const saved = localStorage.getItem(STORAGE_KEY)
const tiles: ReportTileConfig[] = saved ? JSON.parse(saved) : []

// Guardar
localStorage.setItem(STORAGE_KEY, JSON.stringify(tiles))
```

Los tiles se cardan en `useState` con inicialización lazy desde localStorage. Se guardan cada vez que cambia el array de tiles (agregar, editar, eliminar).

---

## Dashboard layout

- Grid de 2 columnas (CSS grid `grid-cols-2 gap-4`)
- Cada tile ocupa una columna. Para ver el reporte completo sin restricciones, usar el ícono ⊞ (fullscreen modal).
- Al final del grid, placeholder "+" para agregar nuevo tile
- Botón "Nuevo reporte" también en el header

---

## Cada tile

### Header
- Título auto: `"Por {groupBy label}"` + filtros activos como chips pequeños
- Íconos: ⊞ (expandir) · ⚙ (editar config) · xlsx · pdf · ✕ (eliminar)

### Totales strip
- 4 pills: qty total · bultos total · CBM total · GW total
- Solo cuenta ítems que pasan los filtros del tile

### Tabla agrupada
- Columna de grupo + columnas seleccionadas
- Filas de subtotales por grupo (qty, bultos, cbm, gw)
- Truncar a 5 grupos visibles, botón "ver N más ▼" si hay más
- Si la columna es `_diasTransito`: mostrar número de días en verde, o badge rojo "⚠ demorado"

---

## Drawer de configuración

Panel lateral derecho (overlay sobre el dashboard). Se abre al clickear "Nuevo reporte" o "⚙" en un tile existente.

Secciones:
1. **Agrupar por** — `<select>` con las 6 opciones de `GroupByField`
2. **Filtros:**
   - Rango de fechas: "Desde" / "Hasta" (input type=date, ambos opcionales)
   - Tipo de carga: "Todos / Mercadería / Repuesto"
   - Búsqueda libre: un campo de texto (filtra por ASN, PI, SO, description)
3. **Columnas:** grilla de toggles (checkbox pills). Separadas en: "Cantidades", "Logística", "Calculadas", "Fuentes". Las de Fuentes son las `extraColumns`.
4. Botón "Guardar" / "Agregar al dashboard"

---

## Exportar

### Excel (.xlsx)
- Usar la librería `xlsx` (ya en el proyecto, usada en Panel Comercial)
- Una hoja por tile exportado
- Fila de encabezados + filas de datos (items aplanados con su grupo) + fila de totales al final
- El botón `xlsx` en el header del tile exporta solo ese tile

### PDF
- Generar un HTML con los datos del tile y abrirlo en una nueva pestaña via `window.open()` con `print()` auto-ejecutado. La nueva pestaña tiene estilos inline básicos (tabla limpia, sin sidebar).
- El botón `pdf` en el header del tile dispara esta exportación.

---

## Limpieza en Panel General

Eliminar de `PanelGeneralClient.tsx`:
- `type PanelGroupByField` y `PANEL_GROUP_OPTIONS`
- `buildPanelReportGroups()`
- `GPill` component
- Estado `reportGroupBy: PanelGroupByField | null` → volver a `groupByAsn: boolean`
- El `<select>` de "Agrupar por" en la toolbar (reemplazar por el botón Layers simple de antes)
- La vista de "Generic Report View" (bloque JSX para non-ASN groupings)
- El grand total bar del ASN view

## Limpieza en Comex Tracking

Eliminar de `ComexClient.tsx`:
- `type GroupByField` y `GROUP_BY_OPTIONS`
- `type ReportGroup` y `buildReportGroups()`
- `TotalPill` component
- `ReportView` component
- Estado `groupBy: GroupByField` y la extensión de `view` a `'reporte'`
- El `<select>` de "Agrupar por" y el botón BarChart2 de la toolbar
- El bloque `{view === 'reporte' && ...}` en el render

---

## Sidebar

Agregar en `components/sidebar.tsx`:
```typescript
{ href: '/reportes', label: 'Reportes', icon: BarChart2 }
```
Posición: después de "Panel General", antes de "Carga Comercial".

---

## Vista expandida (fullscreen)

Al clickear el ícono ⊞ en un tile, ese reporte se muestra en un modal/overlay de pantalla completa:
- El modal cubre toda la pantalla (fixed inset-0, z-50, fondo oscuro)
- Header del modal: título del reporte + íconos xlsx / pdf / ✕ (cerrar)
- Totales strip completo
- Tabla sin truncar (todos los grupos visibles, con scroll vertical si hace falta)
- Todas las columnas visibles sin restricción horizontal (scroll horizontal si hace falta)
- Tecla Escape y click fuera del modal lo cierran
- No requiere navegación a otra ruta — es un overlay sobre el dashboard

Estado en el client: `expandedTileId: string | null`. Cuando es no-null, renderiza el modal con ese tile.

---

## No incluye (fuera de scope)

- Reportes compartibles por URL o exportados a Drive
- Arrastrar para reordenar tiles
- Gráficos / charts (solo tablas)
- Filtros por SO secundario
