import { NextResponse } from 'next/server'
import { callClaudeWithCache, logCacheStats } from '@/app/lib/anthropic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROMPT = `Sos un asistente que analiza fotos de etiquetas en importaciones DJI Argentina.

PRIMERO, decidí qué tipo de etiqueta estás viendo:
- "box": etiqueta de CAJA — tiene "Ctn N°", "Carton N°", "CTN", "箱号" o "(CarTon No)" visible, y un número/barcode de carton (puede ser largo, tipo 73122612604290000563, o corto tipo 1/24)
- "part": etiqueta de REPUESTO individual — describe un producto (con código, descripción, cantidad). NO tiene "Ctn N°".
- "unknown": no podés decidir.

LUEGO, extraé los campos según el tipo:

Si es "box":
- cartonNo: el número de carton (string, puede ser barcode largo o corto)
- asn: si lo ves (formato 3 letras + 6 dígitos + 4 alfanuméricos)
- caseNo: si hay un caso interno visible (suele coincidir con cartonNo o ser un sub-código)

Si es "part":
- partCode: código del repuesto / EAN / SKU (string)
- partDescription: descripción del producto tal como aparece en la etiqueta
- partQty: cantidad visible en la etiqueta (entero)
- asn: si lo ves
- soNo: número de SO si aparece (ej "SO-1234", "SO40100")
- modelo: nombre del modelo si aparece

confidence: tu nivel de certeza ("high" | "medium" | "low")

Respondé ÚNICAMENTE con UN JSON object sin markdown. Campos no aplicables o ilegibles → null.

Ejemplo box: {"labelType":"box","cartonNo":"73122612604290000563","asn":"JDS260428M24N","caseNo":null,"partCode":null,"partDescription":null,"partQty":null,"soNo":null,"modelo":null,"confidence":"high"}
Ejemplo part: {"labelType":"part","cartonNo":null,"asn":"JDS260428M24N","caseNo":null,"partCode":"CP.MA.00000691.01","partDescription":"DJI Mini 4 Pro Battery","partQty":2,"soNo":"SO-40100","modelo":"DJI Mini 4 Pro","confidence":"high"}`

export async function POST(req: Request) {
  try {
    const { base64, mediaType } = await req.json() as { base64: string; mediaType: string }
    if (!base64) return NextResponse.json({ ok: false, error: 'base64 requerido' }, { status: 400 })

    const { text, usage } = await callClaudeWithCache({
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: PROMPT,
      userMessage: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: base64,
          },
        },
        { type: 'text', text: 'Analizá esta etiqueta y devolveme el JSON.' },
      ],
      maxTokens: 256,
    })

    logCacheStats('extract-photo-info', usage)

    const trimmed = text.trim()
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ ok: false, error: 'sin JSON en respuesta', raw: trimmed })

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
