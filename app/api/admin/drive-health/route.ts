import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Diagnóstico de la integración con Google Drive.
 *
 * Verifica:
 * 1. Que las 3 env vars estén presentes
 * 2. Que el auth contra Google funcione (intenta obtener access_token)
 * 3. Que la carpeta root configurada exista y sea accesible
 * 4. Cuántos CIPLItems en DB tienen drive links
 */
export async function GET() {
  const issues: { severity: 'error' | 'warn'; msg: string }[] = []

  // 1. Env vars
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  const email  = process.env.GOOGLE_CLIENT_EMAIL
  const key    = process.env.GOOGLE_PRIVATE_KEY

  if (!rootId) issues.push({ severity: 'error', msg: 'GOOGLE_DRIVE_ROOT_FOLDER_ID falta' })
  if (!email)  issues.push({ severity: 'error', msg: 'GOOGLE_CLIENT_EMAIL falta' })
  if (!key)    issues.push({ severity: 'error', msg: 'GOOGLE_PRIVATE_KEY falta' })

  if (!rootId || !email || !key) {
    return NextResponse.json({ ok: false, stage: 'env', issues })
  }

  if (!key.includes('BEGIN PRIVATE KEY')) {
    issues.push({ severity: 'warn', msg: 'GOOGLE_PRIVATE_KEY no parece tener formato PEM válido (le falta "BEGIN PRIVATE KEY")' })
  }
  if (!key.includes('\\n') && !key.includes('\n')) {
    issues.push({ severity: 'warn', msg: 'GOOGLE_PRIVATE_KEY no tiene saltos de línea (ni \\n escapado ni newline real). Posible formato inválido.' })
  }

  // 2. Auth contra Google
  let token: string
  try {
    const rawKey = key.replace(/\\n/g, '\n')
    const pem    = rawKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '')
    if (!pem) {
      return NextResponse.json({
        ok: false, stage: 'auth',
        error: 'GOOGLE_PRIVATE_KEY parsed to empty PEM body. Probable formato corrupto.',
        issues,
      })
    }
    const keyBytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0))
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8', keyBytes,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign'],
    )
    const now = Math.floor(Date.now() / 1000)
    const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    const b64urlBytes = (arr: Uint8Array) => {
      let s = ''
      for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]!)
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    }
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claims = b64url(JSON.stringify({
      iss: email, scope: 'https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now,
    }))
    const sigBytes = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5', cryptoKey,
      new TextEncoder().encode(`${header}.${claims}`),
    )
    const jwt = `${header}.${claims}.${b64urlBytes(new Uint8Array(sigBytes))}`
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    })
    if (!res.ok) {
      const txt = await res.text()
      return NextResponse.json({
        ok: false, stage: 'auth',
        error: `Google auth devolvió ${res.status}: ${txt.slice(0, 400)}`,
        issues,
      })
    }
    const json = await res.json() as { access_token?: string }
    if (!json.access_token) {
      return NextResponse.json({ ok: false, stage: 'auth', error: 'No access_token en respuesta', issues })
    }
    token = json.access_token
  } catch (err) {
    return NextResponse.json({
      ok: false, stage: 'auth',
      error: err instanceof Error ? err.message : String(err),
      issues,
    })
  }

  // 3. Folder root accesible
  let rootFolderName: string | null = null
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${rootId}?fields=id,name,mimeType&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) {
      const txt = await res.text()
      return NextResponse.json({
        ok: false, stage: 'folder-access',
        error: `Drive devolvió ${res.status} al leer la carpeta root: ${txt.slice(0, 400)}`,
        hint: res.status === 404
          ? 'La carpeta no existe o la service account no la tiene compartida. Compartila con el email de la service account.'
          : res.status === 403
            ? 'La service account no tiene permiso. Compartí la carpeta con el GOOGLE_CLIENT_EMAIL con permiso "Editor".'
            : null,
        issues,
      })
    }
    const data = await res.json() as { id: string; name: string; mimeType: string }
    rootFolderName = data.name
    if (data.mimeType !== 'application/vnd.google-apps.folder') {
      issues.push({ severity: 'warn', msg: `GOOGLE_DRIVE_ROOT_FOLDER_ID no es una carpeta (mimeType=${data.mimeType})` })
    }
  } catch (err) {
    return NextResponse.json({
      ok: false, stage: 'folder-access',
      error: err instanceof Error ? err.message : String(err),
      issues,
    })
  }

  // 4. Stats de DB
  const [totalItems, withExcel, withCi, withPl] = await Promise.all([
    prisma.cIPLItem.count(),
    prisma.cIPLItem.count({ where: { driveLinkExcel: { not: null } } }),
    prisma.cIPLItem.count({ where: { driveLinkCi:    { not: null } } }),
    prisma.cIPLItem.count({ where: { driveLinkPl:    { not: null } } }),
  ])

  return NextResponse.json({
    ok: true,
    auth: 'OK',
    folder: { id: rootId, name: rootFolderName },
    serviceAccount: email,
    db: {
      totalCIPLItems: totalItems,
      withDriveLink: {
        excel: withExcel,
        ci: withCi,
        pl: withPl,
      },
      anyLinkPct: totalItems === 0 ? 0 : Math.round(((withExcel + withCi + withPl) / (totalItems * 3)) * 100),
    },
    issues,
  })
}
