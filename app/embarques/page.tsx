export const dynamic = 'force-dynamic'

import { AlertCircle } from 'lucide-react'
import { listEmbarques } from '@/app/lib/embarques'
import { EmbarquesListClient } from './EmbarquesListClient'
import { PageHeader } from '@/components/shared/PageHeader'

export default async function EmbarquesPage() {
  const { summaries, errors } = await listEmbarques()
  const withCipl = summaries.filter(s => s.totalItems > 0).length

  return (
    <div className="px-8 py-10 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="Bidcom Agro · Logística"
        title="Embarques."
        description="Tracking en vivo de los embarques importados, sincronizado con la planilla Comex."
        meta={`${withCipl} con CIPL · ${summaries.length} total`}
      />

      {errors.length > 0 && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.03] text-[12px] text-amber-200/90 fade-rise fade-rise-1">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium mb-1 text-amber-200">Aviso al leer la planilla Comex:</p>
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
