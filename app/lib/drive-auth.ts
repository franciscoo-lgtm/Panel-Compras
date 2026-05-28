/**
 * Helpers para autenticar contra Google Drive con la service account.
 * Reutilizable desde /api/upload-drive y /api/admin/*, server actions, etc.
 */

function b64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlBytes(arr: Uint8Array): string {
  let s = ''
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]!)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Genera un access token usando la service account configurada en env vars.
 * Tira excepción si las env vars faltan o el auth falla.
 */
export async function getDriveAccessToken(): Promise<string> {
  const email  = process.env.GOOGLE_CLIENT_EMAIL
  const rawKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!email || !rawKey) {
    throw new Error('Drive credentials not configured (GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY)')
  }

  const pem      = rawKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '')
  const keyBytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  )

  const now    = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss:   email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  }))

  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(`${header}.${claims}`),
  )
  const jwt = `${header}.${claims}.${b64urlBytes(new Uint8Array(sigBytes))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Auth failed (${res.status}): ${txt.slice(0, 300)}`)
  }
  const { access_token } = await res.json() as { access_token: string }
  return access_token
}

/**
 * Extrae el file ID de un link de Drive. Acepta formatos:
 *   https://drive.google.com/file/d/FILE_ID/view
 *   https://drive.google.com/file/d/FILE_ID/view?usp=drivesdk
 *   https://drive.google.com/open?id=FILE_ID
 */
export function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url) return null
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m1) return m1[1]
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (m2) return m2[1]
  return null
}

/**
 * Borra un archivo de Drive por su file ID. No tira excepción si falla
 * (devuelve { ok: false, error }) para que el caller pueda recolectar
 * errores sin abortar el flow.
 */
export async function deleteDriveFile(
  fileId: string,
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    )
    if (res.status === 204) return { ok: true }
    if (res.status === 404) return { ok: true }   // ya no existe → tratamos como éxito
    const txt = await res.text()
    return { ok: false, error: `${res.status}: ${txt.slice(0, 200)}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
