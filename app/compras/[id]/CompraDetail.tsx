'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronDown, ChevronUp, Edit2, Check, X, Loader2, Download, Trash2 } from 'lucide-react'
import { marcarHito, editarCompra, eliminarCompra } from '@/app/compras/actions'
import { generarConsolidado } from '@/app/compras/consolidado'
import { getStatusBadgeClass } from '@/app/compras/lib'
import type { CompraManualField } from '@/app/compras/actions'
import type { ComexSORow } from '@/app/lib/comex'

// ─── Types (serialised — all dates are ISO strings) ───────────────────────────

type SOSerial = {
  id: string; soNumber: string; modelo: string | null; sku: string | null
  qPi: number | null; fobUnit: number | null; fobTotal: number | null
  incoterm: string | null; pa: string | null
}

type CIPLSerial = {
  id: string; asn: string | null; qty: number | null; soPrincipal: string | null
  description: string | null; caseNo: string | null; createdAt: string
}

type CompraSerial = {
  id: string; piNo: string | null; notas: string | null; createdAt: string
  supplierName: string | null; supplierAddress: string | null
  supplierContactName: string | null; supplierContactPhone: string | null; supplierContactEmail: string | null
  fechaOrden: string; fechaEnvio: string | null; fechaPago: string | null
  fechaSegundaValPA: string | null; fechaInstruccionCat: string | null; fechaLMS: string | null
  sos: SOSerial[]; ciplItems: CIPLSerial[]
}

// ─── Milestone config ──────────────────────────────────────────────────────────

type MilestoneSource = 'manual' | 'comex'
type Milestone = {
  key:    string
  label:  string
  source: MilestoneSource
  comexFieldKey?: string
}

const MILESTONES: Milestone[] = [
  { key: 'fechaOrden',          label: 'Orden creada',          source: 'manual' },
  { key: 'fechaEnvio',          label: 'Enviada al proveedor',  source: 'manual' },
  { key: 'fechaPago',           label: 'Pagada',                source: 'manual' },
  { key: 'fechaSegundaValPA',   label: '2da Validación PA',     source: 'manual' },
  { key: '_plCargado',          label: 'PL Cargado',            source: 'comex'  },
  { key: 'fechaInstruccionCat', label: 'Instrucción Category',  source: 'manual' },
  { key: 'fechaLMS',            label: 'LMS',                   source: 'manual' },
  { key: '_arriboWh',           label: 'Arribo WH Airsea',      source: 'comex',  comexFieldKey: 'arriboWh'            },
  { key: '_etd',                label: 'ETD',                   source: 'comex',  comexFieldKey: 'etd'                 },
  { key: '_eta',                label: 'ETA',                   source: 'comex',  comexFieldKey: 'eta'                 },
  { key: '_arriboAduana',       label: 'Arribo Aduana',         source: 'comex',  comexFieldKey: 'fechaArriboAduana'   },
  { key: '_arriboDeposito',     label: 'Arribo Depósito',       source: 'comex',  comexFieldKey: 'fechaArriboDeposito' },
]

const EDITABLE_MANUAL = new Set<string>(['fechaOrden','fechaEnvio','fechaPago','fechaSegundaValPA','fechaInstruccionCat','fechaLMS'])

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : null

const fmtUSD = (n: number | null) =>
  n != null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '—'

function getMilestoneDate(
  key: string, compra: CompraSerial, ciplItems: CIPLSerial[],
  sos: SOSerial[], bySO: Record<string, ComexSORow>, comexFieldKey?: string
): string | null {
  if (key === '_plCargado') return ciplItems.length > 0 ? ciplItems[0]!.createdAt : null
  if (key === 'fechaOrden') return compra.fechaOrden
  if (key in compra) return (compra as Record<string, unknown>)[key] as string | null
  if (comexFieldKey) {
    for (const so of sos) {
      const val = bySO[so.soNumber.toUpperCase()]?.shipments[0]?.extras[comexFieldKey] ?? null
      if (val) return val
    }
  }
  return null
}

function deriveStatus(compra: CompraSerial, ciplItems: CIPLSerial[], sos: SOSerial[], bySO: Record<string, ComexSORow>): string {
  const getDate = (key: string, cfk?: string) => getMilestoneDate(key, compra, ciplItems, sos, bySO, cfk)
  if (getDate('_arriboDeposito', 'fechaArriboDeposito')) return 'Completada'
  if (getDate('_arriboAduana',   'fechaArriboAduana'))   return 'En Aduana'
  if (getDate('_eta',            'eta'))                  return 'En tránsito'
  if (getDate('_etd',            'etd'))                  return 'Embarcado'
  if (getDate('_arriboWh',       'arriboWh'))             return 'En WH Airsea'
  if (compra.fechaLMS)                                    return 'LMS'
  if (compra.fechaInstruccionCat)                         return 'Instrucción Category'
  if (ciplItems.length > 0)                               return 'PL Cargado'
  if (compra.fechaSegundaValPA)                           return 'PA Validada'
  if (compra.fechaPago)                                   return 'Pagada'
  if (compra.fechaEnvio)                                  return 'Enviada'
  return 'Borrador'
}

// ─── DateEditor ───────────────────────────────────────────────────────────────

function DateEditor({ compraId, field, current, onClose }: {
  compraId: string; field: CompraManualField; current: string | null; onClose: () => void
}) {
  const [value, setValue] = useState(current ? current.slice(0, 10) : '')
  const [pending, startT] = useTransition()
  const [err, setErr]     = useState('')

  function save() {
    startT(async () => {
      const res = await marcarHito(compraId, field, value || null)
      if (res.ok) onClose()
      else setErr(res.error)
    })
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="date"
        value={value}
        onChange={e => setValue(e.target.value)}
        className="bg-white/[0.06] border border-white/15 rounded-lg px-3 py-1.5 text-[12px] text-white outline-none focus:border-white/30"
      />
      <button onClick={save} disabled={pending} className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#31AF4F]/20 text-[#31AF4F] hover:bg-[#31AF4F]/30">
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
      </button>
      <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.06] text-white/40 hover:text-white/60">
        <X className="w-3 h-3" />
      </button>
      {err && <span className="text-[11px] text-red-400">{err}</span>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CompraDetail({ compra, bySO }: { compra: CompraSerial; bySO: Record<string, ComexSORow> }) {
  const router = useRouter()
  const [editingMilestone, setEditingMilestone] = useState<string | null>(null)
  const [expandedSOs, setExpandedSOs]           = useState<Set<string>>(new Set())
  const [dlPending, startDl]                     = useTransition()
  const [dlError, setDlError]                    = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete]        = useState(false)
  const [delPending, startDel]                   = useTransition()
  const [delError, setDelError]                  = useState<string | null>(null)

  const status    = deriveStatus(compra, compra.ciplItems, compra.sos, bySO)
  const qPedida   = compra.sos.reduce((s, so) => s + (so.qPi ?? 0), 0)
  const qRecibida = compra.ciplItems.reduce((s, c) => s + (c.qty ?? 0), 0)
  const fobTotal  = compra.sos.reduce((s, so) => s + (so.fobTotal ?? 0), 0)
  const pct       = qPedida > 0 ? Math.round((qRecibida / qPedida) * 100) : 0

  const ciplByASN = compra.ciplItems.reduce<Record<string, CIPLSerial[]>>((acc, c) => {
    const key = c.asn ?? 'Sin ASN'
    acc[key] = [...(acc[key] ?? []), c]
    return acc
  }, {})

  const embarques = [...new Set(
    compra.sos.flatMap(so =>
      bySO[so.soNumber.toUpperCase()]?.shipments.map(s => s.embarqueNo) ?? []
    ).filter(Boolean) as string[]
  )]

  function toggleSO(soNumber: string) {
    setExpandedSOs(prev => {
      const next = new Set(prev)
      next.has(soNumber) ? next.delete(soNumber) : next.add(soNumber)
      return next
    })
  }

  function handleDelete() {
    setDelError(null)
    startDel(async () => {
      const res = await eliminarCompra(compra.id)
      if (res.ok) router.push('/compras')
      else setDelError(res.error)
    })
  }

  function handleConsolidado(embarqueNo: string) {
    setDlError(null)
    startDl(async () => {
      const res = await generarConsolidado(compra.id, embarqueNo)
      if ('error' in res) { setDlError(res.error); return }
      const blob = new Blob([Buffer.from(res.data, 'base64')], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href = url; a.download = res.filename; a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div className="min-h-screen px-8 py-10 max-w-[1500px] mx-auto">
      {/* Breadcrumb */}
      <button
        onClick={() => router.push('/compras')}
        className="inline-flex items-center gap-1 text-[11px] text-white/35 hover:text-white/70 transition-colors mb-6"
      >
        <ChevronLeft className="w-3 h-3" />
        Compras
      </button>

      {/* Header editorial */}
      <header className="mb-10 fade-rise">
        <div className="flex items-baseline justify-between mb-3 gap-4 flex-wrap">
          <span className="eyebrow">Bidcom Agro · Orden de compra</span>
          <span className="eyebrow tabular-nums">Creada {fmtDate(compra.fechaOrden)}</span>
        </div>

        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="display-md text-white font-mono tracking-tight">{compra.piNo ?? `OC-${compra.id.slice(-6).toUpperCase()}`}</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${getStatusBadgeClass(status)}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />{status}
              </span>
            </div>
            <p className="text-[13px] text-white/45">
              {compra.supplierName ?? 'Sin proveedor'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {embarques.map(emb => (
              <button
                key={emb}
                onClick={() => handleConsolidado(emb)}
                disabled={dlPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.04] border border-white/[0.06] text-white/65 hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                {dlPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                PL Consolidado {emb}
              </button>
            ))}

            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.03] border border-white/[0.06] text-white/40 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-300 transition-colors"
                title="Eliminar esta compra"
              >
                <Trash2 className="w-3 h-3" />
                Eliminar
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30">
                <span className="text-[11px] text-red-300">¿Eliminar {compra.piNo ?? 'esta compra'}?</span>
                <button
                  onClick={handleDelete}
                  disabled={delPending}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/20 text-red-300 hover:bg-red-500/30"
                >
                  {delPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Sí
                </button>
                <button
                  onClick={() => { setConfirmDelete(false); setDelError(null) }}
                  disabled={delPending}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-white/50 hover:text-white/80"
                >
                  <X className="w-3 h-3" />
                  No
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="hairline mt-7" />
      </header>

      {dlError && (
        <div className="mb-4 text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{dlError}</div>
      )}

      {delError && (
        <div className="mb-4 text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          Error al eliminar: {delError}
        </div>
      )}

      <div className="space-y-6">
        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Unidades pedidas',  value: qPedida.toLocaleString() },
            { label: 'Recibidas',         value: qRecibida.toLocaleString(), accent: true },
            { label: 'PLs vinculados',    value: Object.keys(ciplByASN).length.toString() },
            { label: 'FOB Total',         value: fmtUSD(fobTotal) },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/25">{label}</div>
              <div className={`text-[22px] font-bold mt-1.5 ${accent ? 'text-emerald-400' : 'text-white'}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-5">Hitos del proceso</p>
          <div className="flex items-start gap-0 overflow-x-auto pb-2">
            {MILESTONES.map((m, idx) => {
              const date     = getMilestoneDate(m.key, compra, compra.ciplItems, compra.sos, bySO, m.comexFieldKey)
              const isDone   = !!date
              const isEditing= editingMilestone === m.key
              const canEdit  = m.source === 'manual' && EDITABLE_MANUAL.has(m.key)
              const isFirst  = idx === 0

              return (
                <div key={m.key} className="flex items-start">
                  {!isFirst && (
                    <div className={`w-6 h-0.5 mt-4 shrink-0 ${isDone ? 'bg-emerald-500/50' : 'bg-white/[0.06]'}`} />
                  )}
                  <div className="relative flex flex-col items-center min-w-[80px]">
                    <button
                      onClick={() => canEdit && setEditingMilestone(isEditing ? null : m.key)}
                      disabled={!canEdit}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] border-2 transition-all ${
                        isDone
                          ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400'
                          : m.source === 'comex'
                          ? 'bg-orange-500/10 border-orange-500/20 text-orange-400/40'
                          : 'bg-white/[0.04] border-white/[0.12] text-white/20'
                      } ${canEdit && !isDone ? 'hover:border-white/30 cursor-pointer' : ''}`}
                      title={m.source === 'comex' ? 'Automático desde Comex' : canEdit ? 'Click para marcar' : ''}
                    >
                      {isDone ? '✓' : m.source === 'comex' ? '⟳' : '○'}
                    </button>
                    <div className="text-center mt-2">
                      <div className={`text-[10px] font-medium leading-tight ${isDone ? 'text-white/70' : 'text-white/25'}`}>
                        {m.label}
                      </div>
                      {date && (
                        <div className="text-[10px] text-white/35 mt-0.5 flex items-center gap-1 justify-center">
                          {fmtDate(date)}
                          {canEdit && (
                            <button onClick={() => setEditingMilestone(isEditing ? null : m.key)} className="text-white/20 hover:text-white/50">
                              <Edit2 className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      )}
                      {!date && m.source === 'comex' && (
                        <div className="text-[9px] text-orange-400/40 mt-0.5">desde Comex</div>
                      )}
                    </div>
                    {isEditing && canEdit && (
                      <div className="absolute top-10 left-1/2 -translate-x-1/2 z-10 bg-[#1a1a2e] border border-white/10 rounded-xl p-3 shadow-xl w-52">
                        <DateEditor
                          compraId={compra.id}
                          field={m.key as CompraManualField}
                          current={date}
                          onClose={() => setEditingMilestone(null)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 py-4 flex items-center gap-4">
          <span className="text-[12px] text-white/40 shrink-0">Recepción total</span>
          <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-teal-400' : 'bg-orange-400'}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <span className="text-[13px] font-bold text-white shrink-0">{pct}%</span>
          <span className="text-[12px] text-white/35 shrink-0">{qRecibida.toLocaleString()} / {qPedida.toLocaleString()} un.</span>
        </div>

        {/* SO Cards */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-3">SOs incluidos y PLs recibidos</p>
          {compra.sos.map(so => {
            const soItems    = compra.ciplItems.filter(c => c.soPrincipal?.toUpperCase() === so.soNumber.toUpperCase())
            const qRec       = soItems.reduce((s, c) => s + (c.qty ?? 0), 0)
            const pctSO      = (so.qPi ?? 0) > 0 ? Math.round((qRec / so.qPi!) * 100) : 0
            const isExpanded = expandedSOs.has(so.soNumber)
            const asnGroups  = soItems.reduce<Record<string, CIPLSerial[]>>((acc, c) => {
              const key = c.asn ?? 'Sin ASN'; acc[key] = [...(acc[key] ?? []), c]; return acc
            }, {})
            const embarqueLabel = bySO[so.soNumber.toUpperCase()]?.shipments[0]?.embarqueNo ?? null

            return (
              <div key={so.id} className="bg-white/[0.02] border border-white/[0.06] rounded-xl mb-3 overflow-hidden">
                <button
                  onClick={() => toggleSO(so.soNumber)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.02] transition-colors"
                >
                  <span className="font-mono text-[11px] font-bold text-[#31AF4F] bg-[#31AF4F]/10 px-2 py-0.5 rounded shrink-0">{so.soNumber}</span>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-[13px] text-white font-medium truncate">{so.modelo ?? '—'}</div>
                    <div className="text-[11px] text-white/35 mt-0.5">{so.sku ?? ''}{so.incoterm ? ` · ${so.incoterm}` : ''}{embarqueLabel ? ` · Embarque: ${embarqueLabel}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-[12px] text-white/50">{qRec.toLocaleString()} / {(so.qPi ?? 0).toLocaleString()} un.</div>
                      <div className="w-24 h-1.5 bg-white/[0.06] rounded-full mt-1 overflow-hidden">
                        <div className={`h-full rounded-full ${pctSO >= 100 ? 'bg-teal-400' : 'bg-orange-400'}`} style={{ width: `${Math.min(pctSO, 100)}%` }} />
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-white/20" /> : <ChevronDown className="w-4 h-4 text-white/20" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/[0.06] bg-black/20 p-4">
                    {Object.entries(asnGroups).map(([asn, items]) => (
                      <div key={asn} className="flex items-center gap-3 py-2.5 border-b border-white/[0.04] last:border-0 text-[12px]">
                        <span className="font-mono text-[11px] text-white/40 min-w-[160px]">{asn}</span>
                        <span className="text-white/30">{fmtDate(items[0]!.createdAt)}</span>
                        <span className="font-semibold text-white">{items.reduce((s,c)=>s+(c.qty??0),0).toLocaleString()} un.</span>
                        <Link href={`/panel-general?asn=${asn}`} className="ml-auto text-indigo-400 hover:text-indigo-300 text-[11px]">
                          → Panel General
                        </Link>
                      </div>
                    ))}
                    {Object.keys(asnGroups).length === 0 && (
                      <div className="text-center py-6 text-[12px] text-white/20 border border-dashed border-white/[0.08] rounded-lg">
                        ⏳ Sin PLs recibidos para este SO
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
