---
name: dji-domain
description: Domain knowledge for DJI Argentina imports. Use when working with ASN/SO formats, CIPL Excel layouts, dangerous goods detection, or interpreting AI extraction results from photos and CIPL parsing.
---

# DJI Argentina Imports — Domain Knowledge

Use this skill to avoid guessing about business conventions. Reference these formats and rules whenever working with parsing, matching, or AI prompts.

## Códigos y formatos

### ASN (Advanced Shipment Notice)
- Identifica un PL físico de DJI (un envío real con cajas físicas)
- Formato: **3 letras + 6 dígitos + 4 alfanuméricos**
- Ejemplos: `JDS260401LFUN`, `JDS260428M24N`, `HYS260413X5T2`
- Regex: `[A-Z]{3}\d{6}[A-Z0-9]{4}`
- En el sistema: campo `CIPLItem.asn`

### N° Embarque
- **Código interno de Comex**, NO es lo mismo que el ASN
- Agrupa SOs que viajan juntas (un embarque puede contener varios PLs/ASNs)
- Formato libre (típicamente `EMB-XXX`, ej `EMB-045`)
- Viene de la columna del Sheet de Comex configurada en `/configuracion`
- Una misma SO puede aparecer en múltiples embarques (split shipment) — el Sheet usa **listas coma-separadas paralelas** en N° Embarque + ETD + ETA

### SO (Sales Order)
- Identifica una orden de compra interna
- Formato variable: `SO-XXXX`, `SOXXXXX`, `AR.SOXXXXX`, etc.
- En el sistema: `CIPLItem.soPrincipal`, `CompraSOItem.soNumber`
- Normalizar siempre a UPPERCASE antes de comparar

### Carton Number / Case Number
- Identifica una caja física dentro de un PL
- Dos formatos comunes:
  - **Corto**: `1/24`, `5/12` (X de Y total)
  - **Barcode largo**: `73122612604290000563` (~17-20 dígitos numéricos)
- En el sistema: `CIPLItem.caseNo`
- Aparece en etiquetas con texto: `Ctn N°`, `Carton N°`, `CTN`, `箱号`, `(CarTon No)`

### Product Code / SKU
- Códigos de producto DJI
- Formato típico: `CP.MA.XXXXXXX.XX`, `CP.WS.XXXXXXX.XX`
- En el sistema: `CIPLItem.sku`, `CIPLItem.codeEan`

### PI Number (Performa Invoice)
- Identifica una factura proforma
- En el sistema: `CIPLItem.piNo`, `Compra.piNo`
- Si un Excel mezcla dos PIs distintos, hay que separarlos en grupos

## Tipos de carga

### Repuesto
- Partes y accesorios
- Suele venir en CIPLs con múltiples SOs distintas en el mismo Excel
- Procesamiento en `/comercial`: tipo "Repuesto", parser usa el path Excel→texto

### Mercadería
- Producto terminado (drones, cámaras)
- CIPLs más estructurados, generalmente 1 PI por archivo
- Procesamiento en `/comercial`: tipo "Mercaderia", parser usa CI + PL como texto

## Dangerous goods

Marcar `isDangerousGood = true` si la descripción del ítem contiene cualquiera de estos keywords (case-insensitive):
- `battery`, `batteries`
- `lithium`, `lipo`, `lifepo4`
- `energía portátil`, `power station`

## Layouts de Excel de DJI (parser CIPL)

### Variaciones de headers comunes

| Campo lógico | Headers comunes que aparecen |
|---|---|
| ASN | "ASN", "Shipment No", "Reference", "ASN Number", "ASN#" |
| Qty | "Quantity", "Total Qty", "Units", "CTNS x QTY" |
| Description | "Item Description", "Product", "Goods Description", "Description" |
| EAN | "Barcode", "Code EAN", "EAN-13", "EAN" |
| SO | "Sales Order", "SO", "Order Number" |
| Carton | "Ctn N°", "Carton N°", "CTN", "Box No" |

### Auto-detección por contenido

- Si una columna sin header tiene valores con formato ASN (3+6+4) → es ASN
- Si una celda tiene formato `CP.XX.XXXXXXX.XX` → es SKU aunque el header diga otra cosa

## Etiquetas de fotos (inspección)

### Tipos a distinguir
- **Box label** (etiqueta de caja): muestra el `Ctn N°` y un barcode con el carton number. Suele tener el ASN del PL impreso.
- **Part label** (etiqueta de repuesto): muestra el código del producto, descripción, cantidad. NO tiene "Ctn N°".

### Reglas de match (después de IA)
1. **Box** → match por `CIPLItem.caseNo == cartonNo` extraído de la foto
2. **Part** con código → match por `CIPLItem.codeEan == partCode` extraído
3. **Part** sin código pero con descripción → fuzzy match contra `CIPLItem.description`
4. Fallback: por ASN+SO si están presentes en la etiqueta

## Configuración de Comex (Sheet)

La planilla de Comex es **una fila por SO**. Si una SO va en varios embarques (split), la fila tiene listas coma-separadas en N° Embarque, ETD, ETA, AWB **posicionalmente sincronizadas**:

```
SO         | N° Embarque         | ETD          | ETA          | AWB
SO-1003    | EMB-045,EMB-046    | 15/06,20/06  | 28/06,02/07  | 235-1234567,—
```

El parser en `app/lib/comex.ts` (`expandRowToShipments`) separa esto en N shipments por SO.

## Estados de embarque (computados)

Derivados de fechas en la planilla Comex (`deriveStatus` en `app/lib/embarques.ts`):

- `arribado` — hay arribo WH cargado
- `en-transito` — ETD pasó pero no hay arribo
- `pendiente` — ETD aún no pasó
- `desconocido` — no hay ETD ni arribo

Prioridad al agregar entre SOs del mismo embarque: `arribado > en-transito > pendiente > desconocido` (constante `ESTADO_PRIORITY`).

## Roles del sistema

| Rol | Permisos |
|---|---|
| `comercial` | Cargar CIPLs, asignar SOs, editar Control, exportar |
| `comex` | Configuración de planilla, ver todo, marcar revisado |
| `admin` | Todo + delete |

Hoy el stub en `app/lib/roles.ts` devuelve siempre `admin` hasta que se wire NextAuth.

## Fórmulas y umbrales

- **SLA cumplimiento**: % de embarques arribados con `(ETA - ETD) ≤ 21 días`
- **Alerta crítica**: ETA pasada hace más de N días sin arribo cargado
- **Alerta info**: ETA dentro de los próximos 7 días
- **Cálculo de diferencia qty**: `effectiveQty(item) - item.qPi` donde `effectiveQty = controlManualQty ?? qty`
