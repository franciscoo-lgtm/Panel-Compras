export const maxDuration = 60

// ─── Types ────────────────────────────────────────────────────────────────────

type DriveLinks = { excel: string | null; ci: string | null; pl: string | null; uploadError?: string }

// ─── Base64url helpers ────────────────────────────────────────────────────────

function b64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlBytes(arr: Uint8Array): string {
  let s = ''
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]!)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ─── Google Service Account → Access Token ────────────────────────────────────

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
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Auth failed (${res.status}): ${txt.slice(0, 300)}`)
  }
  const { access_token } = await res.json() as { access_token: string }
  return access_token
}

// ─── Drive helpers ────────────────────────────────────────────────────────────

async function driveFindFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const safe = name.replace(/'/g, "\\'")
  const q    = `name='${safe}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const url  = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Drive find folder "${name}" failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as { files?: Array<{ id: string }> }
  return data.files?.[0]?.id ?? null
}

async function driveCreateFolder(token: string, name: string, parentId: string): Promise<string> {
  const res  = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })
  if (!res.ok) throw new Error(`Drive create folder "${name}" failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as { id?: string }
  if (!data.id) throw new Error(`Drive create folder "${name}": no id in response`)
  return data.id
}

async function findOrCreateFolder(token: string, name: string, parentId: string): Promise<string> {
  const existing = await driveFindFolder(token, name, parentId)
  if (existing) {
    console.log(`[upload-drive] folder "${name}" exists: ${existing}`)
    return existing
  }
  const created = await driveCreateFolder(token, name, parentId)
  console.log(`[upload-drive] folder "${name}" created: ${created}`)
  return created
}

async function driveUploadFile(token: string, file: File, parentId: string): Promise<string> {
  const enc      = new TextEncoder()
  const boundary = `boundary_${Date.now()}`
  const meta     = JSON.stringify({ name: file.name, parents: [parentId] })
  const mime     = file.type || 'application/octet-stream'
  const fileData = new Uint8Array(await file.arrayBuffer())

  console.log(`[upload-drive] uploading "${file.name}" (${fileData.length} bytes, ${mime}) to folder ${parentId}`)

  const p1h = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`)
  const p1b = enc.encode(meta)
  const p2h = enc.encode(`\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`)
  const end = enc.encode(`\r\n--${boundary}--`)

  const body = new Uint8Array(p1h.length + p1b.length + p2h.length + fileData.length + end.length)
  let off = 0
  body.set(p1h, off); off += p1h.length
  body.set(p1b, off); off += p1b.length
  body.set(p2h, off); off += p2h.length
  body.set(fileData, off); off += fileData.length
  body.set(end, off)

  const res = await fetch(
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
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Drive upload "${file.name}" failed (${res.status}): ${txt.slice(0, 300)}`)
  }
  const data = await res.json() as { id?: string; webViewLink?: string }
  const link = data.webViewLink ?? (data.id ? `https://drive.google.com/file/d/${data.id}/view` : null)
  if (!link) throw new Error(`Drive upload "${file.name}": no link in response`)
  console.log(`[upload-drive] uploaded "${file.name}" → ${link}`)
  return link
}

// ─── POST /api/upload-drive ───────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const empty: DriveLinks = { excel: null, ci: null, pl: null }

  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  if (!rootId || !process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    const msg = 'Drive credentials not configured (GOOGLE_DRIVE_ROOT_FOLDER_ID / GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY)'
    console.error('[upload-drive]', msg)
    return Response.json({ ...empty, uploadError: msg })
  }

  let token: string
  let invoiceId: string

  try {
    const formData = await req.formData()
    const tipo = formData.get('tipoCarga') as string
    const piNo = (formData.get('piNo') as string | null)?.trim() || null
    const asn  = (formData.get('asn')  as string | null)?.trim() || null
    const date = (formData.get('date') as string | null)?.trim() || null

    console.log(`[upload-drive] tipo=${tipo} piNo=${piNo} asn=${asn} date=${date}`)

    token = await getAccessToken()
    console.log('[upload-drive] auth OK')

    const ref   = date ? new Date(date) : new Date()
    const year  = ref.getFullYear().toString()
    const mm    = String(ref.getMonth() + 1).padStart(2, '0')
    const month = `${mm}${year}`

    const rawInvoice = piNo ?? asn ?? 'Sin-Invoice'
    const invoice    = rawInvoice.split(',')[0]!.trim().replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Sin-Invoice'

    const yearId  = await findOrCreateFolder(token, year,    rootId)
    const monthId = await findOrCreateFolder(token, month,   yearId)
    invoiceId     = await findOrCreateFolder(token, invoice, monthId)

    const links: DriveLinks = { ...empty }
    const errors: string[] = []

    const safeUpload = async (file: File | null, key: keyof Pick<DriveLinks, 'excel' | 'ci' | 'pl'>) => {
      if (!file) { console.warn(`[upload-drive] ${key}: no file`); return }
      try {
        links[key] = await driveUploadFile(token, file, invoiceId)
      } catch (err) {
        const msg = String(err)
        console.error(`[upload-drive] ${key} upload failed:`, msg)
        errors.push(msg)
      }
    }

    if (tipo === 'Repuesto') {
      await safeUpload(formData.get('file') as File | null, 'excel')
    } else if (tipo === 'Mercaderia') {
      await Promise.all([
        safeUpload(formData.get('file_ci') as File | null, 'ci'),
        safeUpload(formData.get('file_pl') as File | null, 'pl'),
      ])
    }

    if (errors.length) links.uploadError = errors.join(' | ')
    return Response.json(links)

  } catch (err) {
    const msg = String(err)
    console.error('[upload-drive] fatal error:', msg)
    return Response.json({ ...empty, uploadError: msg })
  }
}
