import {
  getDriveAccessToken,
  driveFindOrCreateFolder,
  driveUploadBytes,
} from '@/app/lib/drive-auth'

export const maxDuration = 60

// ─── Types ────────────────────────────────────────────────────────────────────

type DriveLinks = { excel: string | null; ci: string | null; pl: string | null; uploadError?: string }

// ─── POST /api/upload-drive ───────────────────────────────────────────────────
//
// Sube los archivos del CIPL (Excel para Repuesto, CI+PL para Mercadería)
// a la carpeta del invoice en Drive: <root>/<año>/<MMYYYY>/<invoice>/
//
// Las fotos de inspección comparten esta misma estructura — se suben
// desde saveCIPLPhotos a la subcarpeta /fotos del invoice.

export async function POST(req: Request): Promise<Response> {
  const empty: DriveLinks = { excel: null, ci: null, pl: null }

  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  if (!rootId || !process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    const msg = 'Drive credentials not configured (GOOGLE_DRIVE_ROOT_FOLDER_ID / GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY)'
    console.error('[upload-drive]', msg)
    return Response.json({ ...empty, uploadError: msg })
  }

  try {
    const formData = await req.formData()
    const tipo = formData.get('tipoCarga') as string
    const piNo = (formData.get('piNo') as string | null)?.trim() || null
    const asn  = (formData.get('asn')  as string | null)?.trim() || null
    const date = (formData.get('date') as string | null)?.trim() || null

    console.log(`[upload-drive] tipo=${tipo} piNo=${piNo} asn=${asn} date=${date}`)

    const token = await getDriveAccessToken()

    // Mismo patrón de folders que app/lib/photo-actions.ts → así fotos y
    // archivos del CIPL caen en exactamente la misma carpeta de invoice.
    const ref     = date ? new Date(date) : new Date()
    const year    = ref.getFullYear().toString()
    const mm      = String(ref.getMonth() + 1).padStart(2, '0')
    const month   = `${mm}${year}`
    const rawInv  = piNo ?? asn ?? 'Sin-Invoice'
    const invoice = rawInv.split(',')[0]!.trim().replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Sin-Invoice'

    const yearId    = await driveFindOrCreateFolder(token, year,    rootId)
    const monthId   = await driveFindOrCreateFolder(token, month,   yearId)
    const invoiceId = await driveFindOrCreateFolder(token, invoice, monthId)

    const links: DriveLinks = { ...empty }
    const errors: string[] = []

    const safeUpload = async (file: File | null, key: keyof Pick<DriveLinks, 'excel' | 'ci' | 'pl'>) => {
      if (!file) { console.warn(`[upload-drive] ${key}: no file`); return }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const mime  = file.type || 'application/octet-stream'
        const uploaded = await driveUploadBytes(token, bytes, file.name, mime, invoiceId)
        links[key] = uploaded.webViewLink
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
