import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Lista los headers actuales del Google Sheet GSO V4 para diagnóstico.
 * Útil para identificar el nombre exacto de cada columna y ajustar el
 * mapping en sheets.ts.
 */
export async function GET() {
  const url = process.env.GSO_SHEET_CSV_URL || process.env.SHEET_CSV_URL
  if (!url) {
    return NextResponse.json({
      ok: false,
      error: 'No hay env var GSO_SHEET_CSV_URL ni SHEET_CSV_URL configurada',
    })
  }

  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `HTTP ${res.status} al leer el sheet` })
    }
    const text = await res.text()
    const firstLine = text.replace(/\r\n/g, '\n').split('\n')[0] ?? ''
    // CSV parser simple
    const cols: string[] = []
    let cur = '', inQ = false
    for (const c of firstLine) {
      if (c === '"') { inQ = !inQ }
      else if (c === ',' && !inQ) { cols.push(cur.trim().replace(/^"|"$/g, '')); cur = '' }
      else cur += c
    }
    cols.push(cur.trim().replace(/^"|"$/g, ''))
    const headers = cols.filter(h => h.length > 0)
    const headersLower = headers.map(h => h.toLowerCase())

    // Highlight las que el código actualmente busca
    const knownMappings = {
      sku: 'codigo',
      pa: 'marca',           // ← el bug
      modelo: 'modelo',
      qPi: 'cantidad',
      incoterm: 'incoterm',
      puertoSalida: 'puerto de salida',
      fobUnit: 'precio invoice usd',
      fobTotal: 'total invoice usd',
      etd: 'etd',
      eta: 'eta',
    }

    const mappingStatus: Record<string, { searches: string; foundAt: number; matches: string | null }> = {}
    for (const [field, header] of Object.entries(knownMappings)) {
      const idx = headersLower.indexOf(header)
      mappingStatus[field] = {
        searches: header,
        foundAt: idx,
        matches: idx >= 0 ? headers[idx] : null,
      }
    }

    return NextResponse.json({
      ok: true,
      totalHeaders: headers.length,
      headers,                          // todos los headers tal cual aparecen
      headersLower,
      currentMappings: mappingStatus,
      hint: 'Buscá el header que querés mapear como "PA" en el array `headers`. Después decime el nombre exacto y lo cambio en sheets.ts.',
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
