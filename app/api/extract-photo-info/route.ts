import { NextResponse } from 'next/server'
import { callClaudeWithCache, logCacheStats } from '@/app/lib/anthropic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROMPT = `Sos un asistente que analiza fotos de etiquetas en importaciones DJI Argentina.

═══════════════════════════════════════════════════════════════════
PASO 1 — Identificá el tipo de etiqueta
═══════════════════════════════════════════════════════════════════

"box" (etiqueta de CAJA):
- Suele ser una etiqueta GRANDE pegada al exterior de la caja
- Tiene texto en chino "跨境订单" (Cross-border order) Y "箱号" (Carton No) o "(CarTon No)"
- Tiene MÚLTIPLES números/códigos en una grilla:
  * SO.No (número de SO, ej "AR SO09858876")
  * 出货单号 / Shipment No (ej "JDS260506M5LP")
  * Un código tipo "ESI.0000002487040441"
  * 箱号 / Carton No (un BARCODE LARGO de 20+ dígitos, ej "7312261260507000000403")
- Generalmente tiene el texto "第 N 箱" arriba (caja número N)

"part" (etiqueta de REPUESTO individual):
- Etiqueta MÁS CHICA, pegada directamente sobre el producto o en bolsa plástica
- Suele tener logo "JDL Express" o "京东快递"
- Tiene texto chino "物料标识卡" / "Shipping Label" o "物料信息"
- Tiene:
  * 货品编号 / Item Code (ej "JDS260506M5LP")
  * 物料代码 / Material Code (ej "YC.KC.0Q000797.04")
  * Descripción del producto en inglés (ej "Aircraft Arm Power Cable (Rear)")
  * 数量 / Quantity (número pequeño, suele ser 1-50)
  * "Made in China"

"unknown": no podés decidir con certeza.

═══════════════════════════════════════════════════════════════════
PASO 2 — Extraé los campos según el tipo
═══════════════════════════════════════════════════════════════════

────────────────────────────────────────────────────────────────────
SI ES "box":
────────────────────────────────────────────────────────────────────

**cartonNo (CRÍTICO)**:
ES el número que está en la fila etiquetada "箱号 / (CarTon No)" — generalmente
es un código de barras LARGO con un número de 18-22 dígitos abajo
(ej: "7312261260507000000403").
**NO confundir con:**
- "出货单号" / Shipment No → este es asn/shipmentNo, NO cartonNo
- "SO.No" → este es soNo, NO cartonNo
- "ESI.xxxxxx" → este es un código interno de operador, NO cartonNo
Si ves múltiples barcodes, el cartonNo es el QUE TIENE LA ETIQUETA "箱号" o "CarTon No"
literalmente al lado o arriba.

**asn**: el "出货单号" / Shipment No (ej "JDS260506M5LP" — empieza con JDS o similar)

**caseNo**: si hay un código interno visible (suele coincidir con cartonNo o ser un sub-código)

**soNo**: el "SO.No" (ej "AR SO09858876" → normalizá a "AR.SO09858876" o el formato que veas)

────────────────────────────────────────────────────────────────────
SI ES "part":
────────────────────────────────────────────────────────────────────

**partCode (CRÍTICO)**:
ES el "物料代码" / Material Code (ej "YC.KC.0Q000797.04", "CP.MA.00000691.01").
Suele tener formato XX.XX.XXXXXXX.XX o similar, con puntos.
**NO confundir con:**
- 货品编号 / Item Code → este es asn (es el Shipment No)
- Barcode general → el código del producto suele estar escrito en texto, no solo como barcode

**partDescription**: la descripción del producto en INGLÉS o español
(ej "Aircraft Arm Power Cable (Rear)", "DJI Mini 4 Pro Battery").
Si está borrosa o cortada, escribí lo que SE LEA con confidence=medium o low.

**partQty**: la cantidad / "数量" (un entero pequeño, generalmente 1-50)

**asn**: el "货品编号" / Item Code (ej "JDS260506M5LP")

**soNo**: número de SO si aparece (ej "SO-1234", "SO40100")

**modelo**: nombre del modelo si aparece (DJI Air, DJI Mini, AGRAS T30, etc)

═══════════════════════════════════════════════════════════════════
PASO 3 — Confidence
═══════════════════════════════════════════════════════════════════

- "high": etiqueta clara, todos los campos críticos legibles, sin ambigüedad
- "medium": uno o más campos requieren inferencia, foto algo borrosa pero legible
- "low": foto muy borrosa, ángulo malo, o campos críticos casi ilegibles

═══════════════════════════════════════════════════════════════════
FORMATO
═══════════════════════════════════════════════════════════════════

Respondé ÚNICAMENTE con UN JSON object sin markdown. Campos no aplicables o ilegibles → null.

Ejemplo box (etiqueta caja con código barras CarTon No):
{"labelType":"box","cartonNo":"7312261260507000000403","asn":"JDS260506M5LP","caseNo":null,"partCode":null,"partDescription":null,"partQty":null,"soNo":"AR.SO09858876","modelo":null,"confidence":"high"}

Ejemplo part (etiqueta repuesto con código YC/CP):
{"labelType":"part","cartonNo":null,"asn":"JDS260506M5LP","caseNo":null,"partCode":"YC.KC.0Q000797.04","partDescription":"Aircraft Arm Power Cable (Rear)","partQty":4,"soNo":null,"modelo":null,"confidence":"high"}`

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type AllowedMediaType = typeof ALLOWED_MEDIA_TYPES[number]

function isAllowedMediaType(v: string): v is AllowedMediaType {
  return (ALLOWED_MEDIA_TYPES as readonly string[]).includes(v)
}

export async function POST(req: Request) {
  try {
    const { base64, mediaType } = await req.json() as { base64: string; mediaType: string }
    if (!base64) return NextResponse.json({ ok: false, error: 'base64 requerido' }, { status: 400 })

    // Validar mediaType contra allowlist — antes se hacía un cast ciego,
    // permitiendo que un cliente mandara `application/pdf` u otros tipos
    // que Anthropic igual cobra como input pero rechaza.
    if (!isAllowedMediaType(mediaType)) {
      return NextResponse.json(
        { ok: false, error: `mediaType no soportado: ${mediaType}. Permitidos: ${ALLOWED_MEDIA_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    const { text, usage } = await callClaudeWithCache({
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: PROMPT,
      userMessage: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64,
          },
        },
        { type: 'text', text: 'Analizá esta etiqueta y devolveme el JSON.' },
      ],
      // Subimos a 512 porque el prompt nuevo es más estricto y el JSON
      // puede incluir descripciones más largas (Aircraft Arm Power Cable (Rear) etc).
      maxTokens: 512,
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
