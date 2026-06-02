'use client'

import { useState, useTransition } from 'react'
import { Save, Loader2, AlertTriangle, CheckCircle2, Eye, Trash2, Plus, Star, X, ChevronDown, ChevronRight } from 'lucide-react'
import { saveComexConfig, previewSheetHeaders, clearComexConfig, type ComexConfig, type ComexSource, type ComexMapping } from '@/app/lib/comex'
import { MILESTONE_CATALOG, type MilestoneField } from '@/app/lib/milestone-catalog'
import { cn } from '@/lib/utils'

const EMPTY_CONFIG: ComexConfig = { sources: [], primarySourceId: null }

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function newSource(name: string = 'Nueva fuente'): ComexSource {
  return {
    id: genId(),
    name,
    enabled: true,
    url: '',
    sheetName: '',
    joinCol: '',
    mappings: [],
  }
}

export function ConfigClient({ initial }: { initial: ComexConfig | null }) {
  const [cfg, setCfg] = useState<ComexConfig>(initial ?? EMPTY_CONFIG)
  const [saving, startSave] = useTransition()
  const [clearing, startClear] = useTransition()
  const [confirmClear, setConfirmClear] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(initial?.sources[0]?.id ?? null)

  function updateSource(id: string, patch: Partial<ComexSource>) {
    setCfg(prev => ({
      ...prev,
      sources: prev.sources.map(s => s.id === id ? { ...s, ...patch } : s),
    }))
  }

  function addSource() {
    const s = newSource(`Fuente ${cfg.sources.length + 1}`)
    setCfg(prev => ({
      ...prev,
      sources: [...prev.sources, s],
      primarySourceId: prev.primarySourceId ?? s.id,
    }))
    setExpandedId(s.id)
  }

  function removeSource(id: string) {
    setCfg(prev => ({
      ...prev,
      sources: prev.sources.filter(s => s.id !== id),
      primarySourceId: prev.primarySourceId === id
        ? (prev.sources.find(s => s.id !== id)?.id ?? null)
        : prev.primarySourceId,
    }))
  }

  function setPrimary(id: string) {
    setCfg(prev => ({ ...prev, primarySourceId: id }))
  }

  function handleSave() {
    setSaveResult(null)
    startSave(async () => {
      try {
        await saveComexConfig(cfg)
        setSaveResult({ ok: true, msg: 'Guardado. La nueva config aplica al siguiente refresh.' })
      } catch (err) {
        setSaveResult({ ok: false, msg: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  function handleClear() {
    setSaveResult(null)
    startClear(async () => {
      try {
        await clearComexConfig()
        setCfg(EMPTY_CONFIG)
        setConfirmClear(false)
        setSaveResult({ ok: true, msg: 'Configuración eliminada.' })
      } catch (err) {
        setSaveResult({ ok: false, msg: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  // Nueva regla: cualquier fuente con mapping a 'embarqueNo' contribuye
  // embarques al panel. Antes era una sola "primaria" elegida a mano; ahora
  // se infiere automáticamente del mapping.
  const hasAnyEmbarqueSource = cfg.sources.some(
    s => s.enabled && s.mappings.some(m => m.field === 'embarqueNo'),
  )
  const canSave = cfg.sources.length > 0 && hasAnyEmbarqueSource &&
    cfg.sources.every(s => !s.enabled || (s.url && s.joinCol))

  return (
    <div className="space-y-4">
      {/* Lista de fuentes */}
      <div className="space-y-3">
        {cfg.sources.map(source => (
          <SourceCard
            key={source.id}
            source={source}
            isPrimary={source.mappings.some(m => m.field === 'embarqueNo')}
            expanded={expandedId === source.id}
            onToggle={() => setExpandedId(expandedId === source.id ? null : source.id)}
            onChange={patch => updateSource(source.id, patch)}
            onRemove={() => removeSource(source.id)}
            onSetPrimary={() => setPrimary(source.id)}
          />
        ))}

        <button
          onClick={addSource}
          className="w-full px-4 py-3 rounded-lg border border-dashed border-white/[0.12] hover:border-[#31AF4F]/40 hover:bg-[#31AF4F]/[0.04] text-[12px] text-zinc-400 hover:text-white inline-flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> Agregar fuente
        </button>
      </div>

      {/* Botones generales */}
      <div className="flex items-center gap-3 flex-wrap pt-4 border-t border-white/[0.06]">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="px-4 py-2 rounded-md text-[12px] font-medium bg-[#31AF4F] hover:bg-[#31AF4F]/85 disabled:opacity-40 text-white inline-flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Guardar todas las fuentes
        </button>

        {cfg.sources.length > 0 && !confirmClear && (
          <button
            onClick={() => setConfirmClear(true)}
            className="px-3 py-2 rounded-md text-[11px] font-medium border border-red-500/30 bg-red-500/[0.05] hover:bg-red-500/[0.1] text-red-400 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar TODAS las fuentes
          </button>
        )}

        {confirmClear && (
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-red-500/40 bg-red-500/[0.08]">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-[11px] text-red-300">¿Seguro? Se borran TODAS las fuentes.</span>
            <button
              onClick={handleClear}
              disabled={clearing}
              className="px-3 py-1 rounded text-[11px] font-medium bg-red-500 hover:bg-red-500/85 text-white inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              {clearing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Sí, eliminar
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="px-3 py-1 rounded text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300"
            >
              Cancelar
            </button>
          </div>
        )}

        {!hasAnyEmbarqueSource && cfg.sources.length > 0 && (
          <span className="text-[11px] text-amber-400 inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Al menos una fuente tiene que mapear N° Embarque (la columna que define los embarques)
          </span>
        )}

        {saveResult && (
          <span className={`text-[11px] inline-flex items-center gap-1.5 ${saveResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {saveResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {saveResult.msg}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── SourceCard ──────────────────────────────────────────────────────────────

function SourceCard({
  source, isPrimary, expanded, onToggle, onChange, onRemove, onSetPrimary,
}: {
  source: ComexSource
  isPrimary: boolean
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<ComexSource>) => void
  onRemove: () => void
  onSetPrimary: () => void
}) {
  const [headers, setHeaders] = useState<string[]>([])
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewing, startPreview] = useTransition()

  function handlePreview() {
    setPreviewError(null)
    startPreview(async () => {
      const res = await previewSheetHeaders(source.url, source.sheetName)
      if (res.ok) setHeaders(res.headers)
      else { setPreviewError(res.error); setHeaders([]) }
    })
  }

  function setMapping(header: string, field: ComexMapping['field'] | null) {
    if (!field) {
      onChange({ mappings: source.mappings.filter(m => m.header !== header) })
      return
    }
    const existing = source.mappings.find(m => m.header === header)
    if (existing) {
      onChange({ mappings: source.mappings.map(m => m.header === header ? { ...m, field } : m) })
    } else {
      const def = MILESTONE_CATALOG.find(d => d.field === field)
      onChange({ mappings: [...source.mappings, { header, field, label: def?.label ?? header }] })
    }
  }

  const mappedCount = source.mappings.length
  const hasEmbarqueMapping = source.mappings.some(m => m.field === 'embarqueNo')

  return (
    <div className={cn(
      'rounded-lg border bg-[#0a0a0a] overflow-hidden transition-colors',
      isPrimary ? 'border-[#31AF4F]/40' : 'border-white/[0.08]',
      !source.enabled && 'opacity-50',
    )}>
      {/* Header de la card */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-white/[0.04]">
        <button
          onClick={onToggle}
          className="text-zinc-500 hover:text-white shrink-0"
          aria-label={expanded ? 'Colapsar' : 'Expandir'}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <input
          value={source.name}
          onChange={e => onChange({ name: e.target.value })}
          className="bg-transparent text-[13px] font-medium text-white flex-1 min-w-0 focus:outline-none border-b border-transparent focus:border-white/[0.2]"
          placeholder="Nombre de la fuente"
        />

        {isPrimary && (
          <span
            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#31AF4F]/15 text-[#31AF4F] font-bold inline-flex items-center gap-1"
            title="Esta fuente tiene mapping a N° Embarque — sus embarques aparecen en el panel"
          >
            <Star className="w-3 h-3 fill-current" /> Con embarques
          </span>
        )}

        <span className="text-[10px] text-zinc-500">{mappedCount} mapping{mappedCount === 1 ? '' : 's'}</span>

        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={source.enabled}
            onChange={e => onChange({ enabled: e.target.checked })}
            className="rounded"
          />
          <span className="text-[10px] text-zinc-400">Habilitada</span>
        </label>

        <button
          onClick={onRemove}
          className="text-zinc-500 hover:text-red-400 shrink-0"
          aria-label="Eliminar fuente"
          title="Eliminar esta fuente"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {expanded && (
        <div className="px-4 py-4 space-y-4">
          {/* URL + sheet */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block md:col-span-2">
              <span className="block text-[11px] text-zinc-400 mb-1">URL de la planilla</span>
              <input
                value={source.url}
                onChange={e => onChange({ url: e.target.value })}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full px-3 py-2 rounded-md bg-[#0d0d0d] border border-white/[0.08] text-white text-[12px] placeholder:text-zinc-600 focus:outline-none focus:border-[#31AF4F]/50"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] text-zinc-400 mb-1">Hoja (opcional)</span>
              <input
                value={source.sheetName ?? ''}
                onChange={e => onChange({ sheetName: e.target.value })}
                placeholder="Tracking"
                className="w-full px-3 py-2 rounded-md bg-[#0d0d0d] border border-white/[0.08] text-white text-[12px] placeholder:text-zinc-600 focus:outline-none focus:border-[#31AF4F]/50"
              />
            </label>
          </div>

          <button
            onClick={handlePreview}
            disabled={!source.url.trim() || previewing}
            className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-40 text-white inline-flex items-center gap-1.5"
          >
            {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
            Previsualizar columnas
          </button>

          {previewError && (
            <p className="text-[11px] text-red-400 inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {previewError}
            </p>
          )}

          {/* Si hay headers, mostrar selector de SO + tabla de mappings */}
          {headers.length > 0 && (
            <>
              <label className="block">
                <span className="block text-[11px] text-zinc-400 mb-1">Columna SO en esta planilla (obligatoria)</span>
                <select
                  value={source.joinCol}
                  onChange={e => onChange({ joinCol: e.target.value })}
                  className="w-full md:w-72 px-3 py-2 rounded-md bg-[#0d0d0d] border border-white/[0.08] text-white text-[12px] focus:outline-none focus:border-[#31AF4F]/50"
                >
                  <option value="">— Elegí columna —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>

              <div>
                <p className="text-[11px] text-zinc-400 mb-1">
                  <strong className="text-white">Mapeo de columnas → hitos</strong>
                </p>
                <p className="text-[10px] text-zinc-600 mb-3">
                  Para cada columna que querés exponer en el panel, elegí a qué hito alimenta.
                  Dejá &quot;Ignorar&quot; para columnas que no necesitás.
                </p>

                {isPrimary && !hasEmbarqueMapping && (
                  <div className="mb-3 p-2 rounded border border-amber-500/30 bg-amber-500/[0.05] text-[11px] text-amber-300 inline-flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>Como esta es la fuente principal, tenés que mapear una columna a <strong>N° Embarque</strong>.</span>
                  </div>
                )}

                <div className="rounded-md border border-white/[0.06] overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-[#0d0d0d] border-b border-white/[0.06]">
                        <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2">Columna en la sheet</th>
                        <th className="text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500 px-3 py-2">Mapear a hito</th>
                      </tr>
                    </thead>
                    <tbody>
                      {headers.filter(h => h !== source.joinCol).map(header => {
                        const current = source.mappings.find(m => m.header === header)
                        return (
                          <tr key={header} className="border-b border-white/[0.04] last:border-0">
                            <td className="px-3 py-1.5 font-mono text-[11px] text-zinc-300">{header}</td>
                            <td className="px-3 py-1.5">
                              <MilestoneSelect
                                currentField={current?.field ?? null}
                                isPrimary={isPrimary}
                                onChange={field => setMapping(header, field)}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── MilestoneSelect: dropdown para mapear a hito o extra ────────────────────

function MilestoneSelect({
  currentField, isPrimary, onChange,
}: {
  currentField: ComexMapping['field'] | null
  isPrimary: boolean
  onChange: (field: ComexMapping['field'] | null) => void
}) {
  const isExtra = typeof currentField === 'string' && currentField.startsWith('extra_')
  return (
    <select
      value={currentField ?? '__ignore__'}
      onChange={e => {
        const v = e.target.value
        if (v === '__ignore__') return onChange(null)
        if (v === '__extra__') {
          const slug = 'col_' + Math.random().toString(36).slice(2, 7)
          return onChange(`extra_${slug}` as ComexMapping['field'])
        }
        onChange(v as MilestoneField)
      }}
      className="w-full px-2 py-1 rounded bg-[#0d0d0d] border border-white/[0.08] text-white text-[11px] focus:outline-none focus:border-[#31AF4F]/50"
    >
      <option value="__ignore__">— Ignorar —</option>
      {isPrimary && (
        <optgroup label="Obligatoria en fuente principal">
          <option value="embarqueNo">📦 N° Embarque</option>
        </optgroup>
      )}
      <optgroup label="Tracking (alimentan estado del embarque)">
        {MILESTONE_CATALOG.filter(d => d.category === 'tracking').map(d => (
          <option key={d.field} value={d.field}>
            ⏱ {d.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Meta info">
        {MILESTONE_CATALOG.filter(d => d.category === 'meta').map(d => (
          <option key={d.field} value={d.field}>
            ℹ {d.label}
          </option>
        ))}
      </optgroup>
      <option value="__extra__">{isExtra ? '✓ Extra (libre)' : '+ Extra (libre)'}</option>
    </select>
  )
}
