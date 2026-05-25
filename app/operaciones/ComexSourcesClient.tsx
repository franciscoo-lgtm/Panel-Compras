'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, ToggleLeft, ToggleRight, Loader2, ExternalLink, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Zap } from 'lucide-react'
import {
  upsertComexSource, toggleComexSource, deleteComexSource, previewSheetColumns,
} from '@/app/lib/comex-sources'
import type { ComexSource, ColumnMapping, PanelId } from '@/app/lib/comex-sources'
import { KNOWN_MAPPABLE_FIELDS, COMPRA_COMEX_MILESTONE_FIELDS, JOINABLE_FIELDS } from '@/app/lib/comex-fields'
import type { JoinField } from '@/app/lib/comex-fields'

// ─── Types ─────────────────────────────────────────────────────────────────────

type DraftColumn = {
  header: string     // original column name from sheet
  selected: boolean
  label: string      // display label in panel (editable)
  fieldKey?: string  // if set, maps to a known field; otherwise slugify is used
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function slugify(str: string) {
  return 'extra_' + str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function guessJoinHeader(headers: string[]): string {
  const soIdx = headers.findIndex(h => /\bso\b|sales.?order|orden/i.test(h) || /^id$/i.test(h))
  return soIdx >= 0 ? headers[soIdx] : (headers[0] ?? '')
}

// ─── Add Source Form ──────────────────────────────────────────────────────────

function AddSourceForm({ onSaved, onCancel }: { onSaved: (s: ComexSource) => void; onCancel: () => void }) {
  const [name, setName]           = useState('')
  const [url, setUrl]             = useState('')
  const [sheetName, setSheetName] = useState('')
  const [columns, setColumns]     = useState<DraftColumn[] | null>(null)
  const [matchCol, setMatchCol]   = useState('')   // join column header
  const [joinOn, setJoinOn]       = useState<JoinField>('so')
  const [panels, setPanels]       = useState<PanelId[]>(['panel-general', 'comex'])
  const [error, setError]         = useState('')
  const [loadPending, startLoad]  = useTransition()
  const [savePending, startSave]  = useTransition()
  const [saved, setSaved]         = useState(false)

  function togglePanel(p: PanelId) {
    setPanels(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  function handleLoad() {
    setError('')
    setColumns(null)
    startLoad(async () => {
      const res = await previewSheetColumns(url, sheetName || undefined)
      if (!res.ok) { setError(res.error); return }
      const drafts: DraftColumn[] = res.headers.map(h => ({ header: h, selected: true, label: h }))
      setColumns(drafts)
      setMatchCol(guessJoinHeader(res.headers))
    })
  }

  function toggleCol(idx: number) {
    setColumns(prev => prev!.map((c, i) => i === idx ? { ...c, selected: !c.selected } : c))
  }

  function setLabel(idx: number, label: string) {
    setColumns(prev => prev!.map((c, i) => i === idx ? { ...c, label } : c))
  }

  function setFieldKey(idx: number, fieldKey: string) {
    setColumns(prev => prev!.map((c, i) => i === idx ? { ...c, fieldKey: fieldKey || undefined } : c))
  }

  function selectAll(v: boolean) {
    setColumns(prev => prev!.map(c => ({ ...c, selected: c.header === matchCol ? c.selected : v })))
  }

  function handleSave() {
    if (!name.trim())   { setError('Poné un nombre a la fuente'); return }
    if (!url.trim())    { setError('Ingresá la URL de la planilla'); return }
    if (!matchCol)      { setError('Seleccioná la columna de match (SO)'); return }
    if (panels.length === 0) { setError('Seleccioná al menos un panel de destino'); return }
    const selected = (columns ?? []).filter(c => c.selected && c.header !== matchCol)
    if (selected.length === 0) { setError('Seleccioná al menos una columna para agregar al panel'); return }

    const mappings: ColumnMapping[] = [
      { sheetHeader: matchCol, fieldKey: '_join_', label: 'SO', isJoin: true },
      ...selected.map(c => ({
        sheetHeader: c.header,
        fieldKey: c.fieldKey ?? slugify(c.label || c.header),
        label: (c.label || c.header).trim(),
        isJoin: false,
      })),
    ]

    const source: ComexSource = {
      id: newId(),
      name: name.trim(),
      url: url.trim(),
      sheetName: sheetName.trim() || undefined,
      enabled: true,
      panels,
      joinOn,
      mappings,
    }

    startSave(async () => {
      const res = await upsertComexSource(source)
      if (!res.ok) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => onSaved(source), 600)
    })
  }

  const allSelected = columns?.filter(c => c.header !== matchCol).every(c => c.selected) ?? false
  const selectedCount = columns?.filter(c => c.selected && c.header !== matchCol).length ?? 0

  return (
    <div className="border border-zinc-200 rounded-xl bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50 flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-800">Nueva fuente</p>
        <button onClick={onCancel} className="text-xs text-zinc-400 hover:text-zinc-600">Cancelar</button>
      </div>

      <div className="p-5 space-y-5">

        {/* ① Nombre */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">
            ① Nombre de la fuente
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: Tracking Comex — ETD/ETA"
            className="w-full h-9 px-3 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        {/* ② URL + Hoja */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block">
            ② Planilla de Google Sheets
          </label>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className="w-full h-9 px-3 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                value={sheetName}
                onChange={e => setSheetName(e.target.value)}
                placeholder="Nombre exacto de la hoja (ej: Hoja1, Tracking)"
                className="w-full h-9 px-3 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <button
              onClick={handleLoad}
              disabled={!url.trim() || loadPending}
              className="h-9 px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              {loadPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Cargar columnas
            </button>
          </div>
          <p className="text-[11px] text-zinc-400">
            Dejá el nombre de hoja vacío para usar la primera hoja. La planilla debe ser pública (visible para cualquiera con el link).
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100 text-xs text-red-600">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {columns && (
          <>
            {/* ③ Columna de match */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">
                ③ Columna de match
              </label>
              <p className="text-[11px] text-zinc-400 mb-2">
                Elegí qué columna de la planilla contiene el identificador y a qué campo del panel corresponde.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={matchCol}
                  onChange={e => setMatchCol(e.target.value)}
                  className="h-9 px-3 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {columns.map((c, i) => (
                    <option key={`match-${i}`} value={c.header}>{c.header}</option>
                  ))}
                </select>
                <span className="text-xs text-zinc-400">corresponde a</span>
                <select
                  value={joinOn}
                  onChange={e => setJoinOn(e.target.value as JoinField)}
                  className="h-9 px-3 text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {JOINABLE_FIELDS.map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ④ Columnas a agregar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  ④ Columnas a agregar al panel
                  <span className="ml-2 text-zinc-300 font-normal normal-case tracking-normal">
                    {selectedCount} seleccionada{selectedCount !== 1 ? 's' : ''}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => selectAll(!allSelected)}
                  className="text-[11px] text-zinc-400 hover:text-zinc-700 underline"
                >
                  {allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                </button>
              </div>
              <div className="border border-zinc-100 rounded-lg overflow-hidden divide-y divide-zinc-50">
                {columns.map((c, i) => {
                  const isMatch = c.header === matchCol
                  return (
                    <div
                      key={`col-${i}`}
                      className={`flex items-center gap-3 px-3 py-2 ${isMatch ? 'bg-amber-50/60' : ''}`}
                    >
                      {isMatch ? (
                        <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                          <Zap className="w-3 h-3 text-amber-500" />
                        </span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={c.selected}
                          onChange={() => toggleCol(i)}
                          className="w-3.5 h-3.5 shrink-0 accent-amber-400"
                        />
                      )}
                      <span className={`text-xs font-mono flex-1 truncate ${isMatch ? 'text-amber-700 font-semibold' : 'text-zinc-600'}`}>
                        {c.header}
                        {isMatch && <span className="ml-1.5 text-[10px] text-amber-500 font-normal">← match SO</span>}
                      </span>
                      {!isMatch && c.selected && (
                        <>
                          <input
                            value={c.label}
                            onChange={e => setLabel(i, e.target.value)}
                            placeholder="Label en panel"
                            className="h-6 px-2 text-[11px] rounded border border-zinc-200 w-28 focus:outline-none focus:ring-1 focus:ring-amber-400 text-zinc-500"
                          />
                          <select
                            value={c.fieldKey ?? ''}
                            onChange={e => setFieldKey(i, e.target.value)}
                            title="Mapear a campo conocido"
                            className={`h-6 px-1.5 text-[11px] rounded border focus:outline-none focus:ring-1 focus:ring-amber-400 ${
                              c.fieldKey
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                : 'border-zinc-200 bg-white text-zinc-400'
                            }`}
                          >
                            <option value="">— extra —</option>
                            {KNOWN_MAPPABLE_FIELDS.map(f => (
                              <option key={f.key} value={f.key}>{f.label}</option>
                            ))}
                          </select>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ⑤ Panel selector */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-2">
                ⑤ Mostrar en paneles
              </label>
              <div className="flex gap-2">
                {([
                  { id: 'panel-general' as PanelId, label: 'Panel General' },
                  { id: 'comex' as PanelId, label: 'Comex Tracking' },
                ]).map(({ id, label }) => {
                  const active = panels.includes(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => togglePanel(id)}
                      className={`h-7 px-3 text-xs font-medium rounded-full border transition-colors ${
                        active
                          ? 'bg-amber-400 border-amber-400 text-zinc-900'
                          : 'border-zinc-200 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Save */}
            <div className="flex justify-end pt-1">
              <button
                onClick={handleSave}
                disabled={savePending || saved}
                className="h-9 px-5 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-zinc-900 font-semibold text-sm flex items-center gap-2 transition-colors"
              >
                {saved
                  ? <><CheckCircle2 className="w-3.5 h-3.5" /> Guardado</>
                  : savePending
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando…</>
                    : 'Guardar fuente'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Source Card ──────────────────────────────────────────────────────────────

function SourceCard({
  source,
  onToggle,
  onDelete,
}: {
  source: ComexSource
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const nonJoin = source.mappings.filter(m => !m.isJoin && m.fieldKey !== '_join_')
  const knownCount = nonJoin.filter(m => !m.fieldKey.startsWith('extra_')).length
  const extraCount = nonJoin.filter(m => m.fieldKey.startsWith('extra_')).length

  const shortUrl = source.url.replace(/^https:\/\/docs\.google\.com\/spreadsheets\/d\//, '').slice(0, 24)

  return (
    <div className={`border rounded-xl bg-white overflow-hidden transition-all ${source.enabled ? 'border-zinc-200' : 'border-zinc-100 opacity-60'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${source.enabled ? 'bg-green-400' : 'bg-zinc-300'}`} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-800 truncate">{source.name}</p>
          <p className="text-[11px] text-zinc-400 font-mono truncate mt-0.5">…{shortUrl}</p>
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-3 text-[11px] text-zinc-400">
          {knownCount > 0 && <span>{knownCount} campo{knownCount !== 1 ? 's' : ''}</span>}
          {extraCount > 0 && <span className="text-violet-500">{extraCount} extra</span>}
          {(source.panels ?? ['panel-general', 'comex']).map(p => (
            <span key={p} className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 text-[10px] font-semibold">
              {p === 'panel-general' ? 'PG' : 'CX'}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-300 hover:text-zinc-600 hover:bg-zinc-50 transition-colors"
            title="Abrir planilla"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-300 hover:text-zinc-600 hover:bg-zinc-50 transition-colors"
            title="Ver columnas"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => onToggle(source.id)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-300 hover:text-zinc-600 hover:bg-zinc-50 transition-colors"
            title={source.enabled ? 'Desactivar' : 'Activar'}
          >
            {source.enabled
              ? <ToggleRight className="w-4 h-4 text-green-500" />
              : <ToggleLeft className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onDelete(source.id)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Eliminar"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded: column detail */}
      {expanded && (
        <div className="border-t border-zinc-50 px-4 py-3">
          {source.joinOn && source.joinOn !== 'so' && (
            <p className="text-[11px] text-amber-600 mb-2">
              Match por: <span className="font-semibold">{JOINABLE_FIELDS.find(f => f.key === source.joinOn)?.label ?? source.joinOn}</span>
            </p>
          )}
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-zinc-400">
                <th className="text-left font-semibold pb-1.5 w-1/3">Columna planilla</th>
                <th className="text-left font-semibold pb-1.5">Campo / Label en panel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {source.mappings.map(m => (
                <tr key={m.sheetHeader}>
                  <td className="py-1 font-mono text-zinc-500">{m.sheetHeader}</td>
                  <td className="py-1">
                    {m.isJoin
                      ? <span className="text-amber-600 font-semibold">SO (join)</span>
                      : m.fieldKey.startsWith('extra_')
                        ? <span className="text-violet-600">{m.label} <span className="text-zinc-400">(extra)</span></span>
                        : <span className="text-zinc-600">{m.label}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ComexSourcesClient({ initialSources }: { initialSources: ComexSource[] }) {
  const [sources, setSources] = useState<ComexSource[]>(initialSources)
  const [adding, setAdding]   = useState(false)

  function handleToggle(id: string) {
    setSources(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s))
    toggleComexSource(id)
  }

  function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta fuente?')) return
    setSources(prev => prev.filter(s => s.id !== id))
    deleteComexSource(id)
  }

  function handleSaved(source: ComexSource) {
    setSources(prev => {
      const idx = prev.findIndex(s => s.id === source.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = source; return next }
      return [...prev, source]
    })
    setAdding(false)
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* How-it-works card */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-5 py-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">¿Cómo funciona?</p>
        <ol className="list-decimal list-inside space-y-0.5 text-[13px] text-amber-700">
          <li>Pegá la URL de una planilla pública de Google Sheets.</li>
          <li>Hacé clic en <strong>Cargar</strong> para detectar las columnas.</li>
          <li>Mapeá cada columna a un campo existente o creá una columna extra.</li>
          <li>Guardá — el panel cruzará los datos con el SO en tiempo real.</li>
        </ol>
      </div>

      {/* Sources list */}
      {sources.length > 0 && (
        <div className="space-y-2">
          {sources.map(s => (
            <SourceCard
              key={s.id}
              source={s}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {sources.length === 0 && !adding && (
        <div className="flex flex-col items-center gap-3 py-16 text-center border border-dashed border-zinc-200 rounded-xl">
          <p className="text-sm text-zinc-400">Todavía no hay fuentes configuradas.</p>
        </div>
      )}

      {/* Add form */}
      {adding && (
        <AddSourceForm
          onSaved={handleSaved}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* Add button */}
      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-xl border border-dashed border-zinc-300 text-sm text-zinc-500 hover:text-zinc-800 hover:border-zinc-400 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Agregar fuente
        </button>
      )}

      {/* Compra Milestone Mappings */}
      <div className="mt-8 border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50">
          <h2 className="text-[13px] font-semibold text-zinc-700">Hitos de Compra — Mapeo de Fuentes Comex</h2>
          <p className="text-[11px] text-zinc-400 mt-1">
            Configurá qué columna de tus fuentes Comex alimenta cada hito de la orden de compra.
          </p>
        </div>
        <div className="divide-y divide-zinc-100">
          {COMPRA_COMEX_MILESTONE_FIELDS.map(f => {
            const mapped = sources.some(s =>
              s.enabled && s.mappings.some(m => m.fieldKey === f.fieldKey && !m.isJoin)
            )
            return (
              <div key={f.fieldKey} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="text-[13px] text-zinc-600">{f.label}</span>
                  <span className="ml-2 font-mono text-[10px] text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">{f.fieldKey}</span>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                  mapped
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-zinc-100 text-zinc-400'
                }`}>
                  {mapped ? '✓ Mapeado' : '⏳ Sin mapear'}
                </span>
              </div>
            )
          })}
        </div>
        <div className="px-5 py-3 border-t border-zinc-100 bg-zinc-50/30">
          <p className="text-[11px] text-zinc-400">
            Para activar un hito: agregá una fuente Comex → en el paso ④ elegí el campo conocido en el selector (derecha de cada columna).
          </p>
        </div>
      </div>
    </div>
  )
}
