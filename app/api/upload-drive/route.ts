export const runtime    = 'edge'
export const maxDuration = 25

// ─── Types ────────────────────────────────────────────────────────────────────

type DriveLinks = { excel: string | null; ci: string | null; pl: string | null }

// ─── Base64url helpers ────────────────────────────────────────────────────────

function b64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlBytes(arr: Uint8Array): string {
  let s = ''
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]!)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ─── Google Service Account → Access Token (Web Crypto, edge-safe) ───────────

async function getAccessToken(): Promise<string> {
  const email  = process.env.GOOGLE_CLIENT_EMAIL!
  const rawKey = process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n')

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
  if (!res.ok) throw new Error(`Token error: ${await res.text()}`)
  const { access_token } = await res.json() as { access_token: string }
  return access_token
}

// ─── Drive helpers ────────────────────────────────────────────────────────────

async function driveFindFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const safe = name.replace(/'/g, "\\'")
  const q    = `name='${safe}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const url  = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json() as { files?: Array<{ id: string }> }
  return data.files?.[0]?.id ?? null
}

async function driveCreateFolder(token: string, name: string, parentId: string): Promise<string> {
  const res  = await fetch('https://www.googleapis.com/drive/v3/files', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })
  const data = await res.json() as { id: string }
  return data.id
}

async function findOrCreateFolder(token: string, name: string, parentId: string): Promise<string> {
  return (await driveFindFolder(token, name, parentId)) ?? (await driveCreateFolder(token, name, parentId))
}

async function driveUploadFile(token: string, file: File, parentId: string): Promise<string | null> {
  const enc      = new TextEncoder()
  const boundary = `boundary_${Date.now()}`
  const meta     = JSON.stringify({ name: file.name, parents: [parentId] })
  const mime     = file.type || 'application/octet-stream'
  const fileData = new Uint8Array(await file.arrayBuffer())

  const p1h  = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`)
  const p1b  = enc.encode(meta)
  const p2h  = enc.encode(`\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`)
  const end  = enc.encode(`\r\n--${boundary}--`)

  const body = new Uint8Array(p1h.length + p1b.length + p2h.length + fileData.length + end.length)
  let off = 0
  body.set(p1h,     off); off += p1h.length
  body.set(p1b,     off); off += p1b.length
  body.set(p2h,     off); off += p2h.length
  body.set(fileData,off); off += fileData.length
  body.set(end,     off)

  const res  = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  )
  if (!res.ok) throw new Error(`Drive upload ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as { id?: string; webViewLink?: string }
  return data.webViewLink ?? (data.id ? `https://drive.google.com/file/d/${data.id}/view` : null)
}

// ─── POST /api/upload-drive ───────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const empty: DriveLinks = { excel: null, ci: null, pl: null }

  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  if (!rootId || !process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.warn('[upload-drive] Credentials not configured.')
    return Response.json(empty)
  }

  try {
    const formData = await req.formData()
    const tipo = formData.get('tipoCarga') as string
    const piNo = (formData.get('piNo') as string | null)?.trim() || null
    const asn  = (formData.get('asn')  as string | null)?.trim() || null
    const date = (formData.get('date') as string | null)?.trim() || null

    const token = await getAccessToken()

    const ref     = date ? new Date(date) : new Date()
    const year    = ref.getFullYear().toString()
    const mm      = String(ref.getMonth() + 1).padStart(2, '0')
    const month   = `${mm}${year}`
    const invoice = (piNo ?? asn ?? 'Sin-Invoice').replace(/[/\\?%*:|"<>]/g, '-').trim()

    const yearId    = await findOrCreateFolder(token, year,    rootId)
    const monthId   = await findOrCreateFolder(token, month,   yearId)
    const invoiceId = await findOrCreateFolder(token, invoice, monthId)

    const links = { ...empty }

    if (tipo === 'Repuesto') {
      const file = formData.get('file') as File | null
      if (file) links.excel = await driveUploadFile(token, file, invoiceId)
    } else if (tipo === 'Mercaderia') {
      const fileCi = formData.get('file_ci') as File | null
      const filePl = formData.get('file_pl') as File | null
      const [ciLink, plLink] = await Promise.all([
        fileCi ? driveUploadFile(token, fileCi, invoiceId) : Promise.resolve(null),
        filePl ? driveUploadFile(token, filePl, invoiceId) : Promise.resolve(null),
      ])
      links.ci = ciLink
      links.pl = plLink
    }

    return Response.json(links)
  } catch (err) {
    console.error('[upload-drive] error:', err)
    return Response.json(empty)
  }
}
