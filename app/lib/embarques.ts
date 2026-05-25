'use server'

import { prisma } from '@/lib/prisma'
import { fetchComexData, type ComexShipment } from '@/app/lib/comex'
import type { CIPLItemModel as CIPLItem, CompraModel as Compra, CIPLPhotoModel as CIPLPhoto } from '@/app/generated/prisma/models'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmbarqueEstado = 'pendiente' | 'en-transito' | 'arribado' | 'desconocido'

export type EmbarqueSummary = {
  embarqueNo: string
  estado: EmbarqueEstado
  etd: string | null
  eta: string | null
  awb: string | null
  sos: string[]
  totalItems: number
  totalQty: number
  totalCbm: number
  fetchedAt: Date
}

export type CIPLItemWithPhotos = CIPLItem & { photos: CIPLPhoto[] }

export type EmbarqueDetail = EmbarqueSummary & {
  shipmentsBySO: Map<string, ComexShipment>
  items: CIPLItemWithPhotos[]
  compras: Compra[]
  extraColumns: { fieldKey: string; label: string }[]
  errors: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDateLoose(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const iso = new Date(raw)
  if (!isNaN(iso.getTime())) return iso
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    const dd = parseInt(m[1], 10)
    const mm = parseInt(m[2], 10) - 1
    let yyyy = parseInt(m[3], 10)
    if (yyyy < 100) yyyy += 2000
    const d = new Date(yyyy, mm, dd)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function pickField(shipment: ComexShipment, candidates: string[]): string | null {
  for (const key of Object.keys(shipment.extras)) {
    const lower = key.toLowerCase()
    if (candidates.some(c => lower.includes(c))) {
      const v = shipment.extras[key]
      if (v) return v
    }
  }
  return null
}

export function deriveStatus(shipment: ComexShipment): EmbarqueEstado {
  const arribo = parseDateLoose(pickField(shipment, ['arribo']))
  if (arribo) return 'arribado'
  const etd = parseDateLoose(pickField(shipment, ['etd']))
  if (!etd) return 'desconocido'
  return etd <= new Date() ? 'en-transito' : 'pendiente'
}

const ESTADO_PRIORITY: Record<EmbarqueEstado, number> = {
  desconocido:   0,
  pendiente:     1,
  'en-transito': 2,
  arribado:      3,
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function listEmbarques(): Promise<{ summaries: EmbarqueSummary[]; errors: string[] }> {
  const comex = await fetchComexData()
  const summaries: EmbarqueSummary[] = []

  const allSos = new Set<string>()
  for (const soSet of comex.byEmbarque.values()) {
    for (const so of soSet) allSos.add(so)
  }

  const allItems = await prisma.cIPLItem.findMany({
    where: { soPrincipal: { in: Array.from(allSos) } },
    select: { id: true, qty: true, cbm: true, soPrincipal: true },
  })

  const itemsBySO = new Map<string, typeof allItems>()
  for (const it of allItems) {
    if (!it.soPrincipal) continue
    const key = it.soPrincipal.toUpperCase()
    if (!itemsBySO.has(key)) itemsBySO.set(key, [])
    itemsBySO.get(key)!.push(it)
  }

  for (const [embarqueNo, soSet] of comex.byEmbarque) {
    const sos = Array.from(soSet)

    const items = sos.flatMap(so => itemsBySO.get(so.toUpperCase()) ?? [])

    let etd: string | null = null
    let eta: string | null = null
    let awb: string | null = null
    let estado: EmbarqueEstado = 'desconocido'

    for (const so of sos) {
      const row = comex.bySO.get(so)
      if (!row) continue
      const ship = row.shipments.find(s => s.embarqueNo.toUpperCase() === embarqueNo)
      if (!ship) continue
      etd ??= pickField(ship, ['etd'])
      eta ??= pickField(ship, ['eta'])
      awb ??= pickField(ship, ['awb'])
      const st = deriveStatus(ship)
      if (ESTADO_PRIORITY[st] > ESTADO_PRIORITY[estado]) estado = st
    }

    summaries.push({
      embarqueNo,
      estado,
      etd,
      eta,
      awb,
      sos,
      totalItems: items.length,
      totalQty:   items.reduce((s, i) => s + (i.qty ?? 0), 0),
      totalCbm:   items.reduce((s, i) => s + (i.cbm ?? 0), 0),
      fetchedAt:  comex.fetchedAt,
    })
  }

  summaries.sort((a, b) => {
    const ad = parseDateLoose(a.etd)?.getTime() ?? 0
    const bd = parseDateLoose(b.etd)?.getTime() ?? 0
    if (ad !== bd) return bd - ad
    return b.embarqueNo.localeCompare(a.embarqueNo)
  })

  return { summaries, errors: comex.errors }
}

export async function getEmbarqueDetail(embarqueNoRaw: string): Promise<EmbarqueDetail | null> {
  const embarqueNo = embarqueNoRaw.toUpperCase()
  const comex = await fetchComexData()
  const soSet = comex.byEmbarque.get(embarqueNo)
  if (!soSet || soSet.size === 0) return null

  const sos = Array.from(soSet)
  const items = await prisma.cIPLItem.findMany({
    where: { soPrincipal: { in: sos } },
    orderBy: [{ asn: 'asc' }, { sortOrder: 'asc' }],
    include: { photos: true },
  })

  const compras = await prisma.compra.findMany({
    where: { sos: { some: { soNumber: { in: sos } } } },
    include: { sos: true },
  })

  const shipmentsBySO = new Map<string, ComexShipment>()
  for (const so of sos) {
    const row = comex.bySO.get(so)
    if (!row) continue
    const ship = row.shipments.find(s => s.embarqueNo.toUpperCase() === embarqueNo)
    if (ship) shipmentsBySO.set(so, ship)
  }

  let etd: string | null = null
  let eta: string | null = null
  let awb: string | null = null
  let estado: EmbarqueEstado = 'desconocido'
  for (const ship of shipmentsBySO.values()) {
    etd ??= pickField(ship, ['etd'])
    eta ??= pickField(ship, ['eta'])
    awb ??= pickField(ship, ['awb'])
    const st = deriveStatus(ship)
    if (ESTADO_PRIORITY[st] > ESTADO_PRIORITY[estado]) estado = st
  }

  return {
    embarqueNo,
    estado,
    etd,
    eta,
    awb,
    sos,
    totalItems: items.length,
    totalQty:   items.reduce((s, i) => s + (i.qty ?? 0), 0),
    totalCbm:   items.reduce((s, i) => s + (i.cbm ?? 0), 0),
    fetchedAt:  comex.fetchedAt,
    shipmentsBySO,
    items,
    compras,
    extraColumns: comex.extraColumns,
    errors: comex.errors,
  }
}
