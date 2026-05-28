import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Sube un archivo de prueba minúsculo a Drive. Confirma end-to-end que el
 * endpoint /api/upload-drive funciona. Devuelve el link si OK, o el error
 * detallado si no.
 *
 * Uso: GET /api/admin/drive-test-upload
 */
export async function GET() {
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  const email  = process.env.GOOGLE_CLIENT_EMAIL
  const key    = process.env.GOOGLE_PRIVATE_KEY

  if (!rootId || !email || !key) {
    return NextResponse.json({ ok: false, stage: 'env', error: 'Faltan env vars' })
  }

  try {
    // 1. Auth
    const rawKey = key.replace(/\\n/g, '\n')
    const pem    = rawKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '')
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
    const tokRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    })
    if (!tokRes.ok) {
      const txt = await tokRes.text()
      return NextResponse.json({ ok: false, stage: 'auth', error: `${tokRes.status}: ${txt.slice(0, 400)}` })
    }
    const { access_token: token } = await tokRes.json() as { access_token: string }

    // 2. Crear carpeta "_TEST" dentro del root
    const folderName = `_TEST_${new Date().toISOString().slice(0, 19)}`
    const folderRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootId],
      }),
    })
    if (!folderRes.ok) {
      const txt = await folderRes.text()
      return NextResponse.json({
        ok: false, stage: 'create-folder',
        error: `${folderRes.status}: ${txt.slice(0, 400)}`,
        hint: 'La service account no puede crear carpetas en el root. ¿Compartiste el folder con permiso "Editor" (no solo "Viewer")?',
      })
    }
    const folder = await folderRes.json() as { id: string }

    // 3. Subir un archivo de prueba (texto simple, ~50 bytes)
    const testContent = `test upload ${new Date().toISOString()}`
    const enc = new TextEncoder()
    const boundary = `boundary_${Date.now()}`
    const meta = JSON.stringify({
      name: `test-${Date.now()}.txt`,
      parents: [folder.id],
    })
    const fileData = enc.encode(testContent)

    const p1h = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`)
    const p1b = enc.encode(meta)
    const p2h = enc.encode(`\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n`)
    const end = enc.encode(`\r\n--${boundary}--`)

    const body = new Uint8Array(p1h.length + p1b.length + p2h.length + fileData.length + end.length)
    let off = 0
    body.set(p1h, off); off += p1h.length
    body.set(p1b, off); off += p1b.length
    body.set(p2h, off); off += p2h.length
    body.set(fileData, off); off += fileData.length
    body.set(end, off)

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    )
    if (!uploadRes.ok) {
      const txt = await uploadRes.text()
      return NextResponse.json({
        ok: false, stage: 'upload-file',
        error: `${uploadRes.status}: ${txt.slice(0, 500)}`,
        folderCreated: { id: folder.id, name: folderName },
      })
    }
    const uploaded = await uploadRes.json() as { id: string; webViewLink: string }

    return NextResponse.json({
      ok: true,
      message: '✅ Upload de prueba exitoso',
      folder: { id: folder.id, name: folderName },
      file:   { id: uploaded.id, link: uploaded.webViewLink },
      hint: 'Si esto funciona pero los CIPLs siguen sin tener link, el problema es el flow del frontend (los links se pierden entre Step 1 y guardarCIPL).',
    })
  } catch (err) {
    return NextResponse.json({
      ok: false, stage: 'exception',
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 800) : undefined,
    })
  }
}
