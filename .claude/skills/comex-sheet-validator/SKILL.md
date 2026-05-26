---
name: comex-sheet-validator
description: Validar que la planilla de Comex tiene la estructura esperada y detectar cambios breaking (columnas renombradas, eliminadas, formato cambiado). Use cuando Comex cambió algo de la planilla, antes de un deploy, o si los embarques empezaron a mostrar errores.
---

# Comex Sheet Validator

## Cuándo usar

- El sistema empezó a mostrar errores tipo "Columna X no encontrada"
- El equipo de Comex avisó que cambió la planilla
- Antes de un deploy mayor (verificar que la integración sigue OK)
- Periodicamente (1 vez por semana idealmente)

## Cómo correrla

Hay un endpoint interno que valida la sheet contra la config actual:

```bash
# Local
curl -s http://localhost:3000/api/admin/validate-comex-sheet | jq

# Prod
curl -s https://panel-comprass.vercel.app/api/admin/validate-comex-sheet | jq
```

Si el endpoint no existe, crearlo (template abajo).

## Qué chequea

1. **Conectividad**: la URL de la planilla responde 200
2. **Columnas mapeadas existen**: `joinCol` y `embarqueCol` aparecen como headers
3. **Columnas extras configuradas existen**: cada `extraCols[i].header` aparece
4. **Filas con datos**: hay al menos 1 fila más allá de los headers
5. **Distribución de embarques**: cuenta SOs, embarques únicos, splits detectados

## Template del endpoint

Si no existe, crear `app/api/admin/validate-comex-sheet/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getComexConfig, fetchComexData } from '@/app/lib/comex'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const cfg = await getComexConfig()
  if (!cfg) {
    return NextResponse.json({ ok: false, error: 'Sin configuración' }, { status: 500 })
  }

  const data = await fetchComexData()

  const splitCount = Array.from(data.bySO.values()).filter(r => r.shipments.length > 1).length

  return NextResponse.json({
    ok: data.errors.length === 0,
    fetchedAt: data.fetchedAt,
    config: {
      url: cfg.url,
      sheetName: cfg.sheetName ?? null,
      joinCol: cfg.joinCol,
      embarqueCol: cfg.embarqueCol,
      extraColsConfigured: cfg.extraCols.length,
    },
    stats: {
      sosTotal: data.bySO.size,
      embarquesUnique: data.byEmbarque.size,
      sosWithSplit: splitCount,
      extraColumnsDetected: data.extraColumns.length,
    },
    errors: data.errors,
  })
}
```

## Cómo interpretar resultados

### Caso óptimo

```json
{
  "ok": true,
  "stats": {
    "sosTotal": 234,
    "embarquesUnique": 47,
    "sosWithSplit": 3,
    "extraColumnsDetected": 6
  },
  "errors": []
}
```

### Caso con problema

```json
{
  "ok": false,
  "errors": [
    "Columna \"N° Embarque\" no encontrada en la planilla",
    "Columna extra \"ETA\" no encontrada en la planilla"
  ]
}
```

Esto significa: Comex renombró/eliminó esas columnas. Acción:
1. Abrir `/configuracion` en el panel
2. "Previsualizar columnas" para ver headers actuales
3. Reasignar columnas SO y N° Embarque a los headers nuevos
4. Guardar

## Validación rápida sin endpoint

Si querés un check rápido por línea de comandos:

```bash
# Bajar la planilla como CSV y ver headers
CFG=$(curl -s https://panel-comprass.vercel.app/api/admin/comex-config)
# ... (depende si existe el endpoint /api/admin/comex-config; sino, leer desde DB)
```

## Anti-patrón

❌ **NO** ignorar warnings de "Aviso al leer la planilla Comex" en `/`. Significa que algo de la sheet cambió y los datos pueden estar desalineados.

✅ Cada vez que aparece ese aviso, correr el validator y revisar.
