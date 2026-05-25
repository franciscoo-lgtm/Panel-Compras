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

### 5.1 Home

**Ruta:** `/`

**Contenido:**
- Barra de búsqueda global (cmd+k) — encuentra SO, ASN, embarque, EAN, descripción
- Bandeja de alertas (top 10):
  - "Embarque EMB-045 llega en N días" (cuando ETA < 7 días)
  - "PL ASN-7 tiene N ítems sin foto"
  - "Compra X: pago vence el dd/mm"
  - "Embarque EMB-Y arribó WH hace N días sin cierre"
- KPIs básicos: total embarques activos, ítems en tránsito, compras abiertas

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
Construcción del Embarque computed (parser split + join) | 1 día
Detalle del Embarque (tabs: resumen, items, control, fotos, compras, historial) | 2 días
Carga CIPL stepper (fusión con inspección) | 2 días
Configuración simplificada | 1 día
Búsqueda global + bandeja alertas + home | 1 día
Export consolidado | 0.5 día
Roles & middleware | 0.5 día
Mobile responsive | 0.5 día
Cleanup de módulos viejos | 0.5 día
Migración config | 0.5 día
**Total estimado** | **~10 días de trabajo**

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
