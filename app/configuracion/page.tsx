export const dynamic = 'force-dynamic'

import { Settings } from 'lucide-react'
import { getComexConfig } from '@/app/lib/comex'
import { ConfigClient } from './ConfigClient'

export default async function ConfigPage() {
  const cfg = await getComexConfig()

  return (
    <div className="px-6 py-5 max-w-4xl">
      <div className="flex items-center gap-3 mb-5">
        <Settings className="w-5 h-5 text-[#E30613] shrink-0" />
        <h1 className="text-xl font-display font-semibold text-white tracking-tight">Configuración</h1>
      </div>

      <p className="text-[12px] text-zinc-500 mb-6">
        Solo necesitás 3 cosas: la URL de la planilla de Comex, qué columna tiene el SO,
        y qué columna tiene el N° Embarque. Las columnas adicionales se autodetectan.
      </p>

      <ConfigClient initial={cfg} />
    </div>
  )
}
