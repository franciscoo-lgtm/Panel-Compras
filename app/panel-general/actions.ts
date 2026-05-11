'use server'

import { prisma } from '@/lib/prisma'
import { fetchGSORow } from '@/app/lib/sheets'

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
