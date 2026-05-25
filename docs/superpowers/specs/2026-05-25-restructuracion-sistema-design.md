# Restructuración del sistema Panel-Compras

**Fecha:** 2026-05-25
**Estado:** Diseño aprobado, pendiente de plan de implementación
**Autor:** Francisco O'Brien (admin) + Claude

---

## 1. Objetivo

Rediseñar el sistema de gestión de importaciones DJI Argentina para que el equipo lo use día a día. Hoy hay módulos solapados (Panel General, Comex Tracking, Operaciones, Reportes, Inspección) sin un centro claro. El equipo no lo usa porque la información está repartida y los modelos de datos son frágiles.

El nuevo sistema gira alrededor del **Embarque** como concepto central, con un único modelo de join (por SO) que va de los Packing Lists de DJI a la planilla interna de Comex.

---

## 2. Principios de diseño

- **Embarque como pieza central** — todo gira alrededor de qué viaja en qué embarque
- **La planilla de Comex es la fuente de verdad del tracking** — no se guarda en nuestra DB
- **El Embarque es una vista calculada** — no es un modelo de Prisma, se construye al vuelo cruzando CIPLItems con la planilla
- **Un solo join key: el SO** — desaparece la complejidad de fieldKey, namespaces `so:`/`asn:`/`embarqueNo:`
- **El detalle del Embarque es single source of truth** — toda la información sobre un envío vive en un lugar
- **Configuración mínima** — solo URL de la planilla Comex y nombre de dos columnas (SO + N° Embarque)

---

## 3. Arquitectura

### 3.1 Módulos

El sistema tiene **4 módulos** en el sidebar, más Home:

| Módulo | Quién usa | Para qué |
|--------|-----------|----------|
| **Home** | Todos | Alertas, búsqueda global, KPIs básicos |
| **🚢 Embarques** | Todos (lectura) | Seguir qué llega y cuándo. **Vista central**. |
| **🛒 Compras** | Comercial (write) | Cargar y seguir órdenes de compra |
| **📤 Carga CIPL** | Comercial (write) | Subir PLs de DJI, asignar SOs, fotos de inspección, control qty |
| **⚙️ Configuración** | Comex / Admin | URL de la planilla + columnas SO/Embarque |

### 3.2 Lo que se elimina

- **Panel General** — su contenido se reparte entre Embarques (detalle) y Carga CIPL (control)
- **Comex Tracking** (módulo separado) — fusionado dentro del detalle de Embarque
- **Operaciones** — reemplazado por Configuración minimalista
- **Reportes** — fuera de scope (por ahora)
- **Inspección** (módulo separado) — fusionado dentro del flujo de Carga CIPL como paso 3 de 5
- **fieldKey mapping complejo** — reemplazado por mapping fijo de 2 campos
- **JOINABLE_FIELDS múltiples** (so/asn/piNo/embarqueNo) — queda solo SO
- **Tipo `LiveDataMap` con namespaces** — se simplifica a `Record<SO, ComexRow>`

### 3.3 Flujo de información

```
┌─────────────┐         ┌──────────────┐         ┌──────────────────┐
│ Excel DJI   │ ──────► │ CIPLItem     │ ◄────── │ Compra           │
│ (PL/CIPL)   │  carga  │ (DB)         │  link   │ (DB)             │
└─────────────┘         └──────┬───────┘         └──────────────────┘
                               │ soPrincipal
                               ▼
                        ┌──────────────────────┐
                        │ Planilla Comex       │
                        │ (Google Sheet)       │
                        │  SO → embarques[],   │
                        │       ETD[], ETA[]…  │
                        └──────┬───────────────┘
                               │
                               ▼
                        ┌──────────────────────┐
                        │ Embarque (computed)  │
                        │  N° Embarque         │
                        │  + SOs incluidos     │
                        │  + tracking          │
                        │  + items del PL      │
                        └──────────────────────┘
```

---

## 4. Modelo de datos

### 4.1 Schema Prisma (sin cambios)

El schema actual ya está limpio. **No requiere migración de schema**, solo cambios de código que lo usen.

Modelos relevantes:

- `CIPLItem` — ítems del Packing List (identidad, descripción, qty, SO, fotos, links Drive)
- `CIPLPhoto` — fotos de inspección asociadas a ítems
- `Compra` — header de orden de compra (proveedor, fechas, PI)
- `CompraSOItem` — SOs dentro de una compra (con qty pedida, FOB, modelo, SKU)
- `AppConfig` — config key-value (URL planilla Comex)
- `User` — con roles `comercial` / `comex` / `admin`

**Nota:** `InspeccionTemp` se mantiene para fotos pendientes de asignar.

### 4.2 Planilla Comex (Google Sheet)

**Estructura esperada de la planilla:**

| SO | N° Embarque | ETD | ETA | AWB | Estado | … |
|----|-------------|-----|-----|-----|--------|---|
| SO-1001 | EMB-045 | 15/06/25 | 28/06/25 | 235-1234567 | En tránsito | … |
| SO-1002 | EMB-045 | 15/06/25 | 28/06/25 | 235-1234567 | En tránsito | … |
| SO-1003 | EMB-045,EMB-046 | 15/06/25,20/06/25 | 28/06/25,02/07/25 | 235-1234567,— | En tránsito,Pendiente | … |

**Reglas:**

- 1 fila por SO
- Para SOs split en varios embarques: los campos `N° Embarque`, `ETD`, `ETA`, `AWB`, `Estado` (y cualquier otro de tracking) se llenan con valores **coma-separados, posicionalmente sincronizados**
- El sistema interpreta `N° Embarque[i]` con `ETD[i]`, `ETA[i]`, etc.
- Si una columna no tiene split (ej: AWB único), el sistema usa el primer valor o lo replica

### 4.3 Cómo se construye el Embarque (computed)

```typescript
type ComexRow = {
  so: string
  shipments: Array<{
    embarqueNo: string
    etd: string | null
    eta: string | null
    awb: string | null
    estado: string | null
    extras: Record<string, string | null>
  }>
}

type Embarque = {
  embarqueNo: string
  estado: 'pendiente' | 'en-transito' | 'arribado' | 'desconocido'
  etd: string | null
  eta: string | null
  awb: string | null
  sos: string[]            // SOs que viajan
  items: CIPLItem[]        // todos los ítems del PL con esos SOs
  totalQty: number
  totalCbm: number
  compras: Compra[]
}
```

**Algoritmo:**

1. Leer planilla Comex → array de `ComexRow` (1 por SO, con splits parseados)
2. Aplastar a un mapa `Map<embarqueNo, { sos: Set<string>; rowSlices: ... }>` donde para cada SO que tiene ese embarque tomamos el slice (índice) correspondiente del split
3. Para cada embarque, traer los `CIPLItem` con `soPrincipal IN sos` desde Prisma
4. Calcular `estado` derivado de las fechas:
   - `arribado` si hay arrivo de WH cargado
   - `en-transito` si ETD pasó y no hay arribo
   - `pendiente` si ETD aún no pasó
   - `desconocido` si no hay ETD

### 4.4 Estado del embarque (autoderivado)

```typescript
function deriveStatus(row: ComexShipmentSlice): EmbarqueStatus {
  if (row.arriboWh) return 'arribado'
  if (row.etd && new Date(row.etd) <= new Date()) return 'en-transito'
  if (row.etd) return 'pendiente'
  return 'desconocido'
}
```

Sin acciones manuales. Si Comex actualiza la planilla, el estado cambia en el próximo render.

---

## 5. Detalle de cada módulo

### 5.1 Home — Tablero ejecutivo

**Ruta:** `/`

**Audiencia:** directorio + operación. Tiene que servir tanto para tomar decisiones desde lo alto como para ver pendientes del día.

**Layout (top-to-bottom):**

1. **Header con búsqueda global (cmd+k)** — encuentra SO, ASN, embarque, EAN, descripción, compra.

2. **Fila de KPIs ejecutivos** (4 cards grandes con número + delta vs mes anterior):
   - **Valor en tránsito** (USD): suma de FOB total de SOs en embarques con estado "en-tránsito" o "pendiente"
   - **Embarques activos**: count de embarques no arribados
   - **Unidades arribadas (mes)**: suma `qty` de items en embarques con `arribó WH` este mes
   - **SLA cumplimiento**: % de embarques que arribaron dentro de los 21 días desde ETD (configurable)

3. **Fila de gráficos** (2 columnas):
   - **Embarques por mes** (bar chart): últimos 12 meses, segmentados por estado
   - **Top proveedores** (horizontal bars): top 5 por FOB acumulado YTD
   - **Tendencia de discrepancias** (line chart): % de ítems con qty mismatch por mes
   - **Distribución por tipo de carga**: donut chart (Mercadería / Repuesto)

4. **Bandeja de alertas operativas** (lista priorizada):
   - 🔴 Críticas: "Embarque EMB-045 ETA pasada hace N días sin arribo confirmado"
   - 🟡 Atención: "PL ASN-7 tiene N ítems sin foto", "Compra X: pago vence en 3 días"
   - 🔵 Info: "Embarque EMB-Y llega en 2 días" (cuando ETA < 7 días)
   - Click en alerta → navega al detalle correspondiente

5. **Resumen de actividad reciente**:
   - Últimos 5 PLs cargados
   - Últimos 5 embarques con cambio de estado

**Notas de implementación:**
- Los KPIs se calculan server-side cada request (DB query + fetch Comex)
- Los gráficos usan una librería ligera (recharts o equivalente, sin Chart.js pesado)
- El estado "SLA" es configurable en `AppConfig` (default: 21 días)

### 5.2 Embarques

**Rutas:** `/embarques` (lista) y `/embarques/[embarqueNo]` (detalle)

**Lista:**
- Tabla con columnas: N° Embarque, Estado, ETD → ETA, AWB, SOs (chips), Unidades, CBM
- Filtros por estado: Todos, En tránsito, Pendiente, Arribado, Desconocido
- Búsqueda en línea por N° Embarque o SO
- Click en fila → detalle

**Detalle (single source of truth):**

Header:
- N° Embarque + chip de estado
- Botones: **Exportar CIPL consolidado** (descarga Excel) + Drive (abre carpeta)
- Tracking: ETD, ETA, AWB

Tabs:
- **Resumen** — KPIs del embarque (cantidad SOs, unidades, CBM, total fotos, control status)
- **Ítems (N)** — tabla de todos los CIPLItems del embarque (de todos los ASNs/PLs)
- **Control** — tabla qty PL vs qty PI con badge si hay problemas (qty mismatch o sin fotos)
- **Fotos (N)** — galería de todas las CIPLPhotos asociadas, agrupadas por ítem
- **Compras (N)** — compras vinculadas vía SOs, con su lifecycle de pago
- **Historial** — log de cambios manuales sobre los ítems (qty editadas, notas, revisiones)

### 5.3 Compras

**Rutas:** `/compras` (lista) y `/compras/[id]` (detalle)

**Lista:** prácticamente igual a hoy. Tabla con: ID/PI, proveedor, fechas, SOs (chip count), total FOB, estado.

**Detalle:** prácticamente igual a hoy + agregar columna "Embarque" en la tabla de SOs:

| SO | Modelo | SKU | Qty PI | FOB Unit | Embarque(s) |
|----|--------|-----|--------|----------|-------------|
| SO-1001 | Mini 4 Pro | CP.MA…91 | 50 | 1200 | EMB-045 → |
| SO-1003 | RC-N1 | CP.MA…58 | 80 | 50 | EMB-045, EMB-046 → |

Click en chip de embarque → lleva al detalle del embarque.

### 5.4 Carga CIPL

**Ruta:** `/carga` (single page con stepper)

**Flujo lineal de 5 pasos:**

1. **Subir Excel DJI** — drag & drop. Parser extrae rows + asigna ASN/case/qty (igual a hoy).
2. **Asignar SOs** — tabla editable con sugerencia IA (Claude). El usuario confirma o corrige.
3. **Subir fotos de inspección** (opcional) — drag & drop de Excel con fotos embebidas (igual a `/inspeccion` hoy). Matching IA por carton/case. Asignación a CIPLItems.
4. **Control** — tabla qty PL vs qty PI + fotos por ítem. Acciones permitidas por ítem:
   - Marcar como revisado/aceptado
   - Editar qty inline
   - Agregar nota
5. **Confirmar** — guarda todo. Items pasan a estado "confirmado". Pueden seguir editándose desde Embarques o Compras.

Nota: en cada paso se puede saltar al siguiente sin completar (excepto el 1 que es requerido). El stepper preserva estado durante la sesión.

### 5.5 Configuración

**Ruta:** `/configuracion`

**Single page con un solo formulario:**

```
┌─ Planilla Comex ────────────────────────────────────────┐
│ URL: [https://docs.google.com/spreadsheets/d/…       ]  │
│ Hoja: [Tracking                                      ]  │
│                                                         │
│ Columna "SO":         [SO número            ▼]          │
│ Columna "N° Embarque": [N° Embarque         ▼]          │
│                                                         │
│ Columnas extra a mostrar (autodetectadas):              │
│  ☑ ETD          ☑ ETA          ☑ AWB                    │
│  ☑ Estado       ☑ Arribo WH    ☐ Comentarios            │
│                                                         │
│ [Vista previa] [Guardar]                                │
└─────────────────────────────────────────────────────────┘
```

Detalles:
- Los dropdowns de columna se llenan haciendo preview de la planilla (fetch CSV, leer headers)
- Las "columnas extra" se autodetectan y el admin puede deshabilitar las que no quiere mostrar
- No hay `fieldKey` arbitrarios — los extras se identifican por su header sluggified

---

## 5bis. Inteligencia (IA aplicada)

Tres puntos donde el sistema usa IA para que el equipo no tenga que hacer trabajo manual:

### 5bis.1 Sugerencia automática de SOs (`/api/suggest-sos`)

Ya existe parcialmente (`app/api/suggest-sos/route.ts`). Mejoras a integrar:

- **Estrategia two-step (ya implementada parcialmente)**:
  1. Filtrar GSO V4 por columna "N Invoice" para acotar a SOs del invoice actual
  2. Match individual contra ese set acotado
- **Confidence score**: cada sugerencia viene con score `high`/`medium`/`low`
- **Aprendizaje histórico**: usar `CIPLItem` históricos como guía (si EAN X siempre fue SO-1234, sugerir eso)
- **UX**: mostrar sugerencia con badge de confianza + razón ("código CP.MA…91 coincide con SO-1001")
- **Auto-aceptar high confidence**: opt-in en Configuración. Si el admin activa la opción, las sugerencias high se aplican solas

### 5bis.2 Extracción inteligente desde fotos

Ya existe en módulo de inspección (`app/inspeccion/`). Migrar al stepper de Carga CIPL como paso 3:

- Lee imágenes embebidas en el Excel de inspección (anchors xdr en `xl/drawings/drawing1.xml`)
- Para cada foto, llama a Claude (vision) con prompt: "identificá ASN/Carton/Case/SO visibles en esta etiqueta"
- Returns: `{ asn, cartonNo, caseNo, soNo, confidence }`
- Auto-asigna fotos a CIPLItems cuando el match es high confidence
- Para low confidence: muestra dropdown manual

**Mejora propuesta:** además de etiquetas, extraer:
- Modelo visible en la caja (si difiere de descripción del PL → flag)
- Cantidad visible en etiqueta (si difiere de qty del PL → flag)

### 5bis.3 Extracción inteligente desde el CIPL (Excel DJI)

Parser actual (`app/api/cipl-parse/`) extrae filas tabulares. Mejoras:

- **Tolerancia a layout**: DJI a veces cambia headers ("ASN" vs "Shipment No" vs "Reference"). Usar IA para mapear headers no estándar
- **Detección de PIs mixtos**: si el Excel mezcla 2 PIs, separarlos automáticamente y crear 2 grupos
- **Categorización automática de tipoCarga** (Repuesto vs Mercadería) basado en descripción
- **Detección de dangerous goods**: flag automático si la descripción contiene "battery", "lithium", etc.

### 5bis.4 Detección de discrepancias

Al cargar un PL, IA compara automáticamente:
- `qty PL` vs `qty PI` (de Compra) → flag si difieren
- `modelo PL` vs `modelo GSO V4` → flag si difieren
- Genera alertas visibles en home y en Control

---

## 6. Exportar CIPL consolidado

**Trigger:** botón en detalle de Embarque → `GET /api/embarques/[embarqueNo]/export`

**Comportamiento:**

1. Carga todos los `CIPLItem` del embarque (de todos los ASNs/PLs que viajan en él)
2. Genera Excel con la misma estructura que `lib/exportCipl.ts` actual, pero con N filas (no solo 1 PL)
3. Header del Excel: N° Embarque, fecha export, lista de ASNs incluidos
4. Filename: `CIPL-${embarqueNo}-${fecha}.xlsx`

**Reuso de código:** `lib/exportCipl.ts` se extiende para aceptar items de múltiples ASNs/SOs en lugar de uno solo.

---

## 7. Roles y permisos

| Acción | comercial | comex | admin |
|--------|-----------|-------|-------|
| Ver Home / Embarques / Compras | ✓ | ✓ | ✓ |
| Carga CIPL (subir PLs, asignar SOs, fotos) | ✓ | — | ✓ |
| Carga Compras | ✓ | — | ✓ |
| Configuración (URL planilla + columnas) | — | ✓ | ✓ |
| Editar qty / agregar notas en control | ✓ | — | ✓ |
| Marcar ítems como revisados | ✓ | ✓ | ✓ |
| Exportar CIPL consolidado | ✓ | ✓ | ✓ |
| Eliminar embarques/PLs/compras | — | — | ✓ |
| Acceso a logs/historial | — | ✓ | ✓ |

Implementación: middleware Next.js + helper `requireRole(req, ['admin', 'comercial'])`.

---

## 7bis. Lenguaje de diseño (premium / profesional)

El sistema tiene que tener calidad de producto comercial, no de tool interno casero. Referencia visual: **dji.bidcomagro.com.ar** (sitio público del concesionario).

### Principios visuales

- **Dark theme único** en todo el sistema (no toggle a light). Fondo `#0a0a0a` / `#0d0d0d`, cards `#111` / `#141414`, bordes sutiles `#222` / `#333`
- **Acento DJI red** `#E30613` para CTAs principales, links activos, estado crítico
- **Colores semánticos de estado**: emerald `#10b981` (OK/arribado), amber `#f59e0b` (atención/pendiente), red `#ef4444` (problema/atrasado), blue `#3b82f6` (info/en tránsito), purple `#8b5cf6` (compras)
- **Tipografía**: una tipografía display + una sans serif para body. Candidatas: **Inter Tight** o **Geist** (display) + **Inter** (body). No usar fuentes genéricas (Arial, Roboto).
- **Numeric tabular**: todas las cantidades, FOB y fechas en `font-variant-numeric: tabular-nums` para alinear bien en tablas
- **Iconografía consistente**: Lucide React, weight 1.5, tamaños 14/16/20px según contexto

### Densidad y composición

- **Whitespace generoso pero controlado**: padding `12px`/`16px`/`24px` consistentes. Nunca cards apretadas.
- **Headlines tight**: títulos con `line-height: 1.1`, body `line-height: 1.5`
- **Tablas profesionales**: filas de 36-40px de alto, hover state sutil, headers en mayúsculas pequeñas con letter-spacing
- **Cards con borde + sombra mínima**: `border: 1px solid #222`, `border-radius: 10px`, sin drop shadow agresivo
- **Status pills**: bordes redondeados `8px`, padding `2px 8px`, texto `9-10px` bold

### Microinteracciones

- **Transiciones**: 150-200ms ease-out en hover/focus, nunca más largo
- **Loading states**: skeleton placeholders, no spinners genéricos
- **Empty states**: ilustración sutil + CTA claro
- **Form validation**: inline, errors en rojo con icono, success silencioso

### Componentes clave a desarrollar

- `<StatusPill estado="en-transito" />` — pill con color por estado de embarque
- `<KPICard valor delta="-3%" />` — card grande del dashboard
- `<DataTable />` — tabla densa con sticky headers, hover, sortable
- `<DateRange etd eta />` — formato consistente `15/06 → 28/06`
- `<MoneyValue usd={1234} />` — formato consistente USD con separadores
- `<SearchInput />` — input con icono, autocompletar, atajo cmd+k
- `<AlertItem priority="critical" />` — item de bandeja de alertas con icono semántico

Aplicar el `frontend-design` skill durante la implementación de cada página.

---

## 8. Mobile

El sistema debe funcionar en **desktop y mobile** (responsive). Todos los módulos deben ser accesibles desde ambos. Prioridades:

- **Desktop**: experiencia completa, ideal para flujos pesados (Carga CIPL, Configuración, edición masiva)
- **Mobile**: prioridad lectura de Embarques (lista + detalle) y bandeja de alertas, también acciones livianas (marcar revisado, agregar nota, ver fotos)
- **Carga CIPL en mobile**: el upload de Excel queda accesible pero recomendado en desktop por tamaño. Los pasos posteriores (asignar SOs, control) funcionan bien en mobile.

Implementación: Tailwind con breakpoints (`sm:`/`md:`/`lg:`). Tablas grandes pasan a cards stackeadas en mobile. Modales y stepper se adaptan a viewport.

---

## 9. Plan de migración

**No se vacía la DB.** Se migra lo cargado.

1. Schema Prisma: ya está limpio (commit `e0e90b0` removió los tracking fields). No requiere `db push`.
2. Configuración existente (`AppConfig.COMEX_SOURCES`):
   - Si existe → script de migración la transforma al nuevo formato simplificado (extrayendo URL + sheet + join column)
   - Si no existe → se inicializa con valores por defecto al primer ingreso a `/configuracion`
3. Datos en CIPLItems / Compras / Photos: se preservan tal cual.
4. Datos calculados (Embarques): se recalculan al primer load de `/embarques` después del deploy.
5. Cleanup de código: los módulos eliminados (`/panel-general`, `/comex`, `/operaciones`, `/reportes`, `/inspeccion`) se borran al final, después de verificar que el sistema funciona.

---

## 10. Búsqueda global (cmd+k)

**Implementación:**

- Atajo: ⌘K (Mac) / Ctrl+K (Linux/Windows)
- Modal flotante con input + lista de resultados agrupados por tipo
- Buckets:
  - Embarques (match N° Embarque exacto o partial)
  - SOs (match contra `CIPLItem.soPrincipal` o `CompraSOItem.soNumber`)
  - ASNs (match contra `CIPLItem.asn`)
  - Productos (match descripción / EAN / SKU contra CIPLItems)
  - Compras (match contra PI o proveedor)
- Click en resultado → navega al detalle correspondiente

**Backend:** una ruta `/api/search?q=…` que hace 5 queries en paralelo y retorna top 5 de cada bucket.

---

## 11. Out of scope

Para esta fase **no incluimos:**

- Módulo de Reportes (KPIs avanzados, dashboards de ejecutivos)
- Notificaciones push / email
- Versionado / history detallado por ítem (más allá del log básico)
- Integración bidireccional con Comex (solo se lee, no se escribe en su planilla)
- Multi-empresa / multi-tenant
- API pública

Estas quedan como futuras iteraciones.

---

## 12. Riesgos y open questions

| Riesgo | Mitigación |
|--------|------------|
| Comex no respeta el formato coma-sincronizado en split shipments | Validar al fetch: si N° Embarque tiene N comas y ETD tiene M ≠ N comas, mostrar warning en home y degradar a "fecha única por SO" |
| Cache de Google Sheets es lento (sin `no-store`) | Ya está `cache: 'no-store'` en `fetchOneSource`. Aceptamos ~1-3s de fetch por load de Embarques. |
| Usuario edita qty desde Control pero el PL original se vuelve a cargar | Documentar que la edición manual gana. Re-cargar requiere confirmar overwrite. |
| Borrar `/inspeccion` rompe usuarios con la URL en bookmarks | Redirect 301 a `/carga`. |

**Open questions todavía:**

- ¿Hay una columna "Q" o "Qty embarque" en la planilla Comex para saber qué cantidad va en cada embarque del split? Si sí, mostrar esa qty parcial. Si no, asumimos qty completa del PL en el primer embarque y dejamos al usuario marcar manualmente la división vía notas en Control.
- ¿La búsqueda global cmd+k necesita persistir últimas búsquedas/recientes? Por ahora: no.

---

## 13. Estructura de archivos esperada

```
app/
├── (auth)/login/
├── page.tsx                          # Home (alertas + KPIs + cmd+k)
├── embarques/
│   ├── page.tsx                       # Lista
│   ├── [embarqueNo]/page.tsx          # Detalle (single source of truth)
│   └── EmbarqueDetailClient.tsx
├── compras/
│   ├── page.tsx
│   ├── nueva/page.tsx
│   └── [id]/page.tsx
├── carga/
│   ├── page.tsx                       # Stepper de 5 pasos
│   ├── steps/UploadStep.tsx
│   ├── steps/AssignSOsStep.tsx
│   ├── steps/PhotosStep.tsx           # ex-inspeccion, fusionado
│   ├── steps/ControlStep.tsx
│   └── steps/ConfirmStep.tsx
├── configuracion/
│   └── page.tsx
├── api/
│   ├── embarques/[embarqueNo]/export/route.ts
│   ├── search/route.ts
│   └── alerts/route.ts
└── lib/
    ├── comex.ts                       # ex-comex-sources.ts simplificado
    ├── embarques.ts                   # construir Embarque desde Comex + CIPLItems
    ├── exportCipl.ts                  # extendido para múltiples ítems
    └── alerts.ts                      # generar lista de alertas

prisma/
└── schema.prisma                      # sin cambios

components/                             # compartidos
├── CmdK.tsx                            # búsqueda global
├── Sidebar.tsx
└── AlertList.tsx
```

---

## 14. Testing

- **No incluimos test framework si no existe** — el repo hoy no tiene tests. Vamos a validar manualmente durante el desarrollo y dejar testing automatizado como tarea futura.
- **Validación manual obligatoria por feature:**
  - Embarques: probar split shipment con una SO en 2 embarques
  - Control: editar qty, agregar nota, marcar revisado
  - Export: descargar Excel y comparar con `lib/exportCipl.ts` actual
  - Roles: probar acceso con cuenta comercial vs comex vs admin
  - Mobile: abrir en celular y validar tabla de embarques

---

## 15. Estimación de esfuerzo

Tarea | Estimación
---|---
Sistema de diseño (tipografías, colores, componentes base) | 1 día
Construcción del Embarque computed (parser split + join) | 1 día
Detalle del Embarque (tabs: resumen, items, control, fotos, compras, historial) | 2 días
Tablero ejecutivo (KPIs + gráficos + alertas) | 2 días
Carga CIPL stepper (fusión con inspección + IA mejorada) | 3 días
Configuración simplificada | 1 día
Búsqueda global cmd+k | 1 día
Export consolidado | 0.5 día
Roles & middleware | 0.5 día
Mobile responsive | 1 día
Cleanup de módulos viejos | 0.5 día
Migración config | 0.5 día
**Total estimado** | **~14 días de trabajo**

---

## Apéndice A — Decisiones clave del brainstorming

1. **Embarque ≠ ASN**: confirmado. Embarque es código interno de Comex; ASN es código DJI por PL.
2. **Embarque es vista calculada**, no modelo de DB: confirmado.
3. **Una SO puede viajar en varios embarques** (split shipment): confirmado, "pasa seguido".
4. **Format en planilla Comex para splits**: 1 fila por SO con listas coma-separadas paralelas en N° Embarque, ETD, ETA, etc.
5. **Inspección fusionada en Carga CIPL**: confirmado.
6. **Control con acciones**: marcar revisado, editar qty inline, agregar nota.
7. **Export consolidado por embarque**.
8. **Todo en un lado = detalle del Embarque** (no un dashboard global separado).
9. **Mobile + Desktop ambos**.
10. **Migración: preservar datos cargados**.
