---
name: anthropic-prompt-caching
description: Activar prompt caching en llamadas a Claude API para reducir costos ~75-90% en endpoints con prompts largos repetitivos (CIPL parser, suggest-sos, extract-photo-info). Use cuando agregás un endpoint nuevo que llama a Anthropic, o cuando notes que la factura está alta.
---

# Anthropic Prompt Caching

## Cuándo usar

- Endpoint con prompt instrucción **>1024 tokens** (típicamente ~3-5 párrafos)
- El mismo prompt se repite muchas veces (cada CIPL upload, cada foto, etc.)
- Solo el input variable cambia entre llamadas

Beneficios:
- **Cache write**: cuesta 1.25x el precio normal del input
- **Cache hit**: cuesta **0.10x** (90% más barato)
- Cache TTL: 5 minutos (se extiende con cada hit)
- Mínimo: el contenido cacheable debe tener ≥1024 tokens

## Cómo aplicar

### Patrón básico

Usar el wrapper `withCache` de `app/lib/anthropic.ts`:

```ts
import { callClaudeWithCache } from '@/app/lib/anthropic'

const result = await callClaudeWithCache({
  model: 'claude-haiku-4-5-20251001',
  systemPrompt: LONG_SYSTEM_PROMPT,  // cacheable, debe ser ≥1024 tokens
  userMessage: dynamicUserMessage,    // varía por request
  maxTokens: 1024,
})
```

El wrapper marca el `system` con `cache_control: { type: 'ephemeral' }`.

### Cuándo NO cachear

- Prompt corto (<1024 tokens) — no llega al mínimo
- Llamadas únicas (1 vez por mes) — no se aprovecha el cache
- Si el input variable se mezcla con el sistema en un solo bloque — primero refactorear

## Endpoints del proyecto que se benefician

| Endpoint | Status | Tokens system | Hits esperados |
|---|---|---|---|
| `/api/extract` (CIPL parser) | ✅ Cacheado | ~3000 | Alto (cada upload) |
| `/api/suggest-sos` | ✅ Cacheado | ~1500 | Alto |
| `/api/extract-photo-info` | ✅ Cacheado | ~600 | Bajo (prompt corto, no llega al mínimo) — usa caching solo si crece |

## Cómo medir el ahorro

La API de Anthropic devuelve métricas de caching en cada response:

```ts
const response = await client.messages.create({...})
console.log({
  inputTokens: response.usage.input_tokens,
  outputTokens: response.usage.output_tokens,
  cacheCreationInputTokens: response.usage.cache_creation_input_tokens,
  cacheReadInputTokens: response.usage.cache_read_input_tokens,
})
```

Loguear estas métricas cada N requests permite calcular el cache hit rate. Si <50% → el TTL de 5min no alcanza para tu volumen (considerar caching de 1 hora con `cache_control: { type: 'ephemeral', ttl: '1h' }`, en beta).

## Anti-patrón

❌ Cachear prompts donde la parte variable está MEZCLADA con la instrucción:

```ts
// MAL
const prompt = `Sos un asistente. Analizá este ítem: ${itemDescription}. Devolveme JSON.`
```

✅ Separar:

```ts
// BIEN
const SYSTEM = `Sos un asistente. Devolveme JSON.`  // cacheable
const USER = `Analizá este ítem: ${itemDescription}`  // dinámico
```

## Referencias

- Docs Anthropic: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Skill superpowers:claude-api tiene más patrones para Anthropic SDK
