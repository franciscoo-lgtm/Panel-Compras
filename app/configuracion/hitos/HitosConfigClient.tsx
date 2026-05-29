'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Save, Loader2, AlertTriangle, CheckCircle2, Plus, ArrowUp, ArrowDown, Trash2, RotateCcw } from 'lucide-react'
import { saveMilestonesConfig, resetMilestonesConfig, DEFAULT_MILESTONES, type MilestoneConfig, type MilestoneSource } from '@/app/lib/milestones-config'
import { cn } from '@/lib/utils'

type ComexField = { fieldKey: string; label: string; category: 'tracking' | 'meta' | 'extra' }
type CompraField = { field: string; label: string }

export function HitosConfigClient({
  initial,
  comexFields,
  compraFields,
}: {
  initial: MilestoneConfig[]
  comexFields: ComexField[]
  compraFields: CompraField[]
}) {
  const [milestones, setMilestones] = useState<MilestoneConfig[]>(initial)
  const [saving, startSave] = useTransition()
  const [resetting, startReset] = useTransition()
  const [confirmReset, setConfirmReset] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  function update(i: number, patch: Partial<MilestoneConfig>) {
    setMilestones(prev => prev.map((m, idx) => idx === i ? { ...m, ...patch } : m))
  }

  function move(i: number, dir: -1 | 1) {
    const target = i + dir
    if (target < 0 || target >= milestones.length) return
    setMilestones(prev => {
      const next = [...prev]
      const a = next[i]!, b = next[target]!
      next[i] = b
      next[target] = a
      return next
    })
  }

  function remove(i: number) {
    setMilestones(prev => prev.filter((_, idx) => idx !== i))
  }

  function addCustom() {
    const newKey = `custom_${Date.now()}`
    setMilestones(prev => [...prev, {
      key: newKey,
      label: 'Nuevo hito',
      source: 'comex',
      comexFieldKey: comexFields[0]?.fieldKey ?? 'etd',
      showIn: ['embarques'],
      custom: true,
    }])
  }

  function handleSave() {
    setResult(null)
    startSave(async () => {
      try {
        await saveMilestonesConfig(milestones)
        setResult({ ok: true, msg: 'Hitos guardados. Aplica al próximo refresh de las páginas de seguimiento.' })
      } catch (err) {
        setResult({ ok: false, msg: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  function handleReset() {
    setResult(null)
    startReset(async () => {
      try {
        await resetMilestonesConfig()
        setMilestones(DEFAULT_MILESTONES)
        setConfirmReset(false)
        setResult({ ok: true, msg: 'Hitos restaurados a los valores por defecto.' })
      } catch (err) {
        setResult({ ok: false, msg: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Tabla de hitos */}
      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[12px]">
            <thead>
              <tr className="bg-[#0d0d0d] border-b border-white/[0.06]">
                <th className="px-3 py-2.5 w-12 text-center text-[10px] uppercase tracking-wider font-semibold text-zinc-500">#</th>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Nombre</th>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Fuente</th>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Campo</th>
                <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Compras</th>
                <th className="px-3 py-2.5 text-center text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Embarques</th>
                <th className="px-3 py-2.5 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m, i) => (
                <tr key={m.key} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-3 py-2 text-center text-zinc-500 text-[11px]">{i + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      value={m.label}
                      onChange={e => update(i, { label: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-[#0d0d0d] border border-white/[0.08] text-white text-[12px] focus:outline-none focus:border-[#E30613]/50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={m.source}
                      onChange={e => update(i, { source: e.target.value as MilestoneSource })}
                      className="w-full px-2 py-1 rounded bg-[#0d0d0d] border border-white/[0.08] text-white text-[11px] focus:outline-none focus:border-[#E30613]/50"
                    >
                      <option value="manual">Manual (Compra)</option>
                      <option value="comex">Comex (sheet)</option>
                      <option value="auto">Auto (calculado)</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {m.source === 'manual' && (
                      <select
                        value={m.compraField ?? ''}
                        onChange={e => update(i, { compraField: e.target.value || undefined })}
                        className="w-full px-2 py-1 rounded bg-[#0d0d0d] border border-white/[0.08] text-white text-[11px] focus:outline-none focus:border-[#E30613]/50"
                      >
                        <option value="">—</option>
                        {compraFields.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
                      </select>
                    )}
                    {m.source === 'comex' && (
                      <select
                        value={m.comexFieldKey ?? ''}
                        onChange={e => update(i, { comexFieldKey: e.target.value || undefined })}
                        className="w-full px-2 py-1 rounded bg-[#0d0d0d] border border-white/[0.08] text-white text-[11px] focus:outline-none focus:border-[#E30613]/50"
                      >
                        <option value="">— elegí campo —</option>
                        <optgroup label="Tracking">
                          {comexFields.filter(f => f.category === 'tracking').map(f =>
                            <option key={f.fieldKey} value={f.fieldKey}>⏱ {f.label}</option>
                          )}
                        </optgroup>
                        <optgroup label="Meta">
                          {comexFields.filter(f => f.category === 'meta').map(f =>
                            <option key={f.fieldKey} value={f.fieldKey}>ℹ {f.label}</option>
                          )}
                        </optgroup>
                        {comexFields.filter(f => f.category === 'extra').length > 0 && (
                          <optgroup label="Extras">
                            {comexFields.filter(f => f.category === 'extra').map(f =>
                              <option key={f.fieldKey} value={f.fieldKey}>+ {f.label}</option>
                            )}
                          </optgroup>
                        )}
                      </select>
                    )}
                    {m.source === 'auto' && (
                      <span className="text-[10px] text-zinc-500 italic">PL Cargado (createdAt del primer CIPLItem)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={m.showIn.includes('compras')}
                      onChange={e => {
                        const set = new Set(m.showIn)
                        if (e.target.checked) set.add('compras'); else set.delete('compras')
                        update(i, { showIn: Array.from(set) as ('compras' | 'embarques')[] })
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={m.showIn.includes('embarques')}
                      onChange={e => {
                        const set = new Set(m.showIn)
                        if (e.target.checked) set.add('embarques'); else set.delete('embarques')
                        update(i, { showIn: Array.from(set) as ('compras' | 'embarques')[] })
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Mover arriba"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={i === milestones.length - 1}
                        className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Mover abajo"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => remove(i)}
                        className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/[0.06]"
                        title="Eliminar hito"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button
        onClick={addCustom}
        className="w-full px-4 py-3 rounded-lg border border-dashed border-white/[0.12] hover:border-[#E30613]/40 hover:bg-[#E30613]/[0.04] text-[12px] text-zinc-400 hover:text-white inline-flex items-center justify-center gap-2 transition-colors"
      >
        <Plus className="w-4 h-4" /> Agregar hito custom
      </button>

      <div className="flex items-center gap-3 pt-4 border-t border-white/[0.06] flex-wrap">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-md text-[12px] font-medium bg-[#E30613] hover:bg-[#E30613]/85 disabled:opacity-40 text-white inline-flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Guardar hitos
        </button>

        {!confirmReset && (
          <button
            onClick={() => setConfirmReset(true)}
            className="px-3 py-2 rounded-md text-[11px] font-medium border border-white/[0.08] hover:bg-white/[0.06] text-zinc-300 inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar default
          </button>
        )}

        {confirmReset && (
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/[0.05]">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] text-amber-300">¿Restaurar los 12 hitos por defecto?</span>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="px-3 py-1 rounded text-[11px] font-medium bg-amber-500 hover:bg-amber-500/85 text-zinc-900 disabled:opacity-40 inline-flex items-center gap-1"
            >
              {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Sí
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="px-3 py-1 rounded text-[11px] font-medium border border-white/[0.15] hover:bg-white/[0.06] text-zinc-300"
            >
              Cancelar
            </button>
          </div>
        )}

        {result && (
          <span className={cn(
            'text-[11px] inline-flex items-center gap-1.5 ml-auto',
            result.ok ? 'text-emerald-400' : 'text-red-400',
          )}>
            {result.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {result.msg}
          </span>
        )}
      </div>

      <div className="rounded-md border border-white/[0.06] bg-[#0d0d0d] p-3 text-[11px] text-zinc-400 space-y-1">
        <p><strong className="text-white">Cómo funciona:</strong></p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li><strong className="text-zinc-200">Manual</strong>: el dato viene de un campo de Compra (fechaEnvio, fechaPago, etc.). Editable desde el detalle de la Compra.</li>
          <li><strong className="text-zinc-200">Comex</strong>: el dato viene de la planilla de Comex mergeada. El sistema busca por SO y trae el valor de la fuente más reciente.</li>
          <li><strong className="text-zinc-200">Auto</strong>: el sistema calcula la fecha (solo &quot;PL Cargado&quot; por ahora).</li>
        </ul>
        <p className="mt-2">Para agregar nuevos campos Comex (ej. &quot;Arribo Buque&quot;), mapealos primero en <Link href="/configuracion" className="text-blue-400 hover:underline">/configuracion</Link> dentro de alguna fuente, después aparecerán acá como opción.</p>
      </div>
    </div>
  )
}
