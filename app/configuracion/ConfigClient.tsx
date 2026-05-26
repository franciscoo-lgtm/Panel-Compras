'use client'

import { useState, useTransition } from 'react'
import { Save, Loader2, AlertTriangle, CheckCircle2, Eye } from 'lucide-react'
import { saveComexConfig, previewSheetHeaders, type ComexConfig } from '@/app/lib/comex'

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

  const canPreview = cfg.url.trim().length > 0
  const canSave = cfg.url && cfg.joinCol && cfg.embarqueCol

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

          <div>
            <p className="text-[11px] text-zinc-400 mb-2">Columnas extra a mostrar (opcional, click para alternar):</p>
            <div className="flex flex-wrap gap-1.5">
              {availableExtraHeaders.map(h => {
                const enabled = cfg.extraCols.some(c => c.header === h)
                return (
                  <button
                    key={h}
                    onClick={() => toggleExtraCol(h)}
                    className={`px-2.5 py-1 rounded text-[10px] font-medium border transition-colors ${
                      enabled
                        ? 'bg-[#E30613]/10 text-white border-[#E30613]/40'
                        : 'bg-transparent text-zinc-500 border-white/[0.08] hover:text-zinc-300'
                    }`}
                  >
                    {h}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="px-4 py-2 rounded-md text-[12px] font-medium bg-[#E30613] hover:bg-[#E30613]/85 disabled:opacity-40 text-white inline-flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Guardar
        </button>

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
