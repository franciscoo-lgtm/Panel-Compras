'use server'

import { prisma } from '@/lib/prisma'
import type { ComexSORow } from '@/app/lib/comex-data-types'

/**
 * Tipos de fuente de un hito.
 *
 * - manual: el dato vive en un campo de Compra (fechaEnvio, fechaPago, etc.)
 * - comex: el dato viene de la planilla Comex mergeada (etd, eta, arriboWh, etc.)
 * - auto: el sistema lo calcula (ej. PL Cargado = createdAt del primer CIPLItem)
 */
export type MilestoneSource = 'manual' | 'comex' | 'auto'

export type MilestoneAutoKind = 'plCargado'

export type MilestoneConfig = {
  key: string                            // identificador único (usado en URL/state)
  label: string                          // texto que ve el usuario
  source: MilestoneSource
  // Si source='manual': nombre del campo en Compra (ej. 'fechaEnvio')
  compraField?: string
  // Si source='comex': field key del catálogo (etd, eta, arriboWh, fechaArriboAduana...)
  // o 'extra_xxx' si es un extra configurado en /configuracion
  comexFieldKey?: string
  // Si source='auto'
  autoCompute?: MilestoneAutoKind
  // En qué timelines se muestra este hito
  showIn: ('compras' | 'embarques')[]
  // Si el usuario puede editarlo manualmente desde la UI (solo aplica a source='manual')
  editable?: boolean
  // Si fue agregado por el usuario (true) o viene del default (false). Default hitos
  // no se pueden borrar, custom sí.
  custom?: boolean
}

const CONFIG_KEY = 'MILESTONES_CONFIG'

/**
 * Hitos por defecto del sistema. Los mismos 12 que estaban hardcoded en
 * CompraDetail.tsx, ahora compartidos entre el seguimiento de Compras y el
 * de Embarques.
 *
 * En Embarques se muestran solo a partir de "Instrucción Category" (los
 * primeros 5 son específicos del lifecycle de la Compra).
 */
export const DEFAULT_MILESTONES: MilestoneConfig[] = [
  { key: 'fechaOrden',          label: 'Orden creada',          source: 'manual', compraField: 'fechaOrden',          showIn: ['compras'] },
  { key: 'fechaEnvio',          label: 'Enviada al proveedor',  source: 'manual', compraField: 'fechaEnvio',          showIn: ['compras'],              editable: true },
  { key: 'fechaPago',           label: 'Pagada',                source: 'manual', compraField: 'fechaPago',           showIn: ['compras'],              editable: true },
  { key: 'fechaSegundaValPA',   label: '2da Validación PA',     source: 'manual', compraField: 'fechaSegundaValPA',   showIn: ['compras'],              editable: true },
  { key: '_plCargado',          label: 'PL Cargado',            source: 'auto',   autoCompute: 'plCargado',           showIn: ['compras'] },
  { key: 'fechaInstruccionCat', label: 'Instrucción Category',  source: 'manual', compraField: 'fechaInstruccionCat', showIn: ['compras', 'embarques'], editable: true },
  { key: 'fechaLMS',            label: 'LMS',                   source: 'manual', compraField: 'fechaLMS',            showIn: ['compras', 'embarques'], editable: true },
  { key: '_arriboWh',           label: 'Arribo WH Airsea',      source: 'comex',  comexFieldKey: 'arriboWh',           showIn: ['compras', 'embarques'] },
  { key: '_etd',                label: 'ETD',                   source: 'comex',  comexFieldKey: 'etd',                showIn: ['compras', 'embarques'] },
  { key: '_eta',                label: 'ETA',                   source: 'comex',  comexFieldKey: 'eta',                showIn: ['compras', 'embarques'] },
  { key: '_arriboAduana',       label: 'Arribo Aduana',         source: 'comex',  comexFieldKey: 'fechaArriboAduana',  showIn: ['compras', 'embarques'] },
  { key: '_arriboDeposito',     label: 'Arribo Depósito',       source: 'comex',  comexFieldKey: 'fechaArriboDeposito',showIn: ['compras', 'embarques'] },
]

export async function getMilestonesConfig(): Promise<MilestoneConfig[]> {
  const row = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEY } })
  if (!row) return DEFAULT_MILESTONES
  try {
    const parsed = JSON.parse(row.value)
    if (Array.isArray(parsed)) return parsed as MilestoneConfig[]
    return DEFAULT_MILESTONES
  } catch {
    return DEFAULT_MILESTONES
  }
}

export async function saveMilestonesConfig(milestones: MilestoneConfig[]): Promise<void> {
  await prisma.appConfig.upsert({
    where:  { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: JSON.stringify(milestones) },
    update: { value: JSON.stringify(milestones) },
  })
}

export async function resetMilestonesConfig(): Promise<void> {
  await prisma.appConfig.deleteMany({ where: { key: CONFIG_KEY } })
}

// ─── Compute helpers ─────────────────────────────────────────────────────────

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
