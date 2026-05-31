/**
 * Cache TTL en memoria para responses de Google Sheets CSV.
 *
 * Cada page load de /, /embarques, /compras hace HTTP a Google Sheets para
 * bajar el CSV completo (~MBs, ~500ms-2s). Sin cache, cada navegación
 * paga ese costo. Con un TTL corto en memoria, la mayoría de las requests
 * reusan el último fetch.
 *
 * Vive en el proceso del server. En Vercel Serverless, cada cold start
 * arranca con cache vacío, pero las requests subsiguientes del mismo
 * lambda reusan. En warm lambdas con tráfico continuo, el hit rate es alto.
 *
 * No se invalida explícitamente — confía en el TTL. Si Comex modifica la
 * sheet, los datos viejos viven a lo sumo 60 segundos.
 */

type CacheEntry = {
  value: string
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

const DEFAULT_TTL_MS = 60_000  // 60 segundos

/**
 * Fetch con cache TTL. Si hay un valor cacheado y vigente, lo devuelve
 * sin hacer la request. Si no, hace fetch, cachea, devuelve.
 *
 * `key` puede ser la URL del CSV (default = url). Si pasás una key
 * distinta, podés dedupear requests a la misma URL con diferente sheet.
 */
export async function cachedFetchText(
  url: string,
  opts: { ttlMs?: number; key?: string } = {},
): Promise<string> {
  const key = opts.key ?? url
  const now = Date.now()

  const hit = cache.get(key)
  if (hit && hit.expiresAt > now) return hit.value

  // Cold or expired: refetch.
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Fetch ${url}: HTTP ${res.status}`)
  const text = await res.text()

  cache.set(key, {
    value: text,
    expiresAt: now + (opts.ttlMs ?? DEFAULT_TTL_MS),
  })

  return text
}

/**
 * Invalida una key específica (útil después de un write en la sheet desde
 * el panel). Hoy no se usa porque el panel solo lee CSVs, pero queda
 * disponible.
 */
export function invalidateCsv(key: string): void {
  cache.delete(key)
}

/** Solo para tests / debugging. */
export function clearCsvCache(): void {
  cache.clear()
}
