export const runtime    = 'edge'
export const maxDuration = 25

// ─── Types ────────────────────────────────────────────────────────────────────

type PLItem = {
  caseNo:      string
  description: string | null
  qty:         number | null
  gwKg:        number | null
}

// Each photo in the Excel is sent individually (rowIndex + colIndex uniquely identifies it)
type PhotoInput = {
  rowIndex:   number
  colIndex:   number
  base64:     string
  mediaType:  string
}

export type LabelResult = {
  rowIndex:    number
  colIndex:    number
  photoCount:  number   // total photos in this Excel row (for display)
  asn:         string | null
  cartonNo:    string | null
  caseNo:      string | null
  soNo:        string | null
  confidence:  'high' | 'medium' | 'low' | null
  note:        string | null
  error:       string | null
}

type RouteResult =
  | { ok: true;  labels: LabelResult[] }
  | { ok: false; error: string }

// ─── POST /api/inspeccion/analizar ────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  try {
    const {
      photos,
      rowPhotoCounts,   // Map of rowIndex → total photos in that row
      plItems,
    }: { photos: PhotoInput[]; rowPhotoCounts: Record<number, number>; plItems?: PLItem[] } = await req.json()

    if (!photos?.length) {
      return Response.json({ ok: true, labels: [] } satisfies RouteResult)
    }

    const imageContent = photos.map(r => ({
      type: 'image' as const,
      source: {
        type:       'base64' as const,
        media_type: r.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data:       r.base64,
      },
    }))

    let promptText: string

    if (plItems?.length) {
      // ── PL-aware inspection mode — each photo may be a different box ──────
      const plContext = plItems
        .map((item, i) =>
          `  [${String(i + 1).padStart(2)}] CaseNo: ${item.caseNo} | ${item.description ?? '—'} | Qty: ${item.qty ?? '?'} | GW: ${item.gwKg ?? '?'} kg`
        )
        .join('\n')

      promptText = `Sos un inspector de depósito verificando cajas físicas contra un Packing List.

PACKING LIST (${plItems.length} líneas):
${plContext}

Te muestro ${photos.length} fotos de cajas físicas (en orden). IMPORTANTE: cada foto puede ser de una caja DIFERENTE — no asumas que todas las fotos son de la misma caja.

Para cada foto, actuá como lo haría un humano:
1. Leé el número de caja / código de barras de la etiqueta
2. Buscá esa caja en el Packing List — el código de barras está contenido dentro del CaseNo
3. Anotá brevemente lo que observás

Devolvé ÚNICAMENTE un array JSON con exactamente ${photos.length} elementos, uno por foto en orden:
[{"rowIndex": <número>, "colIndex": <número>, "caseNo": "<CaseNo exacto del PL>", "confidence": "high|medium|low", "note": "<observación breve en español>"}, ...]

- Incluí rowIndex y colIndex exactamente como están en la lista de fotos de abajo
- confidence "high": etiqueta claramente legible y código coincide exactamente
- confidence "medium": coincidencia parcial o inferida por contexto
- confidence "low": etiqueta ilegible, resultado estimado
- Poné caseNo en null si no hay coincidencia posible

Fotos en orden: ${photos.map((p, i) => `foto ${i + 1} = rowIndex:${p.rowIndex} colIndex:${p.colIndex}`).join(', ')}`
    } else {
      // ── Legacy label-reading mode (no PL context) ─────────────────────────
      promptText = `You will receive ${photos.length} photos of shipping box labels, in order. Each photo may be a DIFFERENT box.
For each photo, extract from the shipping label:
- ASN / Shipment No (出货单号): e.g. "JDS260425M0NX"
- CartonNo (箱号): the long barcode number (digits only)
- SO: the sales order number e.g. "SO09797165"

Return ONLY a JSON array with exactly ${photos.length} elements, one per photo in order:
[{ "rowIndex": <number>, "colIndex": <number>, "asn": "...", "cartonNo": "...", "soNo": "...", "error": null }, ...]
Photos in order: ${photos.map((p, i) => `photo ${i + 1} = rowIndex:${p.rowIndex} colIndex:${p.colIndex}`).join(', ')}
If a photo does not show a readable label, set all fields to null and set "error" to a short reason.`
    }

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages:   [{ role: 'user', content: [...imageContent, { type: 'text', text: promptText }] }],
      }),
    })

    if (!apiRes.ok) {
      const t = await apiRes.text()
      return Response.json({ ok: false, error: `Anthropic ${apiRes.status}: ${t.slice(0, 300)}` } satisfies RouteResult)
    }

    const data  = await apiRes.json()
    const raw   = data.content?.[0]?.type === 'text' ? (data.content[0].text as string) : '[]'
    const start = raw.indexOf('['), end = raw.lastIndexOf(']')
    const parsed: Array<{
      rowIndex?:   number | null
      colIndex?:   number | null
      asn?:        string | null
      cartonNo?:   string | null
      caseNo?:     string | null
      soNo?:       string | null
      confidence?: 'high' | 'medium' | 'low' | null
      note?:       string | null
      error?:      string | null
    }> = start >= 0 ? JSON.parse(raw.slice(start, end + 1)) : []

    const labels: LabelResult[] = photos.map((r, i) => ({
      rowIndex:   r.rowIndex,
      colIndex:   r.colIndex,
      photoCount: rowPhotoCounts[r.rowIndex] ?? 1,
      asn:        parsed[i]?.asn        ?? null,
      cartonNo:   parsed[i]?.cartonNo   ?? null,
      caseNo:     parsed[i]?.caseNo     ?? null,
      soNo:       parsed[i]?.soNo       ?? null,
      confidence: parsed[i]?.confidence ?? null,
      note:       parsed[i]?.note       ?? null,
      error:      parsed[i]?.error      ?? null,
    }))

    return Response.json({ ok: true, labels } satisfies RouteResult)
  } catch (err) {
    console.error('[analizar-edge] error:', err)
    return Response.json({ ok: false, error: String(err) } satisfies RouteResult)
  }
}
