'use client'

import { useState, useTransition, useCallback, useMemo, useRef } from 'react'
import {
  FileSpreadsheet, FileText, Pencil,
  X, Save, Loader2, CheckCircle2, ExternalLink, Search, Zap,
  AlertTriangle, ChevronDown, ChevronUp, List, LayoutList,
} from 'lucide-react'
import { updateCIPLItem } from '@/app/panel-general/actions'
import type { LiveDataMap, ExtraColumn } from '@/app/lib/comex-sources'

// ─── Types ────────────────────────────────────────────────────────────────────

type Item = {
  id: string; createdAt: Date; tipoCarga: string; categoryName: string | null
  asn: string | null; piNo: string | null; caseNo: string | null
  description: string | null; qty: number | null
  qBultos: number | null; cbm: number | null; gwKg: number | null
  soPrincipal: string | null; soSecundario: string | null
  driveLinkExcel: string | null; driveLinkCi: string | null; driveLinkPl: string | null
}

type Status = 'pendiente' | 'avisado' | 'en-transito' | 'llegado' | 'entregado'

// ─── Toggleable logistics columns ─────────────────────────────────────────────

type ComexLogCol = 'avisoAgente' | 'avisoConfirmacion' | 'arriboWh' | 'etd' | 'eta' | 'etaCaldas' | 'awb'

const COMEX_LOG_COLS: { key: ComexLogCol; label: string; width: string }[] = [
  { key: 'avisoAgente',       label: 'Aviso Ag.',  width: 'w-24' },
  { key: 'avisoConfirmacion', label: 'Confirmado', width: 'w-24' },
  { key: 'arriboWh',          label: 'Arribo WH',  width: 'w-20' },
  { key: 'etd',               label: 'ETD',        width: 'w-20' },
  { key: 'eta',               label: 'ETA',        width: 'w-20' },
  { key: 'etaCaldas',         label: 'ETA Caldas', width: 'w-22' },
  { key: 'awb',               label: 'AWB',        width: 'w-28' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return null
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const isoDate = (d: Date | null | undefined) =>
  d ? new Date(d).toISOString().split('T')[0] : ''

const today = new Date(); today.setHours(0, 0, 0, 0)

function isOverdue(d: Date | null | undefined): boolean {
  if (!d) return false
  return new Date(d) < today
}

function diffDays(a: Date | null | undefined, b: Date | null | undefined): number | null {
  if (!a || !b) return null
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function getStatus(item: Item, liveData: LiveDataMap = {}): Status {
  if (effectiveDate(item, 'etaCaldas', liveData)) return 'entregado'
  if (effectiveDate(item, 'arriboWh',  liveData)) return 'llegado'
  if (effectiveDate(item, 'etd',       liveData)) return 'en-transito'
  if (effectiveStr(item,  'avisoAgente', liveData)) return 'avisado'
  return 'pendiente'
}

const STATUS_CFG: Record<Status, { label: string; bg: string; text: string; dot: string }> = {
  'pendiente':   { label: 'Pendiente',   bg: 'bg-white/[0.05]',   text: 'text-white/40',    dot: 'bg-white/30'    },
  'avisado':     { label: 'Avisado',     bg: 'bg-amber-400/10',   text: 'text-amber-300',   dot: 'bg-amber-400'   },
  'en-transito': { label: 'En tránsito', bg: 'bg-sky-400/10',     text: 'text-sky-300',     dot: 'bg-sky-400'     },
  'llegado':     { label: 'Llegado WH',  bg: 'bg-orange-400/10',  text: 'text-orange-300',  dot: 'bg-orange-400'  },
  'entregado':   { label: 'Entregado',   bg: 'bg-emerald-400/10', text: 'text-emerald-300', dot: 'bg-emerald-400' },
}

function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CFG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function getLive(item: Item, fieldKey: string, liveData: LiveDataMap): string | null {
  const nativeKeys = [
    item.soPrincipal  ? `so:${item.soPrincipal.trim().toUpperCase()}`  : null,
    item.soSecundario ? `so:${item.soSecundario.trim().toUpperCase()}` : null,
    item.asn          ? `asn:${item.asn.trim().toUpperCase()}`         : null,
    item.piNo         ? `piNo:${item.piNo.trim().toUpperCase()}`       : null,
  ].filter((k): k is string => !!k)

  for (const k of nativeKeys) {
    const v = liveData[k]?.[fieldKey]
    if (v != null) return v
  }

  // Secondary pass: resolve live-only join fields (e.g. embarqueNo) via native keys
  for (const k of nativeKeys) {
    const embarqueNo = liveData[k]?.['embarqueNo']?.trim().toUpperCase()
    if (embarqueNo) {
      const v = liveData[`embarqueNo:${embarqueNo}`]?.[fieldKey]
      if (v != null) return v
    }
  }

  return null
}

function effectiveDate(item: Item, field: string, liveData: LiveDataMap): Date | null {
  const lv = getLive(item, field, liveData)
  if (!lv) return null
  const d = new Date(lv)
  return isNaN(d.getTime()) ? null : d
}

function effectiveStr(item: Item, field: string, liveData: LiveDataMap): string | null {
  return getLive(item, field, liveData)
}

function matchesSearch(item: Item, q: string): boolean {
  if (!q) return true
  const lq = q.toLowerCase()
  return [item.piNo, item.asn, item.soPrincipal, item.description, item.categoryName]
    .some(v => v?.toLowerCase().includes(lq))
}

// ─── ASN Group type ───────────────────────────────────────────────────────────

type AsnGroup = {
  asn: string
  items: Item[]
  status: Status
  // consensus dates (take first non-null from any item in group)
  etd: Date | null
  eta: Date | null
  arriboWh: Date | null
  etaCaldas: Date | null
  awb: string | null
  sos: string[]
  piNos: string[]
  delayed: boolean
}

function buildAsnGroups(items: Item[], liveData: LiveDataMap): AsnGroup[] {
  const map = new Map<string, Item[]>()
  for (const item of items) {
    const key = item.asn ?? '(sin ASN)'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }

  return [...map.entries()].map(([asn, grpItems]) => {
    const firstDate = (field: 'etd' | 'eta' | 'arriboWh' | 'etaCaldas') =>
      grpItems.map(i => effectiveDate(i, field, liveData)).find(v => v != null) ?? null

    const etd      = firstDate('etd')
    const eta      = firstDate('eta')
    const arriboWh = firstDate('arriboWh')
    const etaCaldas = firstDate('etaCaldas')
    const awb      = grpItems.map(i => effectiveStr(i, 'awb', liveData)).find(v => !!v) ?? null

    const statuses: Status[] = grpItems.map(i => getStatus(i, liveData))
    const statusOrder: Status[] = ['entregado','llegado','en-transito','avisado','pendiente']
    const status = statusOrder.find(s => statuses.includes(s)) ?? 'pendiente'

    const sos = [...new Set(grpItems.flatMap(i => [i.soPrincipal, i.soSecundario]).filter(Boolean) as string[])]
    const piNos = [...new Set(grpItems.map(i => i.piNo).filter(Boolean) as string[])]

    const delayed = !arriboWh && !etaCaldas && !!eta && isOverdue(eta)

    return { asn, items: grpItems, status, etd, eta, arriboWh, etaCaldas, awb, sos, piNos, delayed }
  })
}

// ─── Timeline Step component ──────────────────────────────────────────────────

function TimelineStep({
  label, date, done, overdue, isLast,
}: {
  label: string; date: Date | null | undefined; done: boolean; overdue?: boolean; isLast?: boolean
}) {
  const d = fmtDate(date)
  return (
    <div className="flex items-center gap-0">
      <div className="flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
          done
            ? 'bg-indigo-500 border-indigo-500'
            : overdue
              ? 'bg-red-400/20 border-red-400'
              : 'bg-transparent border-white/20'
        }`} />
        <div className="flex flex-col items-center mt-1">
          <span className={`text-[9px] font-bold uppercase tracking-wide leading-none ${
            done ? 'text-indigo-400' : overdue ? 'text-red-400' : 'text-white/30'
          }`}>{label}</span>
          <span className={`text-[9px] mt-0.5 leading-none font-mono ${
            done ? 'text-indigo-300' : overdue ? 'text-red-400' : 'text-white/20'
          }`}>{d ?? '—'}</span>
        </div>
      </div>
      {!isLast && (
        <div className={`h-0.5 w-10 mb-5 flex-shrink-0 ${done ? 'bg-indigo-500/40' : 'bg-white/[0.06]'}`} />
      )}
    </div>
  )
}

// ─── ASN Timeline Card ────────────────────────────────────────────────────────

function AsnCard({
  group, onEdit, liveData, extraColumns, visibleExtraCols, expanded, onToggle,
}: {
  group: AsnGroup
  onEdit: (item: Item) => void
  liveData: LiveDataMap
  extraColumns: ExtraColumn[]
  visibleExtraCols: Set<string>
  expanded: boolean
  onToggle: () => void
}) {

  const etdDone   = !!group.etd
  const etaDone   = !!group.arriboWh // ETA segment complete when arrived
  const arriboWh  = !!group.arriboWh
  const caldas    = !!group.etaCaldas

  const transitDays = diffDays(group.etd, group.arriboWh ?? group.eta)
  const isRep = group.items[0]?.tipoCarga === 'Repuesto'

  return (
    <div className={`bg-white/[0.03] rounded-xl border overflow-hidden transition-all ${
      group.delayed ? 'border-red-500/30' : 'border-white/[0.06]'
    }`}>
      {/* Card header */}
      <div className="flex items-start gap-4 px-5 py-4">
        {/* ASN + status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-sm font-bold text-white">{group.asn}</span>
            <StatusBadge status={group.status} />
            {group.delayed && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-400/10 text-red-400">
                <AlertTriangle className="w-3 h-3" /> Demorado
              </span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
              isRep ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'
            }`}>{group.items[0]?.tipoCarga}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-white/30 flex-wrap">
            {group.piNos.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {group.piNos.map(pi => (
                  <span key={pi} className="font-mono text-[10px] bg-amber-400/15 text-amber-300 px-1.5 py-0.5 rounded">{pi}</span>
                ))}
              </div>
            )}
            {group.sos.length > 0 && (
              <span className="text-white/30">{group.sos.length} SO{group.sos.length !== 1 ? 's' : ''}</span>
            )}
            <span>{group.items.length} ítem{group.items.length !== 1 ? 's' : ''}</span>
            {group.awb && <span className="font-mono text-white/40">AWB: {group.awb}</span>}
            {transitDays != null && (
              <span className="text-indigo-400">{transitDays}d tránsito</span>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="flex items-start pt-1 shrink-0">
          <TimelineStep label="ETD"    date={group.etd}      done={etdDone} overdue={!etdDone && isOverdue(group.etd)} />
          <TimelineStep label="ETA"    date={group.eta}      done={etaDone} overdue={group.delayed} />
          <TimelineStep label="WH"     date={group.arriboWh} done={arriboWh} overdue={!arriboWh && isOverdue(group.eta)} />
          <TimelineStep label="Caldas" date={group.etaCaldas}done={caldas} isLast />
        </div>

        {/* Expand toggle */}
        <button
          onClick={onToggle}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-white/30 shrink-0 mt-0.5"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded: individual items */}
      {expanded && (
        <div className="border-t border-white/[0.04] divide-y divide-white/[0.04]">
          {group.items.map(item => {
            const gl = (k: string) => getLive(item, k, liveData)
            return (
              <div key={item.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.02] transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-white/50">{item.piNo ?? item.caseNo ?? item.id.slice(0, 8)}</span>
                    {item.soPrincipal && (
                      <span className="font-mono text-[10px] bg-amber-400/15 text-amber-300 px-1.5 py-0.5 rounded">{item.soPrincipal}</span>
                    )}
                    {item.categoryName && <span className="text-[10px] text-white/30">{item.categoryName}</span>}
                  </div>
                  {item.description && (
                    <p className="text-[11px] text-white/40 truncate mt-0.5">{item.description}</p>
                  )}
                </div>

                {/* Drive links */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {item.driveLinkExcel
                    ? <a href={item.driveLinkExcel} target="_blank" rel="noopener noreferrer"
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20">XLS</a>
                    : <span className="text-[9px] px-1.5 py-0.5 text-white/10">XLS</span>}
                  {item.driveLinkCi
                    ? <a href={item.driveLinkCi} target="_blank" rel="noopener noreferrer"
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400 hover:bg-blue-400/20">CI</a>
                    : <span className="text-[9px] px-1.5 py-0.5 text-white/10">CI</span>}
                  {item.driveLinkPl
                    ? <a href={item.driveLinkPl} target="_blank" rel="noopener noreferrer"
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-400/10 text-violet-400 hover:bg-violet-400/20">PL</a>
                    : <span className="text-[9px] px-1.5 py-0.5 text-white/10">PL</span>}
                </div>

                {/* Extra columns */}
                {extraColumns.filter(c => visibleExtraCols.has(c.fieldKey)).map(c => {
                  const v = gl(c.fieldKey)
                  return v ? (
                    <span key={c.fieldKey} className="text-[10px] text-violet-400 shrink-0">{c.label}: {v}</span>
                  ) : null
                })}

                <button
                  onClick={() => onEdit(item)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-indigo-400/10 text-white/20 hover:text-indigo-400 transition-colors shrink-0"
                  title="Editar"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
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
  const [fields, setFields] = useState<Record<string, string>>({})
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
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] bg-[#0f0f0f] border-l border-white/[0.06] shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              {isRep
                ? <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                : <FileText        className="w-3.5 h-3.5 text-red-400" />}
              <p className="text-xs text-white/30">{item.tipoCarga} · {item.categoryName ?? '—'}</p>
            </div>
            <p className="text-sm font-semibold text-white font-mono truncate max-w-[280px]">
              {item.piNo ?? item.asn ?? item.id}
            </p>
            {item.soPrincipal && (
              <p className="text-xs text-amber-300 font-mono mt-0.5">{item.soPrincipal}</p>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-white/30">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {driveLinks.length > 0 && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Archivos Drive</p>
              <div className="flex flex-wrap gap-2">
                {driveLinks.map(({ label, href }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-white/50 hover:bg-white/[0.08]">
                    <ExternalLink className="w-3 h-3" />{label}
                  </a>
                ))}
              </div>
            </section>
          )}

          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2">Tracking</p>
            <p className="text-xs text-white/30">Los datos de tracking se alimentan desde las fuentes configuradas en Operaciones.</p>
          </section>
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4 flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
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
      <label className="text-[10px] font-semibold text-white/30 uppercase tracking-wide block mb-1">{label}</label>
      {children}
    </div>
  )
}

// ─── List View (original table) ───────────────────────────────────────────────

type FilterStatus = 'all' | Status

function ListViewTable({
  items, onEdit, liveData, extraColumns, filter, search, visibleLogCols, visibleExtraCols,
}: {
  items: Item[]
  onEdit: (item: Item) => void
  liveData: LiveDataMap
  extraColumns: ExtraColumn[]
  filter: FilterStatus
  search: string
  visibleLogCols: Set<ComexLogCol>
  visibleExtraCols: Set<string>
}) {
  const gl = (item: Item, key: string) => getLive(item, key, liveData)
  const byStatus = filter === 'all' ? items : items.filter(i => getStatus(i, liveData) === filter)
  const filtered = byStatus.filter(i => matchesSearch(i, search))

  const [logColOrder, setLogColOrder] = useState<ComexLogCol[]>(() => {
    try {
      const saved = localStorage.getItem('comex-col-order')
      if (saved) return JSON.parse(saved) as ComexLogCol[]
    } catch {}
    return COMEX_LOG_COLS.map(c => c.key)
  })
  const dragLogRef = useRef<ComexLogCol | null>(null)

  function onLogDragStart(key: ComexLogCol, e: React.DragEvent) {
    dragLogRef.current = key
    e.dataTransfer.effectAllowed = 'move'
  }
  function onLogDragOver(key: ComexLogCol, e: React.DragEvent) {
    e.preventDefault()
    if (!dragLogRef.current || dragLogRef.current === key) return
    const src = dragLogRef.current
    const cols = [...logColOrder]
    const si = cols.indexOf(src)
    const di = cols.indexOf(key)
    if (si === -1 || di === -1) return
    cols.splice(si, 1)
    cols.splice(di, 0, src)
    setLogColOrder(cols)
    try { localStorage.setItem('comex-col-order', JSON.stringify(cols)) } catch {}
    dragLogRef.current = src
  }
  function onLogDragEnd() { dragLogRef.current = null }

  const visibleLogOrdered = logColOrder.filter(k => visibleLogCols.has(k))
  const logColMap = Object.fromEntries(COMEX_LOG_COLS.map(c => [c.key, c])) as Record<ComexLogCol, (typeof COMEX_LOG_COLS)[number]>

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">
      <div className="overflow-auto max-h-[640px]">
        <table className="w-full text-xs border-collapse" style={{ minWidth: `${1420 + extraColumns.filter(c => visibleExtraCols.has(c.fieldKey)).length * 120}px` }}>
          <thead className="sticky top-0 z-10 bg-[#0f0f0f]">
            <tr className="border-b border-white/[0.06]">
              {(([
                  ['Estado','w-28'], ['Tipo','w-20'], ['PI No','w-28'], ['SO Principal','w-28'],
                  ['Descripción','min-w-[140px]'], ['Drive','w-20'],
                ] as [string,string][])).map(([lbl, cls]) => (
                  <th key={lbl} className={`px-2 py-2.5 first:pl-5 text-left text-[10px] font-bold uppercase tracking-widest text-white/30 ${cls}`}>
                    {lbl}
                  </th>
                ))}
              {visibleLogOrdered.map(key => {
                const c = logColMap[key]
                return (
                  <th
                    key={key}
                    draggable
                    onDragStart={e => onLogDragStart(key, e)}
                    onDragOver={e  => onLogDragOver(key, e)}
                    onDragEnd={onLogDragEnd}
                    className={`px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-white/30 ${c.width} cursor-grab select-none hover:bg-white/[0.04] transition-colors`}
                    title="Arrastrá para reordenar"
                  >
                    {c.label}
                  </th>
                )
              })}
              {extraColumns.filter(c => visibleExtraCols.has(c.fieldKey)).map(c => (
                <th key={c.fieldKey} className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-violet-400 w-28">
                  {c.label}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const isRep = item.tipoCarga === 'Repuesto'
              return (
                <tr key={item.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="pl-5 pr-2 py-3"><StatusBadge status={getStatus(item, liveData)} /></td>
                  <td className="px-2 py-3">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isRep ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'
                    }`}>
                      {isRep ? <FileSpreadsheet className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                      {item.tipoCarga}
                    </span>
                  </td>
                  <td className="px-2 py-3 font-mono text-white/50">{item.piNo ?? item.asn ?? '—'}</td>
                  <td className="px-2 py-3">
                    {item.soPrincipal
                      ? <span className="font-mono text-[11px] bg-amber-400/15 text-amber-300 px-1.5 py-0.5 rounded">{item.soPrincipal}</span>
                      : <span className="text-white/20 italic text-[10px]">sin SO</span>}
                  </td>
                  <td className="px-2 py-3 max-w-[140px]">
                    <span className="line-clamp-1 text-white/60">{item.description ?? '—'}</span>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-0.5">
                      {item.driveLinkExcel
                        ? <a href={item.driveLinkExcel} target="_blank" rel="noopener noreferrer" className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400">XLS</a>
                        : <span className="text-[9px] px-1.5 py-0.5 text-white/10">XLS</span>}
                      {item.driveLinkCi
                        ? <a href={item.driveLinkCi} target="_blank" rel="noopener noreferrer" className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400">CI</a>
                        : <span className="text-[9px] px-1.5 py-0.5 text-white/10">CI</span>}
                      {item.driveLinkPl
                        ? <a href={item.driveLinkPl} target="_blank" rel="noopener noreferrer" className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-400/10 text-violet-400">PL</a>
                        : <span className="text-[9px] px-1.5 py-0.5 text-white/10">PL</span>}
                    </div>
                  </td>
                  {visibleLogOrdered.map(key => {
                    switch (key) {
                      case 'avisoAgente':       return <td key={key} className="px-2 py-3 text-white/40">{gl(item,'avisoAgente') ?? <span className="text-white/10">—</span>}</td>
                      case 'avisoConfirmacion': return <td key={key} className="px-2 py-3 text-white/40">{gl(item,'avisoConfirmacion') ?? <span className="text-white/10">—</span>}</td>
                      case 'arriboWh':          return <td key={key} className="px-2 py-3 text-white/40 whitespace-nowrap">{fmtDate(effectiveDate(item,'arriboWh',liveData)) ?? '—'}</td>
                      case 'etd':               return <td key={key} className="px-2 py-3 text-white/40 whitespace-nowrap">{fmtDate(effectiveDate(item,'etd',liveData)) ?? '—'}</td>
                      case 'eta':               {
                        const effEta = effectiveDate(item,'eta',liveData)
                        const effWh  = effectiveDate(item,'arriboWh',liveData)
                        const over   = !effWh && isOverdue(effEta)
                        return <td key={key} className={`px-2 py-3 whitespace-nowrap font-medium ${over ? 'text-red-400' : 'text-white/40'}`}>{fmtDate(effEta) ?? '—'}{over && <span className="ml-1 text-[9px]">⚠</span>}</td>
                      }
                      case 'etaCaldas':         return <td key={key} className="px-2 py-3 text-white/40 whitespace-nowrap">{fmtDate(effectiveDate(item,'etaCaldas',liveData)) ?? '—'}</td>
                      case 'awb':               return <td key={key} className="px-2 py-3 font-mono text-white/50">{effectiveStr(item,'awb',liveData) ?? <span className="text-white/10">—</span>}</td>
                      default:                  return null
                    }
                  })}
                  {extraColumns.filter(c => visibleExtraCols.has(c.fieldKey)).map(c => (
                    <td key={c.fieldKey} className="px-2 py-3 text-violet-400">
                      {gl(item, c.fieldKey) ?? <span className="text-white/10">—</span>}
                    </td>
                  ))}
                  <td className="px-2 py-3 text-center">
                    <button onClick={() => onEdit(item)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-indigo-400/10 text-white/20 hover:text-indigo-400 transition-colors">
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
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ComexClient({
  initialItems,
  liveData,
  extraColumns,
}: {
  initialItems: Item[]
  liveData: LiveDataMap
  extraColumns: ExtraColumn[]
}) {
  const [items,           setItems]           = useState<Item[]>(initialItems)
  const [filter,          setFilter]          = useState<FilterStatus>('all')
  const [tipoFilter,      setTipoFilter]      = useState<'all' | 'Repuesto' | 'Mercaderia'>('all')
  const [search,          setSearch]          = useState('')
  const [editing,         setEditing]         = useState<Item | null>(null)
  const [view,            setView]            = useState<'timeline' | 'list'>('timeline')
  const [expandedAsnKeys, setExpandedAsnKeys] = useState<Set<string>>(new Set())
  const [showColMenu,     setShowColMenu]     = useState(false)
  const [visibleLogCols,  setVisibleLogCols]  = useState<Set<ComexLogCol>>(() => {
    try {
      const saved = localStorage.getItem('comex-visible-cols')
      if (saved) return new Set(JSON.parse(saved) as ComexLogCol[])
    } catch {}
    return new Set()
  })

  function toggleLogCol(key: ComexLogCol) {
    const next = new Set(visibleLogCols)
    next.has(key) ? next.delete(key) : next.add(key)
    setVisibleLogCols(next)
    try { localStorage.setItem('comex-visible-cols', JSON.stringify([...next])) } catch {}
  }

  const [visibleExtraCols, _setVisibleExtraCols] = useState<Set<string>>(() => {
    const available = new Set(extraColumns.map(c => c.fieldKey))
    try {
      const saved = localStorage.getItem('comex-hidden-extra-cols')
      if (saved) {
        const hiddenKeys = new Set(JSON.parse(saved) as string[])
        return new Set([...available].filter(k => !hiddenKeys.has(k)))
      }
    } catch {}
    return available
  })
  const applyVisibleExtraCols = useCallback((next: Set<string>) => {
    _setVisibleExtraCols(next)
    const hiddenKeys = extraColumns.map(c => c.fieldKey).filter(k => !next.has(k))
    try { localStorage.setItem('comex-hidden-extra-cols', JSON.stringify(hiddenKeys)) } catch {}
  }, [extraColumns])

  const hasLive = Object.keys(liveData).length > 0

  const handleSaved = useCallback((id: string, fields: Record<string, string>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const next = { ...item, ...fields }
      return next as Item
    }))
    setEditing(prev => prev?.id === id ? ({ ...prev, ...fields } as Item) : prev)
  }, [])

  const byTipo   = tipoFilter === 'all' ? items : items.filter(i => i.tipoCarga === tipoFilter)
  const byStatus = filter === 'all' ? byTipo : byTipo.filter(i => getStatus(i, liveData) === filter)
  const bySearch = byStatus.filter(i => matchesSearch(i, search))

  const asnGroups = useMemo(() => buildAsnGroups(bySearch, liveData), [bySearch, liveData])

  const filterTabs: { key: FilterStatus; label: string }[] = [
    { key: 'all',         label: `Todos (${byTipo.length})` },
    { key: 'pendiente',   label: `Pendiente (${byTipo.filter(i => getStatus(i, liveData) === 'pendiente').length})` },
    { key: 'avisado',     label: `Avisado (${byTipo.filter(i => getStatus(i, liveData) === 'avisado').length})` },
    { key: 'en-transito', label: `En tránsito (${byTipo.filter(i => getStatus(i, liveData) === 'en-transito').length})` },
    { key: 'llegado',     label: `Llegado WH (${byTipo.filter(i => getStatus(i, liveData) === 'llegado').length})` },
    { key: 'entregado',   label: `Entregado (${byTipo.filter(i => getStatus(i, liveData) === 'entregado').length})` },
  ]

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      {(() => {
        const totalAsns   = new Set(items.map(i => i.asn ?? i.id)).size
        const enTransito  = byTipo.filter(i => getStatus(i, liveData) === 'en-transito').length
        const llegados    = byTipo.filter(i => getStatus(i, liveData) === 'llegado').length
        const entregados  = byTipo.filter(i => getStatus(i, liveData) === 'entregado').length
        const delayed     = asnGroups.filter(g => g.delayed).length
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="ASNs totales"   value={String(totalAsns)}    sub={`${items.length} ítems`}       color="text-indigo-400" />
            <KpiCard label="En tránsito"    value={String(enTransito)}   sub="con ETD registrado"            color="text-sky-400" />
            <KpiCard label="Llegados / WH"  value={String(llegados)}     sub="arribo WH confirmado"          color="text-amber-400" />
            <KpiCard label="Entregados"     value={String(entregados)}   sub="en Caldas"                     color={entregados > 0 ? 'text-emerald-400' : 'text-white/30'} />
          </div>
        )
      })()}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Tipo filter */}
        <div className="flex gap-1 bg-white/[0.05] rounded-xl p-1">
          {([
            ['all', 'Todos'],
            ['Repuesto', 'Repuestos'],
            ['Mercaderia', 'Mercadería'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTipoFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tipoFilter === key ? 'bg-white/[0.08] text-white shadow-sm' : 'text-white/35 hover:text-white/60'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex gap-1 flex-wrap bg-white/[0.05] rounded-xl p-1">
          {filterTabs.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filter === t.key ? 'bg-white/[0.08] text-white shadow-sm' : 'text-white/35 hover:text-white/60'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar PI No, ASN, SO, AWB…"
            className="w-full h-9 pl-8 pr-3 text-xs rounded-xl border border-white/[0.08] bg-white/[0.04] text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-white/20"
          />
        </div>

        {search && (
          <span className="text-xs text-white/30">{bySearch.length} resultado{bySearch.length !== 1 ? 's' : ''}</span>
        )}

        {hasLive && (
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
            <Zap className="w-3 h-3" />En vivo
          </span>
        )}

        {/* Expand all (timeline mode only) */}
        {view === 'timeline' && asnGroups.length > 0 && (
          <button
            onClick={() => {
              const allExpanded = asnGroups.every(g => expandedAsnKeys.has(g.asn))
              if (allExpanded) {
                setExpandedAsnKeys(new Set())
              } else {
                setExpandedAsnKeys(new Set(asnGroups.map(g => g.asn)))
              }
            }}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-white/[0.08] text-xs font-medium text-white/50 hover:bg-white/[0.04] transition-colors"
          >
            {asnGroups.every(g => expandedAsnKeys.has(g.asn))
              ? <><ChevronUp className="w-3.5 h-3.5" /> Colapsar todo</>
              : <><ChevronDown className="w-3.5 h-3.5" /> Expandir todo</>}
          </button>
        )}

        {/* Column selector — only in list view */}
        {view === 'list' && (
          <div className="relative ml-auto">
            <button
              onClick={() => setShowColMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-medium bg-white/[0.06] hover:bg-white/[0.09] text-white/50 transition-colors"
            >
              Columnas {visibleLogCols.size > 0 && <span className="bg-indigo-500 text-white text-[9px] px-1 rounded-full">{visibleLogCols.size}</span>}
            </button>
            {showColMenu && (
              <div className="absolute right-0 top-10 z-30 bg-[#111] border border-white/[0.08] rounded-xl shadow-xl p-3 min-w-[160px] space-y-1">
                {COMEX_LOG_COLS.map(c => (
                  <label key={c.key} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-white/[0.04] cursor-pointer text-xs text-white/60">
                    <input type="checkbox" checked={visibleLogCols.has(c.key)} onChange={() => toggleLogCol(c.key)} className="rounded" />
                    {c.label}
                  </label>
                ))}
                {extraColumns.length > 0 && (
                  <>
                    <div className="pt-2 pb-1 px-1">
                      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-violet-400">Fuentes</p>
                    </div>
                    {extraColumns.map(c => (
                      <label key={c.fieldKey} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-violet-400/[0.08] cursor-pointer text-xs text-white/60">
                        <input
                          type="checkbox"
                          checked={visibleExtraCols.has(c.fieldKey)}
                          onChange={() => {
                            const next = new Set(visibleExtraCols)
                            next.has(c.fieldKey) ? next.delete(c.fieldKey) : next.add(c.fieldKey)
                            applyVisibleExtraCols(next)
                          }}
                          className="rounded accent-violet-500"
                        />
                        {c.label}
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* View toggle */}
        <div className={`${view === 'list' ? '' : 'ml-auto'} flex items-center gap-1 bg-white/[0.05] rounded-xl p-1`}>
          <button
            onClick={() => setView('timeline')}
            title="Vista timeline"
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
              view === 'timeline' ? 'bg-white/[0.08] shadow-sm text-indigo-400' : 'text-white/30 hover:text-white/60'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setView('list')}
            title="Vista tabla"
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
              view === 'list' ? 'bg-white/[0.08] shadow-sm text-indigo-400' : 'text-white/30 hover:text-white/60'
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      {view === 'timeline' ? (
        <div className="space-y-3">
          {asnGroups.length === 0 && (
            <div className="flex items-center justify-center py-16 text-white/20 text-sm">
              Sin resultados
            </div>
          )}
          {asnGroups.map(group => (
            <AsnCard
              key={group.asn}
              group={group}
              onEdit={setEditing}
              liveData={liveData}
              extraColumns={extraColumns}
              visibleExtraCols={visibleExtraCols}
              expanded={expandedAsnKeys.has(group.asn)}
              onToggle={() => setExpandedAsnKeys(prev => {
                const next = new Set(prev)
                next.has(group.asn) ? next.delete(group.asn) : next.add(group.asn)
                return next
              })}
            />
          ))}
        </div>
      ) : (
        <ListViewTable
          items={byTipo}
          onEdit={setEditing}
          liveData={liveData}
          extraColumns={extraColumns}
          filter={filter}
          search={search}
          visibleLogCols={visibleLogCols}
          visibleExtraCols={visibleExtraCols}
        />
      )}

      {editing && (
        <ComexDrawer
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={(id, fields) => { handleSaved(id, fields) }}
        />
      )}

      <style>{`.ib { width: 100%; height: 32px; padding: 0 10px; font-size: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); outline: none; background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.8); } .ib:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.15); } .ib::placeholder { color: rgba(255,255,255,0.2); }`}</style>
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
      <p className="text-[10px] text-white/25 mt-0.5">{sub}</p>
    </div>
  )
}
