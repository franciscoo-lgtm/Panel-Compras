export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ChevronLeft, ListChecks } from 'lucide-react'
import { getMilestonesConfig, type MilestoneConfig } from '@/app/lib/milestones-config'
import { getComexConfig } from '@/app/lib/comex'
import { MILESTONE_CATALOG } from '@/app/lib/milestone-catalog'
import { HitosConfigClient } from './HitosConfigClient'

export default async function HitosConfigPage() {
  const milestones = await getMilestonesConfig()
  const comexCfg = await getComexConfig()

  // Catálogo de "fuentes Comex" disponibles para mapear:
  // - los hitos predefinidos del catálogo (etd, eta, arriboWh, etc.)
  // - los extras configurados por el usuario en alguna fuente
  const comexFieldsAvailable: { fieldKey: string; label: string; category: 'tracking' | 'meta' | 'extra' }[] = []
  for (const def of MILESTONE_CATALOG) {
    if (def.field === 'embarqueNo') continue   // este no es un hito, es el join key
    comexFieldsAvailable.push({
      fieldKey: def.field,
      label: def.label,
      category: def.category === 'core' ? 'meta' : def.category,
    })
  }
  if (comexCfg) {
    const seen = new Set(comexFieldsAvailable.map(c => c.fieldKey))
    for (const src of comexCfg.sources) {
      for (const m of src.mappings) {
        if (m.field === 'embarqueNo') continue
        if (seen.has(m.field)) continue
        seen.add(m.field)
        comexFieldsAvailable.push({
          fieldKey: m.field,
          label: `${m.label} (${src.name})`,
          category: 'extra',
        })
      }
    }
  }

  // Catálogo de campos manuales (los de Compra) — fijos por schema
  const compraFieldsAvailable: { field: string; label: string }[] = [
    { field: 'fechaOrden',          label: 'Fecha orden' },
    { field: 'fechaEnvio',          label: 'Fecha envío' },
    { field: 'fechaPago',           label: 'Fecha pago' },
    { field: 'fechaSegundaValPA',   label: 'Fecha 2da Validación PA' },
    { field: 'fechaInstruccionCat', label: 'Fecha Instrucción Category' },
    { field: 'fechaLMS',            label: 'Fecha LMS' },
  ]

  return (
    <div className="px-6 py-5 max-w-5xl">
      <div className="flex items-center gap-2 mb-3 text-[11px] text-zinc-500">
        <Link href="/configuracion" className="hover:text-white transition-colors inline-flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" />
          Configuración
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <ListChecks className="w-5 h-5 text-[#E30613] shrink-0" />
        <h1 className="text-xl font-display font-semibold text-white tracking-tight">Hitos del proceso</h1>
      </div>

      <p className="text-[12px] text-zinc-500 mb-6">
        Definí los hitos del seguimiento de Compras y Embarques. Cada hito tiene una fuente
        (manual desde un campo de Compra, automático desde una columna de Comex, o calculado).
        Las fuentes Comex usan el join por SO y siempre traen el dato más reciente de la planilla.
      </p>

      <HitosConfigClient
        initial={milestones as MilestoneConfig[]}
        comexFields={comexFieldsAvailable}
        compraFields={compraFieldsAvailable}
      />
    </div>
  )
}
