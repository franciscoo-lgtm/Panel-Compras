'use client'

import { useState } from 'react'
import { Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { unzipSync } from 'fflate'

export type PhotoExtractionResult = {
  rowIndex: number
  colIndex: number
  base64: string
  mediaType: string
  ai?: {
    labelType?: 'box' | 'part' | 'unknown' | null
    asn?: string | null
    cartonNo?: string | null
    caseNo?: string | null
    soNo?: string | null
    modelo?: string | null
    qty?: number | null
    partCode?: string | null
    partDescription?: string | null
    partQty?: number | null
    confidence?: 'high' | 'medium' | 'low' | null
  }
}

function uint8ToBase64(buf: Uint8Array): string {
  const CHUNK = 0x8000
  let str = ''
  for (let i = 0; i < buf.length; i += CHUNK)
    str += String.fromCharCode(...buf.subarray(i, i + CHUNK))
  return btoa(str)
}

function detectMediaType(buf: Uint8Array): string {
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  return 'image/jpeg'
}

function extractImagesFromXlsx(buf: Uint8Array): PhotoExtractionResult[] {
  const files = unzipSync(buf)
  const drawingXml = new TextDecoder().decode(files['xl/drawings/drawing1.xml'] ?? new Uint8Array())
  const relsXml    = new TextDecoder().decode(files['xl/drawings/_rels/drawing1.xml.rels'] ?? new Uint8Array())

  const ridToFile: Record<string, string> = {}
  const rRe = /Id="(rId\d+)"[^>]*Target="\.\.\/media\/(image\d+\.\w+)"/g
  let rm: RegExpExecArray | null
  while ((rm = rRe.exec(relsXml)) !== null) ridToFile[rm[1]] = rm[2]

  const out: PhotoExtractionResult[] = []
  const anchorRe = /<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g
  let am: RegExpExecArray | null
  while ((am = anchorRe.exec(drawingXml)) !== null) {
    const block   = am[0]
    const fromRow = parseInt((block.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/) || [])[1] ?? '0')
    const fromCol = parseInt((block.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/) || [])[1] ?? '0')
    const rid     = (block.match(/r:embed="(rId\d+)"/) || [])[1]
    if (!rid) continue
    const imgFile = ridToFile[rid]
    if (!imgFile) continue
    const imgBuf = files[`xl/media/${imgFile}`]
    if (!imgBuf) continue
    out.push({
      rowIndex: fromRow,
      colIndex: fromCol,
      base64: uint8ToBase64(imgBuf),
      mediaType: detectMediaType(imgBuf),
    })
  }
  return out
}

export function InspectionPhotoUploader({
  onExtracted, onAIComplete,
}: {
  onExtracted: (photos: PhotoExtractionResult[]) => void
  onAIComplete?: (photos: PhotoExtractionResult[]) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [aiRunning, setAiRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState(0)

  async function handleExtract() {
    if (!file) return
    setExtracting(true); setError(null)
    try {
      const buf = new Uint8Array(await file.arrayBuffer())
      const photos = extractImagesFromXlsx(buf)
      setCount(photos.length)
      onExtracted(photos)

      setAiRunning(true)
      const enriched: PhotoExtractionResult[] = []
      for (const p of photos) {
        try {
          const r = await fetch('/api/extract-photo-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64: p.base64, mediaType: p.mediaType }),
          }).then(r => r.json())
          enriched.push({ ...p, ai: r.ok ? r.info : null })
        } catch {
          enriched.push(p)
        }
      }
      setAiRunning(false)
      if (onAIComplete) onAIComplete(enriched)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExtracting(false)
    }
  }

  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#0d0d0d] p-4">
      <h3 className="text-[12px] font-display font-semibold text-white mb-3">Subir Excel de inspección</h3>
      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="flex-1 text-[11px] text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-white/[0.06] file:text-white hover:file:bg-white/[0.1]"
        />
        <button
          onClick={handleExtract}
          disabled={!file || extracting || aiRunning}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-[#31AF4F] hover:bg-[#31AF4F]/85 disabled:opacity-40 text-white inline-flex items-center gap-1.5"
        >
          {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Extraer fotos
        </button>
      </div>
      {count > 0 && !aiRunning && (
        <p className="mt-2 text-[11px] text-emerald-400 inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> {count} foto{count === 1 ? '' : 's'} extraída{count === 1 ? '' : 's'}
        </p>
      )}
      {aiRunning && (
        <p className="mt-2 text-[11px] text-blue-400 inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analizando fotos con IA…
        </p>
      )}
      {error && (
        <p className="mt-2 text-[11px] text-red-400 inline-flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
    </div>
  )
}
