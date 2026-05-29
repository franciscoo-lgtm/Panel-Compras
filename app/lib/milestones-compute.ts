/**
 * Helpers puros para calcular la fecha de un hito.
 * Extraídos de milestones-config.ts porque ese archivo es 'use server' y todos
 * sus exports deben ser async — estos helpers son sync.
 */

import type { ComexSORow } from '@/app/lib/comex-data-types'
import type { MilestoneConfig } from '@/app/lib/milestones-types'

type CompraLike = Record<string, unknown>

/**
 * Devuelve la fecha (ISO string) de un hito para una Compra individual.
 * Lógica copiada del legacy getMilestoneDate en CompraDetail.tsx.
 */
export function getMilestoneDateForCompra(
  milestone: MilestoneConfig,
  compra: CompraLike,
  firstCiplCreatedAt: string | null,
  sos: string[],
  bySO: Record<string, ComexSORow>,
): string | null {
  if (milestone.source === 'auto') {
    if (milestone.autoCompute === 'plCargado') return firstCiplCreatedAt
    return null
  }
  if (milestone.source === 'manual') {
    if (!milestone.compraField) return null
    const v = compra[milestone.compraField]
    if (v == null) return null
    if (typeof v === 'string') return v
    if (v instanceof Date) return v.toISOString()
    return null
  }
  if (milestone.source === 'comex') {
    if (!milestone.comexFieldKey) return null
    for (const so of sos) {
      const v = bySO[so.toUpperCase()]?.shipments[0]?.extras[milestone.comexFieldKey] ?? null
      if (v) return v
    }
    return null
  }
  return null
}

/**
 * Devuelve la fecha de un hito agregado para un Embarque (puede tener N compras).
 *
 * - comex: igual lógica (lookup por SO en bySO)
 * - manual: toma el valor de la Compra más reciente que lo tenga seteado
 * - auto: usa el firstCiplCreatedAt agregado del embarque entero
 */
export function getMilestoneDateForEmbarque(
  milestone: MilestoneConfig,
  compras: CompraLike[],
  firstCiplCreatedAt: string | null,
  sos: string[],
  bySO: Record<string, ComexSORow>,
): string | null {
  if (milestone.source === 'comex') {
    if (!milestone.comexFieldKey) return null
    for (const so of sos) {
      const v = bySO[so.toUpperCase()]?.shipments[0]?.extras[milestone.comexFieldKey] ?? null
      if (v) return v
    }
    return null
  }
  if (milestone.source === 'manual') {
    if (!milestone.compraField) return null
    let latest: string | null = null
    for (const c of compras) {
      const v = c[milestone.compraField]
      if (v == null) continue
      const s = typeof v === 'string' ? v : v instanceof Date ? v.toISOString() : null
      if (s && (!latest || s > latest)) latest = s
    }
    return latest
  }
  if (milestone.source === 'auto') {
    if (milestone.autoCompute === 'plCargado') return firstCiplCreatedAt
    return null
  }
  return null
}
