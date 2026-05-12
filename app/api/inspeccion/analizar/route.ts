export const runtime    = 'edge'
export const maxDuration = 25

// ─── Types ────────────────────────────────────────────────────────────────────

type FirstPhotoInput = {
  rowIndex:   number
  base64:     string
  mediaType:  string
  photoCount: number
}

export type LabelResult = {
  rowIndex:   number
  photoCount: number
  asn:        string | null
  cartonNo:   string | null
  soNo:       string | null
  error:      string | null
}

type RouteResult =
  | { ok: true;  labels: LabelResult[] }
  | { ok: false; error: string }

// ─── POST /api/inspeccion/analizar ────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  try {
    const { firstPhotos }: { firstPhotos: FirstPhotoInput[] } = await req.json()
    if (!firstPhotos?.length) {
      return Response.json({ ok: true, labels: [] } satisfies RouteResult)
    }

    const imageContent = firstPhotos.map(r => ({
      type: 'image' as const,
      source: {
        type:       'base64' as const,
        media_type: r.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data:       r.base64,
      },
    }))

    const promptText = `You will receive ${firstPhotos.length} photos of shipping box labels, in order.
For each photo, extract from the shipping label:
- ASN / Shipment No (出货单号): e.g. "JDS260425M0NX"
- CartonNo (箱号): the long barcode number (digits only)
- SO: the sales order number e.g. "SO09797165"

Return ONLY a JSON array with exactly ${firstPhotos.length} elements, one per photo in order:
[
  { "asn": "...", "cartonNo": "...", "soNo": "...", "error": null },
  ...
]
If a photo does not show a readable label, set all fields to null and set "error" to a short reason.`

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 2048,
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
    const parsed: Array<{ asn?: string | null; cartonNo?: string | null; soNo?: string | null; error?: string | null }> =
      start >= 0 ? JSON.parse(raw.slice(start, end + 1)) : []

    const labels: LabelResult[] = firstPhotos.map((r, i) => ({
      rowIndex:   r.rowIndex,
      photoCount: r.photoCount,
      asn:        parsed[i]?.asn      ?? null,
      cartonNo:   parsed[i]?.cartonNo ?? null,
      soNo:       parsed[i]?.soNo     ?? null,
      error:      parsed[i]?.error    ?? null,
    }))

    return Response.json({ ok: true, labels } satisfies RouteResult)
  } catch (err) {
    console.error('[analizar-edge] error:', err)
    return Response.json({ ok: false, error: String(err) } satisfies RouteResult)
  }
}
