'use server'

// Server-only GAS client. Never import in client components — use /api/erp/ instead.

function buildGasUrl(action: string, params: Record<string, string> = {}): string {
  const base = process.env.GAS_URL
  const key  = process.env.GAS_API_KEY
  if (!base || !key) throw new Error('GAS_URL y GAS_API_KEY no configurados en .env.local')
  const url = new URL(base)
  url.searchParams.set('apiKey', key)
  url.searchParams.set('action', action)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url.toString()
}

export async function gasGet<T = unknown>(
  action: string,
  params: Record<string, string> = {},
): Promise<T> {
  const res  = await fetch(buildGasUrl(action, params), { cache: 'no-store' })
  if (!res.ok) throw new Error(`GAS HTTP ${res.status}`)
  const json = await res.json() as { ok: boolean; data?: T; error?: string }
  if (!json.ok) throw new Error(json.error ?? 'Error en GAS')
  return json.data as T
}

export async function gasPost<T = unknown>(
  action: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(buildGasUrl(action), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    cache:   'no-store',
  })
  if (!res.ok) throw new Error(`GAS HTTP ${res.status}`)
  const json = await res.json() as { ok: boolean; data?: T; error?: string }
  if (!json.ok) throw new Error(json.error ?? 'Error en GAS')
  return json.data as T
}
