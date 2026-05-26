---
name: smoke-test-playwright
description: Correr smoke tests automatizados con Playwright contra producción o local. Use antes de deploys mayores para validar que las rutas críticas no se rompieron, o cuando querés reproducir un bug que aparece en navegador real.
---

# Smoke Test (Playwright)

Playwright ya está en `devDependencies`. Tests viven en `tests/smoke/`.

## Cómo correr

### Contra producción
```bash
SMOKE_BASE_URL=https://panel-comprass.vercel.app npm run test:smoke
```

### Contra local (asume dev server corriendo)
```bash
npm run dev &  # en otra terminal
npm run test:smoke
```

### Solo un test
```bash
npx playwright test tests/smoke/home.spec.ts
```

### Modo debug con UI visible
```bash
npx playwright test --headed --debug
```

## Qué cubren los smoke tests

**No** son tests unitarios. Son walks por las rutas críticas que detectan crashes y errores 500:

| Test | Qué valida |
|---|---|
| `home.spec.ts` | `/` carga sin 500, los 4 KPI cards aparecen, charts renderizan |
| `embarques.spec.ts` | `/embarques` lista carga, filtros funcionan, click en fila abre detalle, las 6 tabs son visibles |
| `comercial.spec.ts` | `/comercial` stepper aparece, link a `/comercial/fotos` funciona |
| `configuracion.spec.ts` | `/configuracion` carga, form es interactivo |
| `cmdk.spec.ts` | Ctrl+K abre el modal, escribir query trae resultados |

## Cómo escribir un smoke test nuevo

```ts
// tests/smoke/mi-flow.spec.ts
import { test, expect } from '@playwright/test'

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'

test('mi flow crítico no crashea', async ({ page }) => {
  await page.goto(`${BASE}/mi-ruta`)
  await expect(page.locator('h1')).toBeVisible()
  // No 500
  const resp = await page.request.get(`${BASE}/mi-ruta`)
  expect(resp.status()).toBe(200)
})
```

## Qué NO testear acá

- Lógica de negocio compleja (usar vitest, skill `panel-testing`)
- Server actions individuales (test con vitest mockeando prisma)
- Animaciones, hover states (no aportan, son flaky)

## Cuándo correrlos

- **Antes de deploy a prod**: si es un cambio mayor (>3 archivos modificados)
- **Después de deploy a prod**: como verificación que todo arrancó OK
- **Periódico (cron diario)**: detecta breakage por cambios externos (Comex sheet renombrada, API key vencida)

## Anti-patrón

❌ Smoke test que valida pixel-perfect (qué color tiene un botón)
❌ Smoke test que depende de datos específicos en la DB ("hay un embarque EMB-045") — frágil
❌ Smoke test acoplado al lenguaje de UI ("aparece texto 'Embarques activos'") — cambia y rompe

✅ Validar que el árbol DOM existe, que no hay 500, que el flow llega al final.

## Integración futura

Cuando tengas más volumen, considerá:
- GitHub Actions: correr smoke después de cada deploy
- Sentry para capturar errores en prod además de los smoke tests
