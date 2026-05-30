export const dynamic = 'force-dynamic'

import NextLink from 'next/link'
import { ArrowRight, Link as LinkIcon, KeyRound, Wand2, Layers } from 'lucide-react'
import { getComexConfig } from '@/app/lib/comex'
import { ConfigClient } from './ConfigClient'
import { PageHeader } from '@/components/shared/PageHeader'

export default async function ConfigPage() {
  const cfg = await getComexConfig()

  return (
    <div className="px-8 py-10 max-w-[1100px] mx-auto">
      <PageHeader
        eyebrow="Bidcom Agro · Sistema"
        title="Configuración."
        description="Planillas de Comex conectadas, mapeo de hitos y fuentes de datos del seguimiento."
        action={
          <NextLink
            href="/configuracion/hitos"
            className="px-3 py-2 rounded-lg text-[11px] font-medium border border-white/[0.08] hover:border-[#31AF4F]/40 hover:bg-[#31AF4F]/10 text-white/65 hover:text-white inline-flex items-center gap-1.5 transition-colors"
          >
            Hitos del proceso →
          </NextLink>
        }
      />

      {/* ── Cómo funciona ────────────────────────────────────────────────── */}
      <details className="mb-6 rounded-lg border border-white/[0.06] bg-[#0a0a0a] group" open={!cfg || cfg.sources.length === 0}>
        <summary className="cursor-pointer px-4 py-3 flex items-center gap-2 text-[12px] font-display font-semibold text-white uppercase tracking-wide hover:bg-white/[0.02] transition-colors list-none [&::-webkit-details-marker]:hidden">
          <Layers className="w-4 h-4 text-[#31AF4F]" />
          Cómo funciona la planilla
          <ArrowRight className="w-3.5 h-3.5 ml-auto text-zinc-500 transition-transform group-open:rotate-90" />
        </summary>

        <div className="px-4 pb-4 text-[12px] text-zinc-400 space-y-4 border-t border-white/[0.04] pt-4">
          <p>
            Conectás <strong className="text-white">una o más planillas</strong> (típicamente: una de Airsea, otra de Aduana,
            otra de Depósito). Cada una declara qué columna alimenta cada hito. El sistema:
          </p>
          <ol className="list-decimal pl-5 space-y-1 text-[11px]">
            <li>Toma cada <strong className="text-emerald-400 font-mono">CIPLItem.soPrincipal</strong> de la DB</li>
            <li>Lo busca en TODAS las fuentes habilitadas (cada una por su propia columna SO)</li>
            <li>Mergea los datos: ETD viene de una, Arribo Aduana de otra, etc.</li>
          </ol>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-md border border-[#31AF4F]/30 bg-[#31AF4F]/[0.04] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <KeyRound className="w-3.5 h-3.5 text-[#31AF4F]" />
                <strong className="text-[11px] uppercase tracking-wider text-[#31AF4F]">Fuente principal</strong>
              </div>
              <p className="text-[11px] mt-2">
                Una de las fuentes tiene que tener la columna <strong className="text-white">N° Embarque</strong>.
                Marcala como principal con la ⭐.
              </p>
              <p className="text-[11px] mt-1.5">
                Es la que define qué embarques existen y qué SOs los componen.
              </p>
            </div>

            <div className="rounded-md border border-blue-500/30 bg-blue-500/[0.04] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Wand2 className="w-3.5 h-3.5 text-blue-400" />
                <strong className="text-[11px] uppercase tracking-wider text-blue-400">Mapeo de hitos</strong>
              </div>
              <p className="text-[11px] mt-2 mb-1.5">
                Por cada columna de la sheet, elegís a qué hito alimenta:
              </p>
              <ul className="space-y-0.5 text-[11px]">
                <li className="text-blue-300">⏱ ETD, ETA</li>
                <li className="text-blue-300">⏱ Arribo WH, Aduana, Depósito</li>
                <li className="text-blue-300">ℹ AWB, Estado</li>
                <li className="text-amber-300">+ Extras libres</li>
              </ul>
            </div>

            <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.04] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <LinkIcon className="w-3.5 h-3.5 text-amber-400" />
                <strong className="text-[11px] uppercase tracking-wider text-amber-400">Quién ve qué</strong>
              </div>
              <ul className="space-y-1 text-[11px] mt-2">
                <li><strong className="text-white">/embarques</strong>: estado, ETD/ETA, AWB</li>
                <li><strong className="text-white">/compras/[id]</strong>: hitos del proceso</li>
                <li><strong className="text-white">Detalle embarque</strong>: extras libres</li>
              </ul>
            </div>
          </div>

          <div className="rounded-md border border-white/[0.06] bg-[#0d0d0d] p-3 text-[11px]">
            <strong className="text-white block mb-1.5">💡 Split shipments</strong>
            <p>
              En la fuente principal, si una SO viaja partida en varios embarques, la columna N° Embarque
              tiene listas <strong>coma-separadas paralelas</strong> con ETD/ETA:
            </p>
            <pre className="mt-2 p-2 bg-black rounded text-[10px] font-mono text-zinc-300 overflow-x-auto">{`SO         | N° Embarque         | ETD          | ETA
SO-1003    | EMB-045,EMB-046     | 15/06,20/06  | 28/06,02/07`}</pre>
            <p className="mt-1.5">
              El sistema parsea esto y muestra <strong className="text-white">SO-1003 en ambos embarques</strong>.
              Las fuentes secundarias no necesitan split — alimentan los hitos sin importar el embarque.
            </p>
          </div>
        </div>
      </details>

      <ConfigClient initial={cfg} />
    </div>
  )
}
