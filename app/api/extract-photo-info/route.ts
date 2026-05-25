import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROMPT = `Sos un asistente que analiza fotos de cajas DJI listas para inspección.
Mirá la etiqueta de la caja en la foto y extraé estos datos si están visibles:

- asn: el código ASN (formato: 3 letras + 6 dígitos + 4 caracteres alfanuméricos, ej "JDS260401LFUN")
- cartonNo: número de carton (ej "1/24", "5/12")
- caseNo: número de caso interno
- soNo: número de orden de venta (ej "SO-1234", "12345")
- modelo: nombre del modelo de producto visible (ej "DJI Mini 4 Pro", "Air 3")
- qty: cantidad visible en la etiqueta (entero)
- confidence: tu nivel de certeza ("high" | "medium" | "low")

Respondé ÚNICAMENTE con un JSON object sin markdown. Si un campo no se ve claro, ponelo en null.
Ejemplo: {"asn":"JDS260401LFUN","cartonNo":"1/24","caseNo":null,"soNo":"SO-1234","modelo":"DJI Mini 4 Pro","qty":2,"confidence":"high"}`

export async function POST(req: Request) {
  try {
    const { base64, mediaType } = await req.json() as { base64: string; mediaType: string }
    if (!base64) return NextResponse.json({ ok: false, error: 'base64 requerido' }, { status: 400 })

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    })

    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ ok: false, error: 'sin JSON en respuesta', raw: text })

    let info: Record<string, unknown> = {}
    try {
      info = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ ok: false, error: 'JSON inválido', raw: jsonMatch[0] })
    }

    return NextResponse.json({ ok: true, info })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
