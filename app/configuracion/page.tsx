export const dynamic = 'force-dynamic'

import { Settings, ArrowRight, Link as LinkIcon, KeyRound, Wand2, Layers } from 'lucide-react'
import { getComexConfig } from '@/app/lib/comex'
import { ConfigClient } from './ConfigClient'

export default async function ConfigPage() {
  const cfg = await getComexConfig()

  return (
    <div className="px-6 py-5 max-w-4xl">
      <div className="flex items-center gap-3 mb-2">
        <Settings className="w-5 h-5 text-[#E30613] shrink-0" />
        <h1 className="text-xl font-display font-semibold text-white tracking-tight">Configuración</h1>
      </div>

      <p className="text-[12px] text-zinc-500 mb-6">
        Conectá una o más planillas de Comex. Cada fuente declara qué columna alimenta cada hito del
        seguimiento (ETD, ETA, Arribo WH, Arribo Aduana, etc.). El sistema mergea todas las fuentes por SO.
      </p>

      {/* ── Cómo funciona ────────────────────────────────────────────────── */}
      <details className="mb-6 rounded-lg border border-white/[0.06] bg-[#0a0a0a] group" open={!cfg || cfg.sources.length === 0}>
        <summary className="cursor-pointer px-4 py-3 flex items-center gap-2 text-[12px] font-display font-semibold text-white uppercase tracking-wide hover:bg-white/[0.02] transition-colors list-none [&::-webkit-details-marker]:hidden">
          <Layers className="w-4 h-4 text-[#E30613]" />
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
            <div className="rounded-md border border-[#E30613]/30 bg-[#E30613]/[0.04] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <KeyRound className="w-3.5 h-3.5 text-[#E30613]" />
                <strong className="text-[11px] uppercase tracking-wider text-[#E30613]">Fuente principal</strong>
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
