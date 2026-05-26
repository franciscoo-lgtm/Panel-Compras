/**
 * Catálogo de "hitos" que las fuentes de Comex pueden alimentar.
 *
 * Cada fuente declara mappings { header → field }. Los `field` pueden ser uno
 * de los catalog keys de abajo, o `extra_<slug>` para extras libres que se
 * muestran en "Datos de Comex" del tab Resumen del embarque.
 *
 * Cuando agregás un hito nuevo al panel (ej "Arribo Buque"), agregalo acá y
 * el UI de /configuracion automáticamente lo expone como opción de mapping.
 */

export type MilestoneField =
  | 'embarqueNo'
  | 'etd'
  | 'eta'
  | 'awb'
  | 'arriboWh'
  | 'fechaArriboAduana'
  | 'fechaArriboDeposito'
  | 'estado'

export type MilestoneCategory = 'core' | 'tracking' | 'meta'

export type MilestoneDef = {
  field: MilestoneField
  label: string
  category: MilestoneCategory
  description: string
}

export const MILESTONE_CATALOG: MilestoneDef[] = [
  {
    field: 'embarqueNo',
    label: 'N° Embarque',
    category: 'core',
    description: 'Código interno de Comex que agrupa SOs. Obligatorio en la fuente principal.',
  },
  {
    field: 'estado',
    label: 'Estado libre',
    category: 'meta',
    description: 'Texto descriptivo del estado (ej "En tránsito", "Demorado"). Opcional.',
  },
  {
    field: 'etd',
    label: 'ETD',
    category: 'tracking',
    description: 'Fecha estimada de salida. Determina si el embarque pasó a "en tránsito".',
  },
  {
    field: 'eta',
    label: 'ETA',
    category: 'tracking',
    description: 'Fecha estimada de arribo.',
  },
  {
    field: 'awb',
    label: 'AWB',
    category: 'meta',
    description: 'Número de Air Waybill (guía aérea).',
  },
  {
    field: 'arriboWh',
    label: 'Arribo WH Airsea',
    category: 'tracking',
    description: 'Fecha de arribo al warehouse de Airsea. Determina si el embarque pasó a "arribado".',
  },
  {
    field: 'fechaArriboAduana',
    label: 'Arribo Aduana',
    category: 'tracking',
    description: 'Fecha de arribo a aduana argentina.',
  },
  {
    field: 'fechaArriboDeposito',
    label: 'Arribo Depósito',
    category: 'tracking',
    description: 'Fecha de arribo al depósito final. Marca la compra como "Completada".',
  },
]

export function getMilestoneDef(field: MilestoneField): MilestoneDef | undefined {
  return MILESTONE_CATALOG.find(m => m.field === field)
}

export function getMilestoneLabel(field: string): string {
  const def = MILESTONE_CATALOG.find(m => m.field === field)
  if (def) return def.label
  if (field.startsWith('extra_')) return field.replace(/^extra_/, '').replace(/_/g, ' ')
  return field
}
