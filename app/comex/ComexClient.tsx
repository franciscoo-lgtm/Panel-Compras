'use client'

import { useState, useTransition, useCallback } from 'react'
import {
  FileSpreadsheet, FileText, Pencil,
  X, Save, Loader2, CheckCircle2, ExternalLink, Search, Zap,
} from 'lucide-react'
import { updateCIPLItem } from '@/app/panel-general/actions'
import type { LiveDataMap, ExtraColumn } from '@/app/lib/comex-sources'

// ─── Types ────────────────────────────────────────────────────────────────────

type Item = {
  id: string; createdAt: Date; tipoCarga: string; categoryName: string | null
  asn: string | null; piNo: string | null; caseNo: string | null
  description: string | null; qty: number | null
  soPrincipal: string | null; soSecundario: string | null
  // Drive
  driveLinkExcel: string | null; driveLinkCi: string | null; driveLinkPl: string | null
  // Comex tracking
  avisoAgente: string | null; avisoConfirmacion: string | null
  arriboWh: Date | null; fotosAgente: string | null; paletizado: string | null
  fechaInstruccion: Date | null; confirmacionOk: string | null
  etd: Date | null; eta: Date | null; etaCaldas: Date | null; awb: string | null
}

type Status = 'pendiente' | 'avisado' | 'en-transito' | 'llegado' | 'entregado'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

const isoDate = (d: Date | null | undefined) =>
  d ? new Date(d).toISOString().split('T')[0] : ''

function getStatus(item: Item): Status {
  if (item.etaCaldas)  return 'entregado'
  if (item.arriboWh)   return 'llegado'
  if (item.etd)        return 'en-transito'
  if (item.avisoAgente) return 'avisado'
  return 'pendiente'
}

const STATUS_CFG: Record<Status, { label: string; bg: string; text: string; dot: string }> = {
  'pendiente':   { label: 'Pendiente',    bg: 'bg-zinc-100',    text: 'text-zinc-500',    dot: 'bg-zinc-400'    },
  'avisado':     { label: 'Avisado',      bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-400'   },
  'en-transito': { label: 'En tránsito',  bg: 'bg-sky-50',      text: 'text-sky-700',     dot: 'bg-sky-400'     },
  'llegado':     { label: 'Llegado WH',   bg: 'bg-orange-50',   text: 'text-orange-700',  dot: 'bg-orange-400'  },
  'entregado':   { label: 'Entregado',    bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500' },
}

function StatusBadge({ item }: { item: Item }) {
  const st  = getStatus(item)
  const cfg = STATUS_CFG[st]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─── Comex progress bar ───────────────────────────────────────────────────────

const STEPS = [
  { key: 'avisoAgente',      label: 'Aviso' },
  { key: 'avisoConfirmacion',label: 'Conf.' },
  { key: 'etd',              label: 'ETD'   },
  { key: 'arriboWh',         label: 'WH'    },
  { key: 'etaCaldas',        label: 'Caldas'},
]

function ProgressBar({ item }: { item: Item }) {
  const done = STEPS.filter(s => !!(item as Record<string, unknown>)[s.key]).length
  return (
    <div className="flex items-center gap-0.5">
      {STEPS.map((s, i) => {
        const filled = i < done
        return (
          <div key={s.key} title={s.label}
            className={`h-1.5 w-6 rounded-full transition-colors ${filled ? 'bg-indigo-400' : 'bg-zinc-200'}`} />
        )
      })}
    </div>
  )
}

// ─── Edit Drawer ──────────────────────────────────────────────────────────────

function ComexDrawer({
  item, onClose, onSaved,
}: {
  item: Item
  onClose: () => void
  onSaved: (id: string, fields: Record<string, string>) => void
}) {
  const [fields, setFields] = useState<Record<string, string>>({
    avisoAgente:       item.avisoAgente      ?? '',
    avisoConfirmacion: item.avisoConfirmacion?? '',
    arriboWh:          isoDate(item.arriboWh),
    fotosAgente:       item.fotosAgente      ?? '',
    paletizado:        item.paletizado       ?? '',
    fechaInstruccion:  isoDate(item.fechaInstruccion),
    confirmacionOk:    item.confirmacionOk   ?? '',
    etd:               isoDate(item.etd),
    eta:               isoDate(item.eta),
    etaCaldas:         isoDate(item.etaCaldas),
    awb:               item.awb              ?? '',
  })
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields(p => ({ ...p, [k]: e.target.value }))

  function handleSave() {
    setSaved(false)
    start(async () => {
      const res = await updateCIPLItem(item.id, fields)
      if (res.ok) { setSaved(true); onSaved(item.id, fields) }
    })
  }

  const isRep = item.tipoCarga === 'Repuesto'
  const driveLinks = [
    item.driveLinkExcel && { label: isRep ? 'Excel' : 'Excel', href: item.driveLinkExcel },
    item.driveLinkCi    && { label: 'CI', href: item.driveLinkCi },
    item.driveLinkPl    && { label: 'PL', href: item.driveLinkPl },
  ].filter(Boolean) as { label: string; href: string }[]

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              {isRep
                ? <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                : <FileText        className="w-3.5 h-3.5 text-red-400" />}
              <p className="text-xs text-zinc-400">{item.tipoCarga} · {item.categoryName ?? '—'}</p>
            </div>
            <p className="text-sm font-semibold text-zinc-900 font-mono truncate max-w-[280px]">
              {item.piNo ?? item.asn ?? item.id}
            </p>
            {item.soPrincipal && (
              <p className="text-xs text-amber-600 font-mono mt-0.5">{item.soPrincipal}</p>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-100 text-zinc-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* Drive links */}
          {driveLinks.length > 0 && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Archivos Drive</p>
              <div className="flex flex-wrap gap-2">
                {driveLinks.map(({ label, href }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition-colors">
                    <ExternalLink className="w-3 h-3" />
                    {label}
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Comex Tracking */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 mb-3">Comex Tracking</p>
            <div className="space-y-3">
              <F label="Aviso Agente">
                <input value={fields.avisoAgente} onChange={set('avisoAgente')} className="ib" placeholder="Fecha o descripción…" />
              </F>
              <F label="Confirmación Agente">
                <input value={fields.avisoConfirmacion} onChange={set('avisoConfirmacion')} className="ib" />
              </F>
              <F label="Arribo WH Airsea">
                <input type="date" value={fields.arriboWh} onChange={set('arriboWh')} className="ib" />
              </F>
              <F label="Fotos Agente">
                <input value={fields.fotosAgente} onChange={set('fotosAgente')} className="ib" placeholder="Link o fecha…" />
              </F>
              <F label="Paletizado">
                <input value={fields.paletizado} onChange={set('paletizado')} className="ib" />
              </F>
              <F label="Fecha Instrucción">
                <input type="date" value={fields.fechaInstruccion} onChange={set('fechaInstruccion')} className="ib" />
              </F>
              <F label="Confirmación OK (Despachante + Her)">
                <input value={fields.confirmacionOk} onChange={set('confirmacionOk')} className="ib" />
              </F>
              <div className="grid grid-cols-3 gap-2">
                <F label="ETD">
                  <input type="date" value={fields.etd} onChange={set('etd')} className="ib" />
                </F>
                <F label="ETA">
                  <input type="date" value={fields.eta} onChange={set('eta')} className="ib" />
                </F>
                <F label="ETA Caldas">
                  <input type="date" value={fields.etaCaldas} onChange={set('etaCaldas')} className="ib" />
                </F>
              </div>
              <F label="AWB">
                <input value={fields.awb} onChange={set('awb')} className="ib font-mono" placeholder="Airway Bill Number…" />
              </F>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-100 px-5 py-4 flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" />Guardado
            </span>
          )}
          <button onClick={handleSave} disabled={pending}
            className="ml-auto h-9 px-5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold text-sm flex items-center gap-2">
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar
          </button>
        </div>
      </div>
    </>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide block mb-1">{label}</label>
      {children}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type FilterStatus = 'all' | Status

function matchesSearch(item: Item, q: string): boolean {
  if (!q) return true
  const lq = q.toLowerCase()
  return [item.piNo, item.asn, item.soPrincipal, item.description, item.awb, item.categoryName]
    .some(v => v?.toLowerCase().includes(lq))
}

function getLive(item: Item, fieldKey: string, liveData: LiveDataMap): string | null {
  const so = item.soPrincipal?.trim().toUpperCase()
  if (!so) return null
  return liveData[so]?.[fieldKey] ?? null
}

function LiveVal({ liveVal, fallback }: { liveVal: string | null; fallback: React.ReactNode }) {
  if (liveVal) {
    return <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />{liveVal}</span>
  }
  return <>{fallback}</>
}

export default function ComexClient({
  initialItems,
  liveData,
  extraColumns,
}: {
  initialItems: Item[]
  liveData: LiveDataMap
  extraColumns: ExtraColumn[]
}) {
  const [items,   setItems]   = useState<Item[]>(initialItems)
  const [filter,  setFilter]  = useState<FilterStatus>('all')
  const [search,  setSearch]  = useState('')
  const [editing, setEditing] = useState<Item | null>(null)

  const gl = (item: Item, key: string) => getLive(item, key, liveData)
  const hasLive = Object.keys(liveData).length > 0

  const byStatus = filter === 'all' ? items : items.filter(i => getStatus(i) === filter)
  const filtered = byStatus.filter(i => matchesSearch(i, search))

  const handleSaved = useCallback((id: string, fields: Record<string, string>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const next = { ...item, ...fields }
      for (const k of ['arriboWh', 'fechaInstruccion', 'etd', 'eta', 'etaCaldas'] as const) {
        (next as Record<string, unknown>)[k] = fields[k] ? new Date(fields[k]) : null
      }
      return next as Item
    }))
    setEditing(prev => prev?.id === id ? ({ ...prev, ...fields } as Item) : prev)
  }, [])

  const filterTabs: { key: FilterStatus; label: string }[] = [
    { key: 'all',         label: `Todos (${items.length})` },
    { key: 'pendiente',   label: `Pendiente (${items.filter(i => getStatus(i) === 'pendiente').length})` },
    { key: 'avisado',     label: `Avisado (${items.filter(i => getStatus(i) === 'avisado').length})` },
    { key: 'en-transito', label: `En tránsito (${items.filter(i => getStatus(i) === 'en-transito').length})` },
    { key: 'llegado',     label: `Llegado WH (${items.filter(i => getStatus(i) === 'llegado').length})` },
    { key: 'entregado',   label: `Entregado (${items.filter(i => getStatus(i) === 'entregado').length})` },
  ]

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Filter tabs */}
        <div className="flex gap-1 flex-wrap bg-zinc-100 rounded-xl p-1">
          {filterTabs.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filter === t.key ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-300 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar PI No, SO, AWB, descripción…"
            className="w-full h-9 pl-8 pr-3 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-zinc-300"
          />
        </div>
        {search && (
          <span className="text-xs text-zinc-400">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
        )}
        {hasLive && (
          <span className="flex items-center gap-1.5 text-[11px] text-green-600 font-medium ml-auto">
            <Zap className="w-3 h-3" />Datos en vivo activos
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[640px]">
          <table className="w-full text-xs border-collapse" style={{ minWidth: `${1420 + extraColumns.length * 120}px` }}>
            <thead className="sticky top-0 z-10 bg-zinc-50">
              <tr className="border-b border-zinc-100">
                {([
                  ['Estado',      'w-28'],
                  ['Progreso',    'w-32'],
                  ['Tipo',        'w-20'],
                  ['PI No',       'w-28'],
                  ['Category',    'w-24'],
                  ['SO Principal','w-28'],
                  ['Descripción', 'min-w-[160px]'],
                  ['Drive',       'w-20'],
                  ['Aviso Ag.',   'w-24'],
                  ['Confirmado',  'w-24'],
                  ['Arribo WH',   'w-20'],
                  ['ETD',         'w-20'],
                  ['ETA',         'w-20'],
                  ['ETA Caldas',  'w-22'],
                  ['AWB',         'w-28'],
                  ...extraColumns.map(c => [c.label, 'w-28 text-violet-500']),
                  ['',            'w-10'],
                ] as [string, string][]).map(([lbl, cls]) => (
                  <th key={lbl}
                    className={`px-2 py-2.5 first:pl-5 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400 ${cls}`}>
                    {lbl}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const isRep = item.tipoCarga === 'Repuesto'
                return (
                  <tr key={item.id} className="border-b border-zinc-50 hover:bg-zinc-50/60 transition-colors">

                    <td className="pl-5 pr-2 py-3">
                      <StatusBadge item={item} />
                    </td>

                    <td className="px-2 py-3">
                      <ProgressBar item={item} />
                    </td>

                    <td className="px-2 py-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isRep ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                      }`}>
                        {isRep
                          ? <FileSpreadsheet className="w-2.5 h-2.5" />
                          : <FileText        className="w-2.5 h-2.5" />}
                        {item.tipoCarga}
                      </span>
                    </td>

                    <td className="px-2 py-3 font-mono text-zinc-600">{item.piNo ?? item.asn ?? '—'}</td>
                    <td className="px-2 py-3 text-zinc-500">{item.categoryName ?? '—'}</td>
                    <td className="px-2 py-3">
                      {item.soPrincipal
                        ? <span className="font-mono text-[11px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded">{item.soPrincipal}</span>
                        : <span className="text-zinc-300 italic text-[10px]">sin SO</span>}
                    </td>
                    <td className="px-2 py-3 max-w-[160px]">
                      <span className="line-clamp-1 text-zinc-700" title={item.description ?? ''}>
                        {item.description ?? '—'}
                      </span>
                    </td>

                    {/* Drive links */}
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-0.5">
                        {item.driveLinkExcel
                          ? <a href={item.driveLinkExcel} target="_blank" rel="noopener noreferrer"
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                              title="Excel CIPL">XLS</a>
                          : <span className="text-[9px] px-1.5 py-0.5 rounded text-zinc-200">XLS</span>}
                        {item.driveLinkCi
                          ? <a href={item.driveLinkCi} target="_blank" rel="noopener noreferrer"
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                              title="Commercial Invoice">CI</a>
                          : <span className="text-[9px] px-1.5 py-0.5 rounded text-zinc-200">CI</span>}
                        {item.driveLinkPl
                          ? <a href={item.driveLinkPl} target="_blank" rel="noopener noreferrer"
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                              title="Packing List">PL</a>
                          : <span className="text-[9px] px-1.5 py-0.5 rounded text-zinc-200">PL</span>}
                      </div>
                    </td>

                    <td className="px-2 py-3 text-zinc-500">
                      <LiveVal liveVal={gl(item, 'avisoAgente')} fallback={item.avisoAgente ?? <span className="text-zinc-200">—</span>} />
                    </td>
                    <td className="px-2 py-3 text-zinc-500">
                      <LiveVal liveVal={gl(item, 'avisoConfirmacion')} fallback={item.avisoConfirmacion ?? <span className="text-zinc-200">—</span>} />
                    </td>
                    <td className="px-2 py-3 text-zinc-500 whitespace-nowrap">
                      <LiveVal liveVal={gl(item, 'arriboWh')} fallback={fmtDate(item.arriboWh)} />
                    </td>
                    <td className="px-2 py-3 text-zinc-500 whitespace-nowrap">
                      <LiveVal liveVal={gl(item, 'etd')} fallback={fmtDate(item.etd)} />
                    </td>
                    <td className="px-2 py-3 text-zinc-500 whitespace-nowrap">
                      <LiveVal liveVal={gl(item, 'eta')} fallback={fmtDate(item.eta)} />
                    </td>
                    <td className="px-2 py-3 text-zinc-500 whitespace-nowrap">
                      <LiveVal liveVal={gl(item, 'etaCaldas')} fallback={fmtDate(item.etaCaldas)} />
                    </td>
                    <td className="px-2 py-3 font-mono text-zinc-600">
                      <LiveVal liveVal={gl(item, 'awb')} fallback={item.awb ?? <span className="text-zinc-200">—</span>} />
                    </td>

                    {/* Extra columns */}
                    {extraColumns.map(c => (
                      <td key={c.fieldKey} className="px-2 py-3 text-violet-600">
                        {gl(item, c.fieldKey) ?? <span className="text-zinc-200">—</span>}
                      </td>
                    ))}

                    <td className="px-2 py-3 text-center">
                      <button
                        onClick={() => setEditing(item)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-indigo-50 text-zinc-300 hover:text-indigo-500 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <ComexDrawer
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={(id, fields) => { handleSaved(id, fields) }}
        />
      )}

      <style>{`.ib { width: 100%; height: 32px; padding: 0 10px; font-size: 12px; border-radius: 8px; border: 1px solid #e4e4e7; outline: none; background: white; } .ib:focus { border-color: #6366f1; box-shadow: 0 0 0 2px #eef2ff; }`}</style>
    </div>
  )
}
