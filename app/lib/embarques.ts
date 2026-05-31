'use server'

import { prisma } from '@/lib/prisma'
import { fetchComexData, type ComexShipment } from '@/app/lib/comex'
import { parseDateLoose, pickField, deriveStatus, ESTADO_PRIORITY } from '@/app/lib/comex-internals'
import type { CIPLItemModel as CIPLItem, CompraModel as Compra, CIPLPhotoModel as CIPLPhoto } from '@/app/generated/prisma/models'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmbarqueEstado = 'pendiente' | 'en-transito' | 'arribado' | 'desconocido'

export type TipoCargaEmbarque = 'Repuesto' | 'Mercaderia' | 'Mixto' | 'sin-datos'

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
  /**
   * Tipo de carga mayoritario de los CIPLItems del embarque.
   * 'Mixto' si la dominancia del mayoritario está entre 20% y 80%.
   * 'sin-datos' si no hay CIPLItems vinculados todavía.
   */
  tipoCarga: TipoCargaEmbarque
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

// Helpers (parseDateLoose, pickField, deriveStatus, ESTADO_PRIORITY) live in comex-internals.ts
// so they can be unit-tested without the 'use server' constraint.

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
    select: { id: true, qty: true, cbm: true, soPrincipal: true, tipoCarga: true },
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

    // Tipo de carga: cuenta cuántos items son Repuesto vs Mercaderia.
    // Si la dominancia del mayoritario es >= 80% → ese tipo gana.
    // Sino → 'Mixto'. Sin items → 'sin-datos'.
    let tipoCarga: TipoCargaEmbarque = 'sin-datos'
    if (items.length > 0) {
      let rep = 0, merc = 0
      for (const it of items) {
        if (it.tipoCarga === 'Repuesto') rep++
        else if (it.tipoCarga === 'Mercaderia') merc++
      }
      const total = rep + merc
      if (total === 0) tipoCarga = 'sin-datos'
      else if (rep / total >= 0.8) tipoCarga = 'Repuesto'
      else if (merc / total >= 0.8) tipoCarga = 'Mercaderia'
      else tipoCarga = 'Mixto'
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
      tipoCarga,
      fetchedAt:  comex.fetchedAt,
    })
  }

  // Sort: estados activos primero (en-transito > pendiente > sin-tracking > arribado),
  // dentro de cada estado por ETA ascendente (los que llegan antes, primero).
  // Embarques sin ETA quedan al final de su grupo.
  const SORT_PRIORITY: Record<EmbarqueEstado, number> = {
    'en-transito': 0,
    'pendiente':   1,
    'desconocido': 2,
    'arribado':    3,
  }
  summaries.sort((a, b) => {
    const pa = SORT_PRIORITY[a.estado]
    const pb = SORT_PRIORITY[b.estado]
    if (pa !== pb) return pa - pb
    const ea = parseDateLoose(a.eta)?.getTime() ?? Number.MAX_SAFE_INTEGER
    const eb = parseDateLoose(b.eta)?.getTime() ?? Number.MAX_SAFE_INTEGER
    if (ea !== eb) return ea - eb
    return a.embarqueNo.localeCompare(b.embarqueNo)
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

  // Tipo de carga del detail (mismo criterio que en listEmbarques)
  let tipoCarga: TipoCargaEmbarque = 'sin-datos'
  if (items.length > 0) {
    let rep = 0, merc = 0
    for (const it of items) {
      if (it.tipoCarga === 'Repuesto') rep++
      else if (it.tipoCarga === 'Mercaderia') merc++
    }
    const total = rep + merc
    if (total === 0) tipoCarga = 'sin-datos'
    else if (rep / total >= 0.8) tipoCarga = 'Repuesto'
    else if (merc / total >= 0.8) tipoCarga = 'Mercaderia'
    else tipoCarga = 'Mixto'
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
    tipoCarga,
    fetchedAt:  comex.fetchedAt,
    shipmentsBySO,
    items,
    compras,
    extraColumns: comex.extraColumns,
    errors: comex.errors,
  }
}
