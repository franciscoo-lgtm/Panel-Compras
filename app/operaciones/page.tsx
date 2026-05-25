export const dynamic = 'force-dynamic'

import { Database } from 'lucide-react'
import { getComexSources } from '@/app/lib/comex-sources'
import ComexSourcesClient from './ComexSourcesClient'

export default async function OperacionesPage() {
  const sources = await getComexSources()
  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Módulo</p>
        <h1 className="text-2xl font-semibold text-zinc-900 flex items-center gap-2">
          <Database className="w-6 h-6 text-amber-500" />
          Fuentes
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Conectá planillas de Google Sheets para cruzar datos en vivo con el SO en todos los paneles.
        </p>
      </div>
      <ComexSourcesClient initialSources={sources} />
    </div>
  )
}
