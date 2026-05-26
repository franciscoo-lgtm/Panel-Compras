---
name: prisma-db-push-safe
description: Aplicar cambios al schema de Prisma de forma segura. Use SIEMPRE antes de correr `npx prisma db push` para no romper datos en producción (la DB es compartida entre preview y prod).
---

# Prisma db push — checklist seguro

Este proyecto usa el workflow de **`db push`** (no archivos de migration). Eso significa que cualquier cambio en `prisma/schema.prisma` se aplica directo a la DB con `npx prisma db push`. La DB de Neon es **la misma** entre preview y producción → un error de schema impacta a todos al instante.

## Checklist obligatorio antes de `db push`

### 1. Hacer dry-run con `migrate diff`

```bash
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

Inspect el SQL que va a correr. Buscar:
- `ALTER TABLE ... DROP COLUMN` → **PÉRDIDA DE DATOS**
- `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` sin default → **falla si hay rows con NULL**
- `DROP TABLE` → **PÉRDIDA TOTAL**

### 2. Decisión por tipo de cambio

| Tipo | Acción |
|---|---|
| Agregar columna opcional (`?`) | Seguro, push directo |
| Agregar columna con `@default(...)` | Seguro |
| Agregar columna NOT NULL sin default | **Frenar**. Hacer en 2 pasos: agregar opcional → backfill → SET NOT NULL |
| Renombrar columna | **Frenar**. `db push` lo trata como DROP + ADD (pierde datos). Usar SQL manual. |
| Eliminar columna | Confirmar que no hay código que la lea. Backup primero. |
| Cambiar tipo de columna | **Frenar**. Hacer manual con `CAST`. |

### 3. Backup de Neon antes de cambios riesgosos

Neon tiene branching gratis. Antes de cambios destructivos:

```bash
# En Neon dashboard:
# Branches → Create branch → desde main → llamarla "pre-<cambio>-YYYYMMDD"
```

Si rompe algo, podés revertir cambiando la `DATABASE_URL` al branch.

### 4. Push y regenerar client

```bash
npx prisma db push
npx prisma generate
```

### 5. Verificar tsc

```bash
npx tsc --noEmit
```

El client regenerado puede cambiar tipos. Si hay errores, ajustar el código que los consume.

## Patrones comunes

### Agregar campo opcional

```prisma
model CIPLItem {
  // ...
  newField String?    // ← agregás esto
}
```

`db push` corre `ALTER TABLE ADD COLUMN ... DEFAULT NULL`. Seguro siempre.

### Agregar campo con default

```prisma
model CIPLItem {
  // ...
  controlReviewed Boolean @default(false)
}
```

Seguro: existing rows reciben `false`.

### Eliminar campo (Fase 1 lo hizo con tracking fields)

1. Asegurarse que el código no lo lee (`grep` exhaustivo)
2. Backup
3. Quitar del schema
4. `db push` → confirma DROP COLUMN

### Renombrar (NO usar db push)

Usar SQL directo:

```sql
ALTER TABLE "CIPLItem" RENAME COLUMN "oldName" TO "newName";
```

Luego actualizar el schema con el nuevo nombre. `db push` ahora no detecta cambios.

## Casos del proyecto

- **Fase 1**: removió tracking fields (`etd`, `eta`, etc.) — fue destructivo, hicimos backup
- **Fase 2**: agregó 5 campos de control (`controlReviewed`, etc.) — todos opcionales, push directo

## Anti-patrón

❌ **NUNCA**: ir directo a `npx prisma db push` sin revisar el diff primero. Pérdida de datos silenciosa.

✅ **SIEMPRE**: `migrate diff` → leer SQL → decidir → push.
