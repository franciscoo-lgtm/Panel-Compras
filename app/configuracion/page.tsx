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
        Conectá la planilla de Comex para que el sistema arme automáticamente los embarques.
      </p>

      {/* ── Cómo funciona ────────────────────────────────────────────────── */}
      <details className="mb-6 rounded-lg border border-white/[0.06] bg-[#0a0a0a] group" open={!cfg}>
        <summary className="cursor-pointer px-4 py-3 flex items-center gap-2 text-[12px] font-display font-semibold text-white uppercase tracking-wide hover:bg-white/[0.02] transition-colors list-none [&::-webkit-details-marker]:hidden">
          <Layers className="w-4 h-4 text-[#E30613]" />
          Cómo funciona la planilla
          <ArrowRight className="w-3.5 h-3.5 ml-auto text-zinc-500 transition-transform group-open:rotate-90" />
        </summary>

        <div className="px-4 pb-4 text-[12px] text-zinc-400 space-y-4 border-t border-white/[0.04] pt-4">
          <p>
            El sistema toma cada <strong className="text-white">CIPLItem</strong> que cargás en{' '}
            <code className="px-1 py-0.5 rounded bg-white/[0.06] text-[11px]">/comercial</code>, mira su{' '}
            <strong className="text-emerald-400 font-mono">soPrincipal</strong>, y lo busca en la planilla de Comex.
            La fila encontrada le da su <strong className="text-white">N° Embarque</strong> + datos de tracking.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.04] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                <strong className="text-[11px] uppercase tracking-wider text-emerald-400">Obligatorias (vos elegís)</strong>
              </div>
              <ul className="space-y-1 text-[11px] mt-2">
                <li><strong className="text-white">Columna SO</strong> — join contra <code className="text-[10px]">CIPLItem.soPrincipal</code></li>
                <li><strong className="text-white">Columna N° Embarque</strong> — agrupa SOs en embarques</li>
              </ul>
            </div>

            <div className="rounded-md border border-blue-500/30 bg-blue-500/[0.04] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Wand2 className="w-3.5 h-3.5 text-blue-400" />
                <strong className="text-[11px] uppercase tracking-wider text-blue-400">Auto-detectadas (por nombre)</strong>
              </div>
              <p className="text-[11px] mt-2 mb-1.5">
                Si una columna contiene en su header (case-insensitive):
              </p>
              <ul className="space-y-0.5 text-[11px] font-mono">
                <li><span className="text-zinc-500">·</span> <span className="text-blue-300">etd</span> → ETD</li>
                <li><span className="text-zinc-500">·</span> <span className="text-blue-300">eta</span> → ETA</li>
                <li><span className="text-zinc-500">·</span> <span className="text-blue-300">awb</span> → AWB</li>
                <li><span className="text-zinc-500">·</span> <span className="text-blue-300">arribo</span> → Arribo (= estado)</li>
              </ul>
            </div>

            <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.04] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <LinkIcon className="w-3.5 h-3.5 text-amber-400" />
                <strong className="text-[11px] uppercase tracking-wider text-amber-400">Extras (toggle)</strong>
              </div>
              <p className="text-[11px] mt-2">
                Cualquier otra columna que actives se muestra en el detalle del embarque,
                tab <strong className="text-white">Resumen → Datos de Comex</strong>.
              </p>
              <p className="text-[11px] mt-1.5 text-amber-300">
                Útil para: Estado, Comentarios, Forwarder, Naviera, ETA Caldas, etc.
              </p>
            </div>
          </div>

          <div className="rounded-md border border-white/[0.06] bg-[#0d0d0d] p-3 text-[11px]">
            <strong className="text-white block mb-1.5">💡 Split shipments</strong>
            <p>
              Si una SO viaja partida en varios embarques, la fila tiene listas <strong>coma-separadas paralelas</strong>:
            </p>
            <pre className="mt-2 p-2 bg-black rounded text-[10px] font-mono text-zinc-300 overflow-x-auto">{`SO         | N° Embarque         | ETD          | ETA
SO-1003    | EMB-045,EMB-046     | 15/06,20/06  | 28/06,02/07`}</pre>
            <p className="mt-1.5">
              El sistema parsea esto y muestra <strong className="text-white">SO-1003 en ambos embarques</strong>
              con sus fechas correspondientes.
            </p>
          </div>
        </div>
      </details>

      <ConfigClient initial={cfg} />
    </div>
  )
}
