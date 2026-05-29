/**
 * Tipos + constantes de hitos. Sin 'use server' para que pueda exportar
 * objetos y tipos (los archivos 'use server' solo pueden exportar async).
 */

export type MilestoneSource = 'manual' | 'comex' | 'auto'

export type MilestoneAutoKind = 'plCargado'

export type MilestoneConfig = {
  key: string
  label: string
  source: MilestoneSource
  compraField?: string
  comexFieldKey?: string
  autoCompute?: MilestoneAutoKind
  showIn: ('compras' | 'embarques')[]
  editable?: boolean
  custom?: boolean
}

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

export const CONFIG_KEY = 'MILESTONES_CONFIG'
