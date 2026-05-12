'use server'

import { prisma } from '@/lib/prisma'
import { fetchGSORow, buildGSOMap } from '@/app/lib/sheets'
import Anthropic from '@anthropic-ai/sdk'

const DATE_FIELDS = new Set(['arriboWh', 'fechaInstruccion', 'etd', 'eta', 'etaCaldas'])

const GSO_NULL: Record<string, null> = {
  sku: null, pa: null, modelo: null,
  qPi: null, incoterm: null, puertoSalida: null,
  fobUnit: null, fobTotal: null, etd: null, eta: null,
}

export async function updateCIPLItem(
  id: string,
  raw: Record<string, string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const data: Record<string, unknown> = {}

    for (const [k, v] of Object.entries(raw)) {
      if (DATE_FIELDS.has(k)) {
        data[k] = v ? new Date(v) : null
      } else {
        data[k] = v.trim() || null
      }
    }

    // When SO principal changes, refresh GSO V4 cruce
    if ('soPrincipal' in raw) {
      if (raw.soPrincipal) {
        const gso = await fetchGSORow(raw.soPrincipal)
        if (gso) Object.assign(data, gso)
      } else {
        Object.assign(data, GSO_NULL)
      }
    }

    await prisma.cIPLItem.update({ where: { id }, data })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function getItemPhotos(itemId: string) {
  return prisma.cIPLPhoto.findMany({
    where: { ciplItemId: itemId },
    orderBy: [{ rowIndex: 'asc' }, { colIndex: 'asc' }],
    select: { id: true, dataUrl: true, rowIndex: true, colIndex: true },
  })
}

export async function addPhotosToBox(
  asn: string | null,
  caseNo: string | null,
  itemId: string,
  dataUrls: string[],
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  try {
    // Save to ALL items sharing this physical box; fallback to the single item
    const targets = (asn && caseNo)
      ? await prisma.cIPLItem.findMany({ where: { asn, caseNo }, select: { id: true } })
      : [{ id: itemId }]

    let added = 0
    for (const target of targets) {
      // Existing max colIndex for this item so we append, not overwrite
      const existing = await prisma.cIPLPhoto.count({ where: { ciplItemId: target.id } })
      await prisma.cIPLPhoto.createMany({
        data: dataUrls.map((dataUrl, i) => ({
          ciplItemId: target.id,
          dataUrl,
          rowIndex: 0,
          colIndex: existing + i,
        })),
      })
      added += dataUrls.length
    }
    return { ok: true, added }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function deletePhoto(
  photoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await prisma.cIPLPhoto.delete({ where: { id: photoId } })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function deleteCIPLItem(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await prisma.cIPLItem.delete({ where: { id } })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function suggestSOForItem(
  itemId: string,
): Promise<{ so: string; reason: string } | null> {
  try {
    const item = await prisma.cIPLItem.findUnique({ where: { id: itemId } })
    if (!item) return null

    const [asnItems, gsoMap] = await Promise.all([
      item.asn
        ? prisma.cIPLItem.findMany({
            where: { asn: item.asn },
            select: { piNo: true, description: true, codeEan: true, qty: true, soPrincipal: true },
          })
        : Promise.resolve([]),
      buildGSOMap(),
    ])

    const gsoList = [...gsoMap.entries()]
      .map(([soId, row]) =>
        `${soId}: SKU=${row.sku ?? '?'} Marca=${row.pa ?? '?'} Modelo=${row.modelo ?? '?'} Q=${row.qPi ?? '?'}`
      )
      .join('\n')

    const client = new Anthropic()
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Sos un asistente que cruza ítems de Packing List con Sales Orders de GSO V4.

ÍTEM OBJETIVO (ASN: ${item.asn ?? 'N/A'}):
PI No: ${item.piNo ?? 'N/A'}
EAN/Code: ${item.codeEan ?? 'N/A'}
Descripción: ${item.description ?? 'N/A'}
Qty: ${item.qty ?? 'N/A'}

OTROS ÍTEMS DEL MISMO ASN:
${asnItems.map(x => `  PI ${x.piNo ?? '?'}: ${x.description ?? '?'} EAN=${x.codeEan ?? '?'} Qty=${x.qty ?? '?'} SO actual=${x.soPrincipal ?? 'sin asignar'}`).join('\n') || '  (ninguno)'}

SALES ORDERS DISPONIBLES EN GSO V4:
${gsoList || '  (sin datos)'}

Basándote en el número de PI, descripción, EAN/código y el contexto de los otros ítems del mismo ASN, ¿qué SO corresponde mejor a este ítem?
Respondé SOLO con JSON: {"so":"SO-XXXX","reason":"<una oración explicando por qué en español>"}`,
      }],
    })

    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
    const match = text.match(/\{[^}]+\}/)
    if (!match) return null
    return JSON.parse(match[0]) as { so: string; reason: string }
  } catch (err) {
    console.error('[suggestSO] error:', err)
    return null
  }
}
