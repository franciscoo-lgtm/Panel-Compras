'use client'

import { useState, useTransition } from 'react'
import { Save, Loader2, AlertTriangle, CheckCircle2, Eye, Trash2 } from 'lucide-react'
import { saveComexConfig, previewSheetHeaders, clearComexConfig, type ComexConfig } from '@/app/lib/comex'

const EMPTY: ComexConfig = {
  url: '',
  sheetName: '',
  joinCol: '',
  embarqueCol: '',
  extraCols: [],
}

export function ConfigClient({ initial }: { initial: ComexConfig | null }) {
  const [cfg, setCfg] = useState<ComexConfig>(initial ?? EMPTY)
  const [headers, setHeaders] = useState<string[]>([])
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewing, startPreview] = useTransition()
  const [saving, startSave] = useTransition()
  const [clearing, startClear] = useTransition()
  const [confirmClear, setConfirmClear] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null)

  function handlePreview() {
    setPreviewError(null)
    setSaveResult(null)
    startPreview(async () => {
      const res = await previewSheetHeaders(cfg.url, cfg.sheetName)
      if (res.ok) {
        setHeaders(res.headers)
      } else {
        setPreviewError(res.error)
        setHeaders([])
      }
    })
  }

  function toggleExtraCol(header: string) {
    setCfg(prev => {
      const idx = prev.extraCols.findIndex(c => c.header === header)
      if (idx >= 0) {
        return { ...prev, extraCols: prev.extraCols.filter((_, i) => i !== idx) }
      }
      return { ...prev, extraCols: [...prev.extraCols, { header, label: header }] }
    })
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
        setCfg(EMPTY)
        setHeaders([])
        setConfirmClear(false)
        setSaveResult({ ok: true, msg: 'Configuración eliminada. /embarques no tendrá datos de Comex hasta que configures de nuevo.' })
      } catch (err) {
        setSaveResult({ ok: false, msg: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  const canPreview = cfg.url.trim().length > 0
  const canSave = cfg.url && cfg.joinCol && cfg.embarqueCol
  const hasInitialConfig = initial != null && initial.url.length > 0

  const availableExtraHeaders = headers.filter(h => h !== cfg.joinCol && h !== cfg.embarqueCol)

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-5 space-y-4">
        <h3 className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">Planilla Comex</h3>

        <label className="block">
          <span className="block text-[11px] text-zinc-400 mb-1">URL de la planilla (Google Sheets)</span>
          <input
            value={cfg.url}
            onChange={e => setCfg({ ...cfg, url: e.target.value })}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="w-full px-3 py-2 rounded-md bg-[#0d0d0d] border border-white/[0.08] text-white text-[12px] placeholder:text-zinc-600 focus:outline-none focus:border-[#E30613]/50"
          />
        </label>

        <label className="block">
          <span className="block text-[11px] text-zinc-400 mb-1">Nombre de la hoja (opcional)</span>
          <input
            value={cfg.sheetName ?? ''}
            onChange={e => setCfg({ ...cfg, sheetName: e.target.value })}
            placeholder="Tracking"
            className="w-full px-3 py-2 rounded-md bg-[#0d0d0d] border border-white/[0.08] text-white text-[12px] placeholder:text-zinc-600 focus:outline-none focus:border-[#E30613]/50"
          />
        </label>

        <button
          onClick={handlePreview}
          disabled={!canPreview || previewing}
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
      </div>

      {headers.length > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-[#0a0a0a] p-5 space-y-4">
          <h3 className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">Columnas detectadas ({headers.length})</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] text-zinc-400 mb-1">Columna SO (obligatoria)</span>
              <select
                value={cfg.joinCol}
                onChange={e => setCfg({ ...cfg, joinCol: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-[#0d0d0d] border border-white/[0.08] text-white text-[12px] focus:outline-none focus:border-[#E30613]/50"
              >
                <option value="">— Elegí columna —</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="block text-[11px] text-zinc-400 mb-1">Columna N° Embarque (obligatoria)</span>
              <select
                value={cfg.embarqueCol}
                onChange={e => setCfg({ ...cfg, embarqueCol: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-[#0d0d0d] border border-white/[0.08] text-white text-[12px] focus:outline-none focus:border-[#E30613]/50"
              >
                <option value="">— Elegí columna —</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          </div>

          {/* Detección automática de tracking */}
          {(() => {
            const detect = (kw: string) => availableExtraHeaders.find(h => h.toLowerCase().includes(kw))
            const etd = detect('etd')
            const eta = detect('eta')
            const awb = detect('awb')
            const arribo = detect('arribo')
            const any = etd || eta || awb || arribo
            if (!any) return null
            return (
              <div className="rounded-md border border-blue-500/30 bg-blue-500/[0.04] p-3">
                <p className="text-[11px] uppercase tracking-wider text-blue-400 font-semibold mb-2">
                  ✨ Columnas de tracking auto-detectadas
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  <div>
                    <p className="text-zinc-500 text-[9px] uppercase">ETD</p>
                    <p className={etd ? 'text-blue-300 font-mono truncate' : 'text-zinc-600 italic'}>{etd ?? 'no encontrada'}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-[9px] uppercase">ETA</p>
                    <p className={eta ? 'text-blue-300 font-mono truncate' : 'text-zinc-600 italic'}>{eta ?? 'no encontrada'}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-[9px] uppercase">AWB</p>
                    <p className={awb ? 'text-blue-300 font-mono truncate' : 'text-zinc-600 italic'}>{awb ?? 'no encontrada'}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-[9px] uppercase">Arribo</p>
                    <p className={arribo ? 'text-blue-300 font-mono truncate' : 'text-zinc-600 italic'}>{arribo ?? 'no encontrada'}</p>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 mt-2">
                  Estas se usan automáticamente para el estado del embarque. Activá su toggle abajo si querés que también aparezcan en el panel.
                </p>
              </div>
            )
          })()}

          <div>
            <p className="text-[11px] text-zinc-400 mb-1">
              <strong className="text-white">Columnas extra a mostrar</strong> en el detalle del embarque (opcional):
            </p>
            <p className="text-[10px] text-zinc-600 mb-2">
              Click para activar/desactivar. Las verdes están activadas.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {availableExtraHeaders.map(h => {
                const enabled = cfg.extraCols.some(c => c.header === h)
                const isAutoDetected = ['etd', 'eta', 'awb', 'arribo'].some(kw => h.toLowerCase().includes(kw))
                return (
                  <button
                    key={h}
                    onClick={() => toggleExtraCol(h)}
                    className={`px-2.5 py-1 rounded text-[10px] font-medium border transition-colors ${
                      enabled
                        ? 'bg-[#E30613]/10 text-white border-[#E30613]/40'
                        : isAutoDetected
                          ? 'bg-blue-500/[0.05] text-blue-400/70 border-blue-500/20 hover:text-blue-300'
                          : 'bg-transparent text-zinc-500 border-white/[0.08] hover:text-zinc-300'
                    }`}
                    title={isAutoDetected ? 'Auto-detectada (ya se usa para estado/tracking)' : undefined}
                  >
                    {h}{isAutoDetected && ' ✨'}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="px-4 py-2 rounded-md text-[12px] font-medium bg-[#E30613] hover:bg-[#E30613]/85 disabled:opacity-40 text-white inline-flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Guardar
        </button>

        {hasInitialConfig && !confirmClear && (
          <button
            onClick={() => setConfirmClear(true)}
            className="px-3 py-2 rounded-md text-[11px] font-medium border border-red-500/30 bg-red-500/[0.05] hover:bg-red-500/[0.1] text-red-400 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar configuración
          </button>
        )}

        {confirmClear && (
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-red-500/40 bg-red-500/[0.08]">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-[11px] text-red-300">¿Seguro? Se borra la planilla y /embarques queda vacío.</span>
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
