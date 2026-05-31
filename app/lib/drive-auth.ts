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

// ─── Folder lookup / create ─────────────────────────────────────────────────

export async function driveFindOrCreateFolder(
  token: string,
  name: string,
  parentId: string,
): Promise<string> {
  const safe = name.replace(/'/g, "\\'")
  const q   = `name='${safe}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`

  const lookupRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!lookupRes.ok) throw new Error(`Drive find folder "${name}": ${lookupRes.status}`)
  const lookupData = await lookupRes.json() as { files?: Array<{ id: string }> }
  const existing = lookupData.files?.[0]?.id
  if (existing) return existing

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })
  if (!createRes.ok) throw new Error(`Drive create folder "${name}": ${createRes.status}`)
  const created = await createRes.json() as { id?: string }
  if (!created.id) throw new Error(`Drive create folder "${name}": sin id`)
  return created.id
}

// ─── Upload de bytes (foto, etc) ────────────────────────────────────────────

export type DriveUploadResult = {
  id: string
  webViewLink: string        // página HTML de Drive (ver en navegador)
  thumbnailUrl: string       // URL de imagen directa (para <img src>, requiere makePublic)
}

/**
 * Sube un buffer (típicamente una foto JPEG) a una carpeta de Drive y
 * opcionalmente lo hace público (anyone con link puede leerlo) para
 * que se pueda renderear directamente en <img src>. Retorna el id +
 * el link de página + la URL de thumbnail.
 */
export async function driveUploadBytes(
  token: string,
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
  parentId: string,
  opts: { makePublic?: boolean } = {},
): Promise<DriveUploadResult> {
  const enc      = new TextEncoder()
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const meta     = JSON.stringify({ name: fileName, parents: [parentId] })

  const p1h = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`)
  const p1b = enc.encode(meta)
  const p2h = enc.encode(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`)
  const end = enc.encode(`\r\n--${boundary}--`)

  const body = new Uint8Array(p1h.length + p1b.length + p2h.length + bytes.length + end.length)
  let off = 0
  body.set(p1h, off); off += p1h.length
  body.set(p1b, off); off += p1b.length
  body.set(p2h, off); off += p2h.length
  body.set(bytes, off); off += bytes.length
  body.set(end, off)

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true',
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  )
  if (!uploadRes.ok) {
    const txt = await uploadRes.text()
    throw new Error(`Drive upload "${fileName}" failed (${uploadRes.status}): ${txt.slice(0, 200)}`)
  }
  const data = await uploadRes.json() as { id?: string; webViewLink?: string }
  if (!data.id) throw new Error(`Drive upload "${fileName}": sin id en response`)

  if (opts.makePublic) {
    // Hacer el archivo legible por "anyone with link". Sin esto, las URLs
    // de thumbnail no se cargan en navegadores sin sesión Google.
    const permRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${data.id}/permissions?supportsAllDrives=true`,
      {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      }
    )
    if (!permRes.ok) {
      const txt = await permRes.text()
      console.warn(`[drive] makePublic falló para ${data.id}: ${permRes.status} ${txt.slice(0, 100)}`)
    }
  }

  return {
    id: data.id,
    webViewLink: data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${data.id}&sz=w1600`,
  }
}

/**
 * Decodifica un dataUrl tipo "data:image/jpeg;base64,..." a buffer + mime.
 * Retorna null si el formato no es reconocido.
 */
export function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) return null
  const mimeType = m[1] ?? 'application/octet-stream'
  const base64 = m[2] ?? ''
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { bytes, mimeType }
  } catch {
    return null
  }
}
