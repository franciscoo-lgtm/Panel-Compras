---
name: panel-testing
description: Correr y extender la suite de tests unitarios del proyecto (vitest). Use cuando agregás/modificás funciones puras en `app/lib/` (comex parser, embarques builder, photo matching, dashboard helpers) — esos tienen lógica de negocio crítica que debe tener tests.
---

# Panel Testing (vitest)

## Setup

El proyecto usa **vitest** para tests unitarios de funciones puras. Configuración en `vitest.config.ts`. Tests en `tests/unit/**/*.test.ts`.

## Comandos

```bash
# Correr toda la suite
npm test

# Watch mode (re-corre cuando cambian archivos)
npm run test:watch

# Solo un archivo
npx vitest run tests/unit/comex-parser.test.ts

# Coverage
npm run test:coverage
```

## Qué SÍ testear

Tests son baratos y de alto valor en funciones puras de `app/lib/`:

- **`comex.ts`**: `splitCell`, `expandRowToShipments`, `parseCSVRow` — parsers críticos
- **`embarques.ts`**: `deriveStatus`, `parseDateLoose`, `pickField` — lógica de status
- **`photo-actions.ts`**: `matchPhotosToItems`, `fuzzyScore` — matching es complejo
- **`dashboard.ts`**: `monthKey`, agregaciones de KPIs
- **`comex.ts` extras**: cualquier helper que toque CSV/parsing

## Qué NO testear (no vale la pena)

- Server components (son thin wrappers)
- Client components (mejor smoke test con Playwright, ver skill `smoke-test-playwright`)
- Server actions que solo hacen un `prisma.xxx.update()` simple
- Prompts de IA (la respuesta es no determinística; sí testear el PARSER de la respuesta)

## Cómo escribir un test

```ts
// tests/unit/comex-parser.test.ts
import { describe, it, expect } from 'vitest'
import { expandRowToShipments } from '@/app/lib/comex-internals'  // exportar lo que se necesite

describe('expandRowToShipments', () => {
  it('splits N° Embarque comma-separated with parallel ETD', () => {
    const errors: string[] = []
    const result = expandRowToShipments(
      'EMB-045,EMB-046',
      [
        { fieldKey: 'etd', raw: '15/06/25,20/06/25' },
        { fieldKey: 'eta', raw: '28/06/25,02/07/25' },
      ],
      errors,
      'SO-1001',
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      embarqueNo: 'EMB-045',
      extras: { etd: '15/06/25', eta: '28/06/25' },
    })
    expect(result[1].embarqueNo).toBe('EMB-046')
    expect(errors).toHaveLength(0)
  })

  it('replicates single value when N° Embarque has more splits than other column', () => {
    const errors: string[] = []
    const result = expandRowToShipments(
      'EMB-A,EMB-B,EMB-C',
      [{ fieldKey: 'awb', raw: '235-1234567' }],  // single AWB
      errors,
      'SO-X',
    )
    expect(result).toHaveLength(3)
    expect(result.every(s => s.extras.awb === '235-1234567')).toBe(true)
  })
})
```

## Convenciones

- 1 file de test por módulo (`tests/unit/<module>.test.ts`)
- Usar `describe` para agrupar por función
- Casos: happy path + edge cases (null, empty, malformed)
- Para Prisma: mockear con `vi.mock('@/lib/prisma', () => ({...}))` o testear con DB temporal

## Anti-patrones

❌ Tests de integración que dependen de la DB real → flaky, lentos
❌ Snapshot tests de JSX → ruidosos, no aportan
❌ Mockear todo en server actions → mejor extraer la lógica a una función pura testeable

## Cuando un test falla

Antes de cambiar el test:
1. ¿El test estaba bien y el código lo rompió? → arreglar código
2. ¿El test estaba mal y el código nuevo es correcto? → arreglar test
3. ¿Es flaky (pasa a veces)? → revisar dependencias de tiempo/orden

Usá `superpowers:systematic-debugging` si el bug no es obvio.

## Coverage target

No obsesionarse con %. Apuntar a:
- 80%+ en `app/lib/`
- 0% en `app/**/page.tsx` (no hace falta)
- Bugs reales que descubrió la suite > coverage abstracto
