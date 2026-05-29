# Panel-Compras — Instructivo de uso

Sistema de seguimiento de importaciones DJI Argentina. Versión vigente: producción en https://panel-comprass.vercel.app

---

## Índice

1. [Resumen del sistema](#1-resumen-del-sistema)
2. [Setup inicial (admin)](#2-setup-inicial-admin)
3. [Configuración / Fuentes de Comex](#3-configuración--fuentes-de-comex)
4. [Hitos del proceso](#4-hitos-del-proceso)
5. [Carga CIPL (`/comercial`)](#5-carga-cipl-comercial)
6. [Subir fotos](#6-subir-fotos-comercialfotos)
7. [PL Consolidado](#7-pl-consolidado-comercialconsolidar)
8. [Compras](#8-compras)
9. [Embarques](#9-embarques)
10. [Tablero ejecutivo (Home)](#10-tablero-ejecutivo-home)
11. [Búsqueda global](#11-búsqueda-global-cmdk)
12. [Tipos de transporte y SLA](#12-tipos-de-transporte-y-sla)
13. [Endpoints admin (diagnóstico)](#13-endpoints-admin-diagnóstico)
14. [Troubleshooting común](#14-troubleshooting-común)

---

## 1. Resumen del sistema

El panel reúne 4 módulos que comparten datos:

| Módulo | Función |
|---|---|
| **Compras** | Cargar órdenes de compra, asignar SOs, registrar fechas del proceso (pago, LMS, etc.) |
| **Carga CIPL** | Subir PLs de DJI (Repuesto / Mercadería), extraer datos con IA, asignar SOs |
| **Embarques** | Vista agrupada por N° Embarque (viene de Comex), con detalle, control, fotos, hitos |
| **Configuración** | Conectar planillas de Comex y definir hitos del proceso |

Plus:
- **Home (Tablero ejecutivo)**: KPIs operativos en tiempo real
- **cmd+k**: búsqueda global desde cualquier pantalla

**El sistema usa Google Sheets de Comex como fuente de tracking.** Vos no cargás ETD/ETA/Arribos manualmente — eso lo lleva Comex en su(s) planilla(s) y el sistema las lee.

**La unión es por SO.** Cada `CIPLItem` tiene un `soPrincipal`. El sistema lo busca en la(s) planilla(s) de Comex y le agrega el tracking.

---

## 2. Setup inicial (admin)

### Variables de entorno en Vercel

Estas ya están configuradas, pero por si necesitás verificarlas:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Connection string a Neon Postgres |
| `ANTHROPIC_API_KEY` | API key de Claude (para IA: parser CIPL, suggest SOs, extracción de fotos) |
| `GOOGLE_CLIENT_EMAIL` | Service account de Google Drive |
| `GOOGLE_PRIVATE_KEY` | Private key de la service account |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | ID de la carpeta raíz en Drive (debe estar en **Shared Drive**) |
| `SHEET_CSV_URL` o `GSO_SHEET_CSV_URL` | URL CSV del Sheet GSO V4 |

### Verificación de Drive

```
GET /api/admin/drive-health
```

Devuelve JSON con auth + folder + stats DB.

```
GET /api/admin/drive-test-upload
```

Sube un archivo de prueba al Drive — confirma que el flow completo funciona.

⚠️ **Importante**: La carpeta de Drive debe estar en una **Unidad Compartida** (Shared Drive) y la service account debe ser miembro con permiso "Administrador de contenido". Las service accounts no pueden ser dueñas de archivos en "Mi Drive" personal.

---

## 3. Configuración / Fuentes de Comex

URL: `/configuracion`

Acá conectás una o más planillas de Google Sheets que mantienen Comex.

### Conceptos clave

- **Fuente**: una planilla de Comex. Podés tener varias (Airsea, Aduana, Depósito, etc.).
- **Fuente principal** (⭐): la que tiene la columna **N° Embarque** que agrupa SOs. Solo una puede ser principal.
- **Mapeo**: por cada columna de la sheet, le decís a qué "hito" alimenta del sistema.

### Cómo agregar una fuente

1. Click **"+ Agregar fuente"**
2. Nombre descriptivo: "Airsea Stock", "Aduana Tracking", etc.
3. Pegá URL del Google Sheet (debe ser público o compartido con la service account)
4. Opcional: nombre de la hoja específica
5. Click **"Previsualizar columnas"**
6. Elegí la columna que tiene los SOs (obligatoria)
7. En la tabla de mappings, por cada columna que querés exponer:
   - Elegí el hito al que alimenta (`ETD`, `ETA`, `Arribo WH`, `Arribo Aduana`, `Arribo Depósito`, `AWB`, `Estado`)
   - O `+ Extra (libre)` si querés exponerla como dato visible sin mapear a un hito específico
8. Si esta fuente tiene la columna **N° Embarque**, marcala con ⭐ y mapeala
9. Repetir para todas las planillas
10. **Guardar todas las fuentes**

### Cómo funciona el merge

Cuando el sistema arma un embarque para `SO-1003`:
- Lee de la **fuente principal** → N° Embarque, ETD, ETA
- Lee de la **fuente Aduana** → Arribo Aduana
- Lee de la **fuente Depósito** → Arribo Depósito
- Todo se combina por SO

### Hitos auto-detectados

Si una columna se llama con substring que matchea (case-insensitive):
- `etd` → ETD
- `eta` → ETA
- `awb` → AWB
- `deposito` / `depósito` → Arribo Depósito (**fin de proceso**)
- `aduana` → Arribo Aduana

Igual conviene mapear explícitamente con el dropdown.

### Eliminar configuración

Botón **"🗑 Eliminar TODAS las fuentes"** al final. Borra `COMEX_CONFIG` de la DB. Los CIPLs y compras NO se borran.

---

## 4. Hitos del proceso

URL: `/configuracion/hitos`

Definís qué pasos componen el seguimiento de Compras y Embarques.

### Default (los 12 que vienen con el sistema)

| # | Hito | Source | Aparece en |
|---|---|---|---|
| 1 | Orden creada | manual (`fechaOrden`) | Compras |
| 2 | Enviada al proveedor | manual (`fechaEnvio`) | Compras |
| 3 | Pagada | manual (`fechaPago`) | Compras |
| 4 | 2da Validación PA | manual (`fechaSegundaValPA`) | Compras |
| 5 | PL Cargado | auto (`createdAt` del primer CIPL) | Compras |
| 6 | Instrucción Category | manual (`fechaInstruccionCat`) | Compras + Embarques |
| 7 | LMS | manual (`fechaLMS`) | Compras + Embarques |
| 8 | Arribo WH Airsea | Comex (`arriboWh`) | Compras + Embarques |
| 9 | ETD | Comex (`etd`) | Compras + Embarques |
| 10 | ETA | Comex (`eta`) | Compras + Embarques |
| 11 | Arribo Aduana | Comex (`fechaArriboAduana`) | Compras + Embarques |
| 12 | Arribo Depósito | Comex (`fechaArriboDeposito`) | Compras + Embarques |

**Embarques arranca desde "Instrucción Category"** porque los primeros pasos son específicos del lifecycle de la Compra.

### Cómo agregar un hito custom

1. Asegurate de tener la columna mapeada en `/configuracion` primero (para hitos Comex)
2. Click **"+ Agregar hito custom"**
3. Editá el nombre
4. Elegí source:
   - **Manual**: dato viene de un campo de Compra (los 6 manuales arriba)
   - **Comex**: del catálogo + extras configurados
   - **Auto**: solo "PL Cargado" por ahora
5. Elegí el campo correspondiente
6. ☑ Compras y/o ☑ Embarques
7. Reordená con ↑ ↓ si querés
8. **Guardar hitos**

### Restaurar default

Botón **"Restaurar default"** abajo. Vuelve a los 12 originales.

---

## 5. Carga CIPL (`/comercial`)

Flujo de 5 pasos para cargar un PL de DJI:

### Paso 1: Cargar archivo

- **Tipo**: Repuesto o Mercadería
- **Nombre de quien carga** (ej "F OBRIEN")
- **Archivo Excel** (Repuesto) o **CI + PL** (Mercadería)
- Click **"Extraer datos"**

El sistema:
1. Sube el/los archivos a Google Drive (en `Compras DJI > AAAA > MMAAAA > N°PI`)
2. Llama a la IA (Claude) para extraer los items
3. Guarda los drive links para mostrar después

**Si Drive falla**: aparece banner rojo bloqueante con opción "Reintentar Drive" o "Continuar sin Drive". Si elegís continuar, los CIPLs se cargan pero sin links a Drive.

### Paso 2: Asignar SOs

- Tabla con los items extraídos
- Botón **"Sugerir SOs con IA"** propone SOs basado en el código + descripción contra el GSO V4
- Toggle **"Solo aplicar sugerencias high confidence"** para auto-aplicar solo las seguras
- Editás manualmente lo que la IA no acertó
- Click **"Guardar"**

El sistema guarda los CIPLItems en la DB. Si alguna SO matchea con un `CompraSOItem` existente, **se auto-vincula** el CIPL a esa Compra.

### Paso 3: Fotos inspección (opcional)

Podés saltar este paso y subir fotos después desde `/comercial/fotos`.

### Paso 4: Control

Vista previa de los items con qty PI vs qty PL para detectar diferencias.

### Paso 5: Confirmado

- Muestra los drive links generados
- Botones para ir a Embarques o cargar otro PL

---

## 6. Subir fotos (`/comercial/fotos`)

Flow independiente para subir fotos a CIPLs ya cargados (cuando llegan después).

1. Andá a `/comercial/fotos` (o click "Subir fotos a un CIPL ya cargado" en `/comercial`)
2. Subí el Excel con fotos embebidas
3. La IA analiza cada foto y detecta:
   - **Tipo de etiqueta**: 📦 Caja o 🔧 Repuesto
   - **Caja**: extrae el cartonNo
   - **Repuesto**: extrae código, descripción, cantidad
4. El sistema matchea contra los CIPLs en DB:
   - Por carton → `CIPLItem.caseNo`
   - Por código → `CIPLItem.codeEan`
5. Revisás los matches en la tabla y corregís los que no acertó
6. Click en la miniatura para verla en grande
7. **Guardar fotos**

⚠️ **Warning de discrepancia**: si la IA leyó un cartonNo pero el item sugerido tiene otro número, la fila se marca en amber con el detalle.

---

## 7. PL Consolidado (`/comercial/consolidar`)

Para mandar instrucción al forwarder con varios PLs juntos.

### Cómo usar

1. Andá a `/comercial/consolidar` (o click "Exportar PL Consolidado" en `/comercial`)
2. Filtrá por tipo (Repuesto / Mercadería) y/o busca por ASN, PI, proveedor
3. Marcá los PLs que querés consolidar (checkbox o click en la fila)
4. **Atajos útiles:**
   - Click en un **PI Number** → selecciona todos los PLs con ese PI
   - **"Seleccionar todos los visibles"** → para masivo
5. Arriba la barra muestra: total ítems, qty, CBM, kg
   - ⚠ **Warning si PIs distintos**: avisa si mezclás PIs
6. Click **"Exportar Consolidado (N)"** → descarga `CIPL-Consolidado-NPLs-YYYY-MM-DD.xlsx`

El Excel incluye:
- Datos del proveedor (de la Compra vinculada)
- INCOTERM (de `CompraSOItem`)
- Drive link del PL
- PA (de "¿SKU está clasificado?" en GSO)
- Todos los items, una fila por cada uno

### Eliminar PLs

- **Botón 🗑 por fila**: borra ese PL (DB + Drive)
- **Botón "Eliminar N seleccionados"** arriba: borra varios juntos
- Confirmación inline en ambos casos
- Borra TODO: `CIPLItem`, `CIPLPhoto`, archivos de Drive

---

## 8. Compras

### `/compras` (listado)

Muestra todas las compras con: ID, PI, proveedor, fechas clave, total FOB.

### `/compras/nueva` (crear)

1. **Buscar SOs**: en el sheet GSO V4 (autocomplete). Click para agregar al lado derecho.
   - O modo **"Pegar SOs"**: pegás lista de SOs y el sistema las matchea
2. **Datos generales**: PI Number, notas
3. **Datos del proveedor**:
   - Nombre, dirección, contacto, teléfono, email
   - **Autocomplete inteligente**: al elegir un nombre del dropdown, los otros campos se completan solos con la data de la última compra de ese proveedor
4. **Guardar compra**

### `/compras/[id]` (detalle)

- Header con datos generales, total FOB, estado
- Tabla de SOs con: número, modelo, SKU, qty, FOB unit/total, incoterm, PA
- **Hitos del proceso**: timeline con los 12 hitos
  - Los manuales (Envío, Pago, etc.) son editables clickeando la fecha
  - Los Comex se completan solos cuando aparecen en la sheet
  - Los Auto (PL Cargado) se calculan al cargar el CIPL

---

## 9. Embarques

### `/embarques` (listado)

Muestra los embarques que vienen de la planilla principal de Comex.

**Default: solo embarques con CIPL cargado** (toggle arriba a la izquierda). Click el toggle para ver TODOS los embarques de Comex (incluidos sin CIPL).

Filtros:
- **Todos / En tránsito / Pendiente / Arribado / Sin tracking**
- Buscador por N° Embarque, SO o AWB

Ayuda lateral: **"¿Cómo se calcula el estado?"** explica las reglas.

### `/embarques/[id]` (detalle)

Header con: N° Embarque, estado, ETD/ETA, AWB, botón "Exportar CIPL consolidado".

**Hitos del proceso** (timeline arriba): de "Instrucción Category" en adelante.

Tabs:
- **Resumen**: KPIs del embarque + Datos de Comex (extras configurados) + Archivos en Drive
- **Ítems**: agrupados por ASN, con botón **"Eliminar PL"** por grupo
- **Control**: tabla con qty PL vs qty PI + estado de fotos
- **Fotos**: galería con lightbox + botón "Subir fotos"
- **Compras**: las compras vinculadas vía SO
- **Historial**: registro de cambios

### Exportar CIPL Consolidado del embarque

Click en el botón rojo "Exportar CIPL consolidado" del header → descarga Excel con todos los items del embarque.

Es lo mismo que `/comercial/consolidar` pero pre-seleccionado para ese embarque.

---

## 10. Tablero ejecutivo (Home)

URL: `/`

### KPIs principales (fila 1)

| KPI | Significado |
|---|---|
| Valor en tránsito | FOB de SOs en embarques activos + CBM en hint |
| Embarques activos | pendiente + en tránsito |
| Próximos 7 días | Embarques con ETA en próximos 7 días |
| Retrasados | Embarques con ETA pasada hace +5 días sin arribo a depósito |

### SLA por tipo (fila 2)

| KPI | Significado |
|---|---|
| SLA AIR | % AIR ≤ 30 días tránsito (ETD → Depósito) |
| SLA FCL | % FCL ≤ 65 días tránsito |
| SLA global | Ponderado por tipo |
| Tránsito promedio | días promedio ETD → Depósito |

### KPIs de proceso (fila 3)

| KPI | Significado |
|---|---|
| Lead time total | Promedio fechaPago → Arribo Depósito |
| Anticipación Comex | Promedio Instrucción Category → ETD |
| Demora vs plan | % arribados después de ETA original |
| Unidades del mes | Unidades arribadas al depósito este mes |

### Charts

1. **Próximos arribos**: bar chart por semana (próximas 4 semanas), hover muestra los N° de embarque
2. **Días promedio por etapa**: bar horizontal mostrando cuello de botella
3. **Embarques por mes**: cuántos ETD se generaron por mes (últimos 12)
4. **CBM arribado por mes**: throughput operativo (últimos 12)
5. **Tendencia discrepancias**: % de ítems con diferencia qty (últimos 6 meses)
6. **Distribución tipo de carga**: donut Repuesto vs Mercadería

### Bandeja de alertas + Últimos embarques

Al pie del tablero. Las alertas linkean al embarque correspondiente.

---

## 11. Búsqueda global (cmd+k)

Desde cualquier pantalla, apretá **`Cmd+K`** (Mac) o **`Ctrl+K`** (Win/Linux).

Busca en:
- **Embarques** (por N° o por SO contenido)
- **SOs** (en `CIPLItem.soPrincipal`)
- **ASNs**
- **Productos** (descripción / SKU / EAN)
- **Compras** (por PI o proveedor)

Click en cualquier resultado → navega al detalle.

`ESC` cierra el modal.

---

## 12. Tipos de transporte y SLA

El sistema parsea el prefijo del **N° de Embarque** para detectar el tipo:

| Prefijo | Tipo | SLA (días) |
|---|---|---|
| `AIR 176`, `AIR-001` | AIR | 30 |
| `FCL 2206`, `FCL-1744` | FCL | 65 |
| `LCL 50` | LCL | 65 |
| Cualquier otro | unknown | 30 (default conservador) |

⚠️ "Arribado" = **llegó al depósito final argentino** (campo `fechaArriboDeposito` en Comex). NO se considera arribado al llegar al WH HK / Airsea — esos son hitos intermedios.

Para agregar un nuevo prefijo (ej "AERO", "MAR"), avisar al admin para editar `detectTipoTransporte` en `app/lib/comex-internals.ts`.

---

## 13. Endpoints admin (diagnóstico)

Todos requieren acceso directo via URL (no hay UI, son endpoints de admin).

### `/api/admin/drive-health`
Verifica auth + folder + stats de DB. Devuelve cuántos CIPLs tienen drive link.

### `/api/admin/drive-test-upload`
Sube un archivo de prueba (~50 bytes) a Drive. Confirma end-to-end que la integración funciona.

### `/api/admin/validate-comex-sheet`
Lee la planilla principal y devuelve stats (SOs totales, embarques únicos, splits). Útil para detectar si Comex renombró una columna.

### `/api/admin/gso-headers`
Lista los headers actuales del Sheet GSO V4. Útil para verificar el nombre de "¿SKU está clasificado?" o cualquier otro campo.

---

## 14. Troubleshooting común

### Los embarques no aparecen / aparecen sin tracking

1. Verificar `/configuracion`: hay al menos una fuente habilitada y una marcada como ⭐ Principal.
2. Llamar `/api/admin/validate-comex-sheet` y revisar `errors`.
3. Si dice "Columna X no encontrada" → Comex renombró un header. Reasignar en `/configuracion`.

### Los hitos no se llenan en el detalle del embarque

- Verificar que la columna correspondiente (ETD, Arribo Depósito, etc.) esté mapeada al hito correcto en `/configuracion`.
- Las columnas con substring "deposito" se mapean automáticamente a `fechaArriboDeposito`.
- Verificar en `/configuracion/hitos` que el hito está habilitado para "Embarques".

### Los CIPLs no se vinculan a la Compra automáticamente

El sistema vincula `CIPLItem` con `Compra` si el `soPrincipal` matchea con algún `CompraSOItem.soNumber`.

Si no se vincula:
- Verificar que cargaste la Compra ANTES o si fue después, los nuevos CIPLs sí se autovinculan al crearlos.
- Para retroactivamente: hoy no hay endpoint de "re-link", se hace recargando el PL.

### Las fotos no aparecen en el panel después de subir

- Verificar el log de la consola del browser durante la subida.
- Llamar `/api/admin/drive-health` y revisar stats: `withDriveLink.excel/ci/pl` debería ser > 0 si subiste.
- Si dice 0 con muchos items totales, hay un problema de persistencia (avisar).

### El SLA está calculado mal

- Verificar el prefijo del N° de Embarque: si dice "AIR 176" pero el sistema lo trata como FCL, posible bug en `detectTipoTransporte`.
- Verificar que la fecha de Arribo Depósito está poblada en Comex (sin eso, no se computa el SLA).

### Drive no sube archivos

- Llamar `/api/admin/drive-test-upload`. Si devuelve `403 Service Accounts do not have storage quota`, la carpeta NO está en Shared Drive. Mover la carpeta a una Unidad Compartida y compartirla con la service account como "Administrador de contenido".

### El parser de CIPL Mercadería devuelve datos raros

- Verificar el prompt en `app/api/extract/route.ts`. Si DJI cambió el layout del PDF, puede que necesite ajuste.
- Probar con `/api/admin/gso-headers` para verificar el GSO V4 no cambió.

### "Service Accounts do not have storage quota"

Error de Google Drive al subir. Significa que la carpeta no está en Shared Drive. Mover la carpeta `Compras DJI` a una Unidad Compartida.

---

## Última actualización

Documento generado el 2026-05-28. Cualquier feature posterior va en commits subsiguientes — para historial completo: `git log --oneline`.
