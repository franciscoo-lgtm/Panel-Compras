'use server'

import { google, drive_v3 } from 'googleapis'
import { Readable } from 'stream'


function getAuth() {
  const email = process.env.GOOGLE_CLIENT_EMAIL
  const key   = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!email || !key) return null
  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
}

async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string,
): Promise<string> {
  const safe = name.replace(/['\\]/g, '')
  const res = await drive.files.list({
    q: `name='${safe}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  if (res.data.files?.[0]?.id) return res.data.files[0].id

  const folder = await drive.files.create({
    requestBody: {
      name: safe,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })
  return folder.data.id!
}

export async function uploadToDrive(
  file: File,
  meta: { piNo?: string | null; asn?: string | null; date?: Date | string | null },
): Promise<string | null> {
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  const auth   = getAuth()
  if (!rootId || !auth) {
    console.warn('[Drive] Credentials not configured — skipping upload.')
    return null
  }

  try {
    const drive   = google.drive({ version: 'v3', auth })
    const ref     = meta.date ? new Date(meta.date as string) : new Date()
    const year    = ref.getFullYear().toString()
    const mm      = String(ref.getMonth() + 1).padStart(2, '0')
    const month   = `${mm}${year}` // MMAAAA e.g. "052026"
    // Sanitise folder name: strip characters invalid in Drive
    const invoice = (meta.piNo ?? meta.asn ?? 'Sin-Invoice')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .trim()

    // Build folder path: Root > Year > Month > Invoice
    const yearId    = await findOrCreateFolder(drive, year,    rootId)
    const monthId   = await findOrCreateFolder(drive, month,   yearId)
    const invoiceId = await findOrCreateFolder(drive, invoice, monthId)

    const buf    = Buffer.from(await file.arrayBuffer())
    const stream = Readable.from(buf)

    const uploaded = await drive.files.create({
      requestBody: { name: file.name, parents: [invoiceId] },
      media: {
        mimeType: file.type || 'application/octet-stream',
        body: stream,
      },
      fields: 'id,webViewLink',
      supportsAllDrives: true,
    })

    return uploaded.data.webViewLink ?? null
  } catch (err) {
    console.error('[Drive] Upload failed:', err)
    return null
  }
}
