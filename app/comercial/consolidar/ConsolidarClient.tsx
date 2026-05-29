'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Download, CheckSquare, Square, FileSpreadsheet, Trash2, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { deleteCIPLByAsn } from '@/app/lib/cipl-actions'
import { cn } from '@/lib/utils'

export type PLSummary = {
  asn: string
  items: number
  qty: number
  cbm: number
  gwKg: number
  sosCount: number
  sos: string[]
  piNo: string | null
  supplier: string | null
  tipoCarga: string
  categoryName: string | null
  loadedAt: string
  hasDriveLink: boolean
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function ConsolidarClient({ pls }: { pls: PLSummary[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filterTipo, setFilterTipo] = useState<'todos' | 'Repuesto' | 'Mercaderia'>('todos')
  const [confirmDeleteAsn, setConfirmDeleteAsn] = useState<string | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [deleting, startDelete] = useTransition()
  const [deleteResult, setDeleteResult] = useState<{
    ok: boolean; msg: string; details?: string
  } | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    return pls.filter(p => {
      if (filterTipo !== 'todos' && p.tipoCarga !== filterTipo) return false
      if (!q) return true
      return (
        p.asn.toUpperCase().includes(q) ||
        p.piNo?.toUpperCase().includes(q) ||
        p.supplier?.toUpperCase().includes(q) ||
        p.sos.some(so => so.includes(q)) ||
        p.categoryName?.toUpperCase().includes(q)
      )
    })
  }, [pls, query, filterTipo])

  // Si selecciono uno y después busco, el seleccionado puede no estar visible —
  // pero igual queda en la selección. Esto es intencional.
  function toggle(asn: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(asn)) next.delete(asn)
      else next.add(asn)
      return next
    })
  }

  function selectAllVisible() {
    setSelected(prev => {
      const next = new Set(prev)
      for (const p of filtered) next.add(p.asn)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function selectByPi(piNo: string | null) {
    if (!piNo) return
    setSelected(prev => {
      const next = new Set(prev)
      for (const p of pls) if (p.piNo === piNo) next.add(p.asn)
      return next
    })
  }

  const summary = useMemo(() => {
    const sel = pls.filter(p => selected.has(p.asn))
    return {
      pls: sel.length,
      items: sel.reduce((s, p) => s + p.items, 0),
      qty: sel.reduce((s, p) => s + p.qty, 0),
      cbm: sel.reduce((s, p) => s + p.cbm, 0),
      gwKg: sel.reduce((s, p) => s + p.gwKg, 0),
      sos: new Set(sel.flatMap(p => p.sos)).size,
      pis: new Set(sel.map(p => p.piNo).filter(Boolean)).size,
    }
  }, [pls, selected])

  const exportUrl = selected.size > 0
    ? `/api/comercial/export-consolidado?asns=${Array.from(selected).map(encodeURIComponent).join(',')}`
    : null

  function handleDeleteSingle(asn: string) {
    setDeleteResult(null)
    startDelete(async () => {
      const r = await deleteCIPLByAsn(asn)
      if (r.ok) {
        setDeleteResult({
          ok: true,
          msg: `PL ${r.asn} eliminado: ${r.itemsDeleted} ítems, ${r.photosDeleted} fotos, ${r.driveFilesDeleted} archivos Drive`,
          details: r.driveErrors.length > 0 ? `Errores en Drive: ${r.driveErrors.join(' · ')}` : undefined,
        })
        setSelected(prev => {
          const next = new Set(prev)
          next.delete(asn)
          return next
        })
        setConfirmDeleteAsn(null)
        router.refresh()
      } else {
        setDeleteResult({ ok: false, msg: `Error al eliminar ${r.asn}: ${r.error}` })
      }
    })
  }

  function handleDeleteSelected() {
    setDeleteResult(null)
    const list = Array.from(selected)
    if (list.length === 0) return
    startDelete(async () => {
      let totalItems = 0, totalPhotos = 0, totalDrive = 0
      const errs: string[] = []
      const failed: string[] = []
      for (const asn of list) {
        const r = await deleteCIPLByAsn(asn)
        if (r.ok) {
          totalItems += r.itemsDeleted
          totalPhotos += r.photosDeleted
          totalDrive += r.driveFilesDeleted
          if (r.driveErrors.length > 0) errs.push(`${asn}: ${r.driveErrors.length} archivos Drive con error`)
        } else {
          failed.push(`${asn}: ${r.error}`)
        }
      }
      const okCount = list.length - failed.length
      setDeleteResult({
        ok: failed.length === 0,
        msg: failed.length === 0
          ? `${okCount} PLs eliminados: ${totalItems} ítems, ${totalPhotos} fotos, ${totalDrive} archivos Drive`
          : `${okCount}/${list.length} PLs eliminados. Fallaron: ${failed.length}`,
        details: [...errs, ...failed].join(' · ') || undefined,
      })
      setSelected(new Set())
      setConfirmBulkDelete(false)
      router.refresh()
    })
  }

  if (pls.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] py-12 text-center">
        <FileSpreadsheet className="w-8 h-8 mx-auto text-zinc-700 mb-2" />
        <p className="text-zinc-500 text-[12px]">No hay PLs cargados todavía.</p>
        <p className="text-zinc-600 text-[10px] mt-1">Cargá uno desde Carga CIPL.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['todos', 'Repuesto', 'Mercaderia'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilterTipo(t)}
            className={cn(
              'px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors',
              filterTipo === t
                ? 'bg-[#E30613]/10 text-white border-[#E30613]/40'
                : 'bg-transparent text-zinc-400 border-white/[0.08] hover:text-white',
            )}
          >
            {t === 'todos' ? 'Todos' : t}
            <span className="text-zinc-500 ml-1">
              ({pls.filter(p => t === 'todos' || p.tipoCarga === t).length})
            </span>
          </button>
        ))}

        <div className="ml-auto relative w-full md:w-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar ASN, PI, proveedor, SO…"
            className="pl-8 pr-3 py-1.5 w-full md:w-80 rounded-md text-[11px] bg-[#0d0d0d] border border-white/[0.08] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#E30613]/50"
          />
        </div>
      </div>

      {/* Bar de selección */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-md border border-white/[0.06] bg-[#0a0a0a] flex-wrap">
        <span className="text-[11px] text-zinc-400">
          {selected.size > 0 ? <strong className="text-white">{selected.size} PLs</strong> : '0 PLs'} seleccionados
          {selected.size > 0 && (
            <span className="text-zinc-500 ml-2">
              · {summary.items} ítems · {summary.qty.toLocaleString()} unidades · {summary.cbm.toFixed(2)} CBM · {summary.gwKg.toFixed(1)} kg
              {summary.pis > 1 && <span className="text-amber-400 ml-2">⚠ {summary.pis} PIs distintos</span>}
            </span>
          )}
        </span>

        {filtered.length > 0 && filtered.every(p => selected.has(p.asn)) ? (
          <button onClick={clearSelection} className="text-[10px] text-zinc-400 hover:text-white inline-flex items-center gap-1">
            <Square className="w-3 h-3" /> Limpiar selección
          </button>
        ) : (
          <button onClick={selectAllVisible} className="text-[10px] text-zinc-400 hover:text-white inline-flex items-center gap-1">
            <CheckSquare className="w-3 h-3" /> Seleccionar todos los visibles
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && !confirmBulkDelete && (
            <button
              onClick={() => setConfirmBulkDelete(true)}
              disabled={deleting}
              className="px-3 py-1.5 rounded-md text-[11px] font-medium border border-red-500/30 bg-red-500/[0.05] hover:bg-red-500/[0.1] text-red-400 inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar {selected.size}
            </button>
          )}

          {confirmBulkDelete && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-red-500/40 bg-red-500/[0.08]">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="text-[11px] text-red-300">Eliminar {selected.size} PLs + sus archivos Drive?</span>
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="px-2 py-0.5 rounded text-[11px] font-medium bg-red-500 hover:bg-red-500/85 text-white inline-flex items-center gap-1 disabled:opacity-40"
              >
                {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Sí
              </button>
              <button
                onClick={() => setConfirmBulkDelete(false)}
                disabled={deleting}
                className="px-2 py-0.5 rounded text-[11px] font-medium border border-white/[0.15] hover:bg-white/[0.06] text-zinc-300"
              >
                Cancelar
              </button>
            </div>
          )}

          <a
            href={exportUrl ?? '#'}
            onClick={e => { if (!exportUrl) e.preventDefault() }}
            className={cn(
              'px-3 py-1.5 rounded-md text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors',
              exportUrl
                ? 'bg-[#E30613] hover:bg-[#E30613]/85 text-white'
                : 'bg-white/[0.04] text-zinc-600 cursor-not-allowed',
            )}
            download
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Consolidado{selected.size > 0 ? ` (${selected.size})` : ''}
          </a>
        </div>
      </div>

      {/* Banner de resultado del delete */}
      {deleteResult && (
        <div className={cn(
          'rounded-md border p-3 text-[11px] flex items-start gap-2',
          deleteResult.ok
            ? 'border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-300'
            : 'border-red-500/30 bg-red-500/[0.05] text-red-300',
        )}>
          {deleteResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <div className="flex-1">
            <p>{deleteResult.msg}</p>
            {deleteResult.details && <p className="text-[10px] text-amber-400 mt-1">{deleteResult.details}</p>}
          </div>
          <button onClick={() => setDeleteResult(null)} className="text-zinc-500 hover:text-white text-[10px]">×</button>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[12px]">
            <thead>
              <tr className="bg-[#0d0d0d] border-b border-white/[0.06]">
                <th className="px-2 py-2.5 w-10"></th>
                <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">ASN</th>
                <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Tipo</th>
                <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">PI</th>
                <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Proveedor</th>
                <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Cargado por</th>
                <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Ítems</th>
                <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">SOs</th>
                <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Qty</th>
                <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">CBM</th>
                <th className="text-right text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">GW kg</th>
                <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2.5">Cargado</th>
                <th className="px-2 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={13} className="px-4 py-10 text-center text-zinc-500">Sin PLs que coincidan</td></tr>
              )}
              {filtered.map(p => {
                const isChecked = selected.has(p.asn)
                return (
                  <tr
                    key={p.asn}
                    onClick={() => toggle(p.asn)}
                    className={cn(
                      'border-b border-white/[0.04] last:border-0 cursor-pointer transition-colors',
                      isChecked ? 'bg-[#E30613]/[0.04] hover:bg-[#E30613]/[0.08]' : 'hover:bg-white/[0.02]',
                    )}
                  >
                    <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(p.asn)}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-white">{p.asn}</td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        'inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
                        p.tipoCarga === 'Repuesto'
                          ? 'bg-blue-500/15 text-blue-400'
                          : 'bg-purple-500/15 text-purple-400',
                      )}>{p.tipoCarga}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-zinc-400">
                      {p.piNo ? (
                        <button
                          onClick={e => { e.stopPropagation(); selectByPi(p.piNo) }}
                          className="hover:text-amber-400 transition-colors"
                          title="Seleccionar todos los PLs con este PI"
                        >
                          {p.piNo}
                        </button>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-zinc-300 truncate max-w-[200px]">{p.supplier ?? '—'}</td>
                    <td className="px-3 py-2 text-zinc-500 text-[11px]">{p.categoryName ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">{p.items}</td>
                    <td className="px-3 py-2 text-right text-emerald-400 tabular-nums">{p.sosCount}</td>
                    <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">{p.qty.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-zinc-500 tabular-nums">{p.cbm.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-zinc-500 tabular-nums">{p.gwKg.toFixed(1)}</td>
                    <td className="px-3 py-2 text-zinc-500 text-[11px]">{fmtDate(p.loadedAt)}</td>
                    <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                      {confirmDeleteAsn === p.asn ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleDeleteSingle(p.asn)}
                            disabled={deleting}
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500 hover:bg-red-500/85 text-white inline-flex items-center gap-1 disabled:opacity-40"
                            title="Confirmar eliminación"
                          >
                            {deleting ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Trash2 className="w-2.5 h-2.5" />}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteAsn(null)}
                            disabled={deleting}
                            className="px-1.5 py-0.5 rounded text-[10px] text-zinc-400 hover:text-white"
                            title="Cancelar"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteAsn(p.asn)}
                          className="text-zinc-600 hover:text-red-400 transition-colors"
                          title="Eliminar PL (DB + Drive)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-zinc-600">
        Tip: hacé click en un PI Number para seleccionar todos los PLs que comparten ese PI. El Excel exportado tiene una fila por ítem de cualquier PL seleccionado, ordenado por ASN.
      </p>
    </div>
  )
}
