export const dynamic = 'force-dynamic'

import { Anchor, AlertCircle } from 'lucide-react'
import { listEmbarques } from '@/app/lib/embarques'
import { EmbarquesListClient } from './EmbarquesListClient'

export default async function EmbarquesPage() {
  const { summaries, errors } = await listEmbarques()

  return (
    <div className="px-6 py-5">
      <div className="flex items-center gap-3 mb-5">
        <Anchor className="w-5 h-5 text-[#E30613] shrink-0" />
        <h1 className="text-xl font-display font-semibold text-white tracking-tight">Embarques</h1>
        <span className="ml-auto text-[11px] text-zinc-500">
          {summaries.length} embarque{summaries.length === 1 ? '' : 's'}
        </span>
      </div>

      {errors.length > 0 && (
        <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-md border border-amber-500/20 bg-amber-500/[0.05] text-[12px] text-amber-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium mb-1">Aviso al leer la planilla Comex:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {errors.map(e => <li key={e}>{e}</li>)}
            </ul>
          </div>
        </div>
      )}

      <EmbarquesListClient summaries={summaries} />
    </div>
  )
}
