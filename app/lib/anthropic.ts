import Anthropic from '@anthropic-ai/sdk'

/**
 * Wrapper que invoca Claude con prompt caching en el system prompt.
 *
 * Beneficio: cache hits cuestan 90% menos en tokens. El system prompt debe ser
 * ≥1024 tokens para que Anthropic acepte el cache_control. TTL del cache: 5 min.
 *
 * Uso típico:
 *   const out = await callClaudeWithCache({
 *     model: 'claude-haiku-4-5-20251001',
 *     systemPrompt: LARGE_INSTRUCTION_BLOCK,
 *     userMessage: 'analizá este ítem específico',
 *     maxTokens: 512,
 *   })
 */
export async function callClaudeWithCache(opts: {
  model: string
  systemPrompt: string
  userMessage: string | Anthropic.MessageParam['content']
  maxTokens?: number
  apiKey?: string
}): Promise<{
  text: string
  usage: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens: number
    cacheReadInputTokens: number
  }
}> {
  const client = new Anthropic({ apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY })

  const userContent: Anthropic.MessageParam['content'] = typeof opts.userMessage === 'string'
    ? [{ type: 'text', text: opts.userMessage }]
    : opts.userMessage

  const response = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1024,
    system: [
      {
        type: 'text',
        text: opts.systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userContent }],
  })

  const firstBlock = response.content[0]
  const text = firstBlock?.type === 'text' ? firstBlock.text : ''

  const usage = response.usage as Anthropic.Usage & {
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }

  return {
    text,
    usage: {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    },
  }
}

/**
 * Helper para logear métricas de cache. Llamalo después de cada response.
 */
export function logCacheStats(endpoint: string, usage: {
  inputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}) {
  const totalInput = usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens
  const hitRate = totalInput > 0 ? (usage.cacheReadInputTokens / totalInput) : 0
  console.log(`[anthropic-cache] ${endpoint}`, {
    input: usage.inputTokens,
    cacheCreate: usage.cacheCreationInputTokens,
    cacheRead: usage.cacheReadInputTokens,
    hitRatePct: Math.round(hitRate * 100),
  })
}
