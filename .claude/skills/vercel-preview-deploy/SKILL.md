---
name: vercel-preview-deploy
description: Crear y manejar preview deploys de Vercel por rama o por cambio sin pisar producción. Use cuando vayas a tocar algo que necesita validación antes de mergear, especialmente cambios en /comercial, /embarques detail, o APIs con IA.
---

# Vercel Preview Deploys

## Cuándo usar

Antes de mergear a `main`, especialmente cuando los cambios afectan:
- Server actions con payloads grandes (riesgo de body limit)
- Llamadas a Anthropic (riesgo de costos / timeouts)
- Schema Prisma (cambios destructivos)
- Cualquier UI nueva que el equipo va a usar

Si el cambio es trivial (rename, typo, fix de tipos) → no hace falta preview.

## Flujo recomendado

### 1. Crear branch local

```bash
git checkout -b feature/<nombre>
# ... hacer cambios + commits ...
```

### 2. Deploy preview

```bash
npx vercel deploy --yes
```

Sin `--prod`. Devuelve una URL única tipo `panel-comprass-abc123-fran-obrien-s-projects.vercel.app`.

### 3. Validar en la URL preview

- Verificá que la página carga
- Si el cambio toca DB, no toca producción (la DB sí es compartida, ojo)
- Probá el flow específico afectado

### 4. Mergear y promover

Si todo bien:

```bash
git checkout main
git merge feature/<nombre>
git push
npx vercel deploy --prod --yes
```

## Variables importantes

- Los preview deploys usan **la misma DB de Neon** que producción
- Las API keys (`ANTHROPIC_API_KEY`, etc.) están compartidas
- Esto significa que un bug en migration **rompe prod también**, incluso desde preview

## Cuando NO usar preview

- Schema changes destructivos → primero hacer backup de Neon, recién después tocar nada
- Cambios que dependen de env vars nuevas → setearlas en Vercel antes del preview

## Mantenimiento

Cada N días, listar deploys viejos y borrar los preview obsoletos:

```bash
npx vercel ls --scope fran-obrien-s-projects | head -20
# Identificar URLs viejas que ya no se necesitan
npx vercel rm <deployment-url> --yes
```
