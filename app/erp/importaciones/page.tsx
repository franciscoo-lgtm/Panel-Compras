export const dynamic = 'force-dynamic'

import { AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { gasGet } from '@/app/lib/gas'

type Importacion = {
  importacion_id: string
  proveedor_id: string
  tipo: string
  descripcion?: string
  fecha_orden?: string
  fecha_llegada_estimada?: string
  estado: string
  total_usd?: number
  incoterm?: string
  notas?: string
}

type CompraLocal = {
  compra_id: string
  proveedor_id: string
  descripcion?: string
  fecha: string
  estado: string
  total_usd?: number
  notas?: string
}

const IMPORTACION_ESTADO: Record<string, { label: string; cls: string }> = {
  borrador:    { label: 'Borrador',     cls: 'bg-zinc-500/10    text-zinc-400    border-zinc-500/20'   },
  aprobada:    { label: 'Aprobada',     cls: 'bg-blue-500/15    text-blue-400    border-blue-500/30'   },
  en_transito: { label: 'En tránsito',  cls: 'bg-purple-500/15  text-purple-400  border-purple-500/30' },
  en_aduana:   { label: 'En aduana',    cls: 'bg-amber-500/15   text-amber-400   border-amber-500/30'  },
  recibida:    { label: 'Recibida',     cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'},
  cancelada:   { label: 'Cancelada',    cls: 'bg-red-500/15     text-red-400     border-red-500/30'    },
}

export default async function ImportacionesPage() {
  let importaciones: Importacion[] = []
  let comprasLocales: CompraLocal[] = []
  let error: string | null = null

  try {
    ;[importaciones, comprasLocales] = await Promise.all([
      gasGet<Importacion[]>('listarImportaciones'),
      gasGet<CompraLocal[]>('listarComprasLocales'),
    ])
  } catch (err) {
    error = (err as Error).message
  }

  const activas  = importaciones.filter(i => ['aprobada', 'en_transito', 'en_aduana'].includes(i.estado)).length
  const totalUSD = importaciones.reduce((s, i) => s + (i.total_usd ?? 0), 0)

  return (
    <div className="px-8 py-10 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="ERP · Abastecimiento"
        title="Importaciones."
        description="Órdenes de importación y compras locales desde apertura hasta recepción en almacén."
        meta={`${importaciones.length} importaciones · ${comprasLocales.length} compras locales`}
      />

      {error && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/[0.04] text-[12px] text-red-300 fade-rise">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total importaciones', value: importaciones.length.toString(),               delay: 1 },
          { label: 'En curso',            value: activas.toString(),                            delay: 2 },
          { label: 'Valor total USD',     value: `$${Math.round(totalUSD).toLocaleString()}`,  delay: 3 },
        ].map(({ label, value, delay }) => (
          <div key={label} className={`glass-card p-5 fade-rise fade-rise-${delay}`}>
            <p className="eyebrow mb-3">{label}</p>
            <p className="text-[28px] font-display font-bold text-white tabular-nums leading-none">{value}</p>
          </div>
        ))}
      </div>

      {/* Importaciones */}
      <section className="mb-10 fade-rise fade-rise-3">
        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-4">Importaciones</h2>
        {importaciones.length === 0 ? (
          <div className="glass-card p-10 text-center text-white/25 text-[13px]">
            {error ? 'Error al cargar' : 'Sin importaciones registradas'}
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-white/35 font-medium">ID</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Proveedor</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Tipo</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Descripción</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Estado</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Total USD</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Fecha orden</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">ETA</th>
                </tr>
              </thead>
              <tbody>
                {importaciones.map((imp, i) => {
                  const est = IMPORTACION_ESTADO[imp.estado] ?? { label: imp.estado, cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' }
                  return (
                    <tr key={imp.importacion_id}
                      className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-[10px] text-white/40">{imp.importacion_id}</td>
                      <td className="px-4 py-2.5 text-white/80">{imp.proveedor_id}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] text-white/45 uppercase tracking-wider">{imp.tipo}</span>
                      </td>
                      <td className="px-4 py-2.5 text-white/60 max-w-[200px] truncate">{imp.descripcion ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${est.cls}`}>
                          {est.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white/80">
                        {imp.total_usd != null ? `$${imp.total_usd.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-white/35 text-[11px]">
                        {imp.fecha_orden ? imp.fecha_orden.slice(0, 10) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-white/35 text-[11px]">
                        {imp.fecha_llegada_estimada ? imp.fecha_llegada_estimada.slice(0, 10) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Compras Locales */}
      <section className="fade-rise fade-rise-4">
        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-4">Compras Locales</h2>
        {comprasLocales.length === 0 ? (
          <div className="glass-card p-10 text-center text-white/25 text-[13px]">
            {error ? 'Error al cargar' : 'Sin compras locales registradas'}
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-white/35 font-medium">ID</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Proveedor</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Descripción</th>
                  <th className="text-left px-4 py-3 text-white/35 font-medium">Estado</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Total USD</th>
                  <th className="text-right px-4 py-3 text-white/35 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {comprasLocales.map((cl, i) => {
                  const est = IMPORTACION_ESTADO[cl.estado] ?? { label: cl.estado, cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' }
                  return (
                    <tr key={cl.compra_id}
                      className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-[10px] text-white/40">{cl.compra_id}</td>
                      <td className="px-4 py-2.5 text-white/80">{cl.proveedor_id}</td>
                      <td className="px-4 py-2.5 text-white/60 max-w-[240px] truncate">{cl.descripcion ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${est.cls}`}>
                          {est.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white/80">
                        {cl.total_usd != null ? `$${cl.total_usd.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-white/35 text-[11px]">
                        {cl.fecha ? cl.fecha.slice(0, 10) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
