'use client'

import React, { useState } from 'react'
import type { ExtractedItem, DriveLinks } from '@/app/lib/etl'
import {
  FileSpreadsheet, FileText, ChevronRight,
  CheckCircle2, RotateCcw, ExternalLink, FolderOpen,
} from 'lucide-react'
import { Step1Upload } from './_components/Step1Upload'
import { Step2AssignSOs } from './_components/Step2AssignSOs'

// ─── Step 3 — Done ────────────────────────────────────────────────────────────

function Step3Done({ count, driveLinks, onNew }: { count: number; driveLinks: DriveLinks; onNew: () => void }) {
  const links = [
    driveLinks.excel && { label: 'Excel CIPL', href: driveLinks.excel, color: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: <FileSpreadsheet className="w-4 h-4" /> },
    driveLinks.ci    && { label: 'Commercial Invoice', href: driveLinks.ci, color: 'bg-blue-50 border-blue-200 text-blue-700', icon: <FileText className="w-4 h-4" /> },
    driveLinks.pl    && { label: 'Packing List', href: driveLinks.pl, color: 'bg-violet-50 border-violet-200 text-violet-700', icon: <FileText className="w-4 h-4" /> },
  ].filter(Boolean) as { label: string; href: string; color: string; icon: React.ReactNode }[]

  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
      </div>
      <div>
        <p className="text-xl font-semibold text-zinc-900">
          {count} ítem{count !== 1 ? 's' : ''} guardado{count !== 1 ? 's' : ''}
        </p>
        <p className="text-sm text-zinc-400 mt-1">Ya están disponibles en el Panel General.</p>
      </div>

      {links.length > 0 && (
        <div className="w-full bg-zinc-50 rounded-xl border border-zinc-100 p-4 text-left space-y-2">
          <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5 text-emerald-500" />
            Archivos guardados en Google Drive
          </p>
          {links.map(({ label, href, color, icon }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer"
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-sm font-medium hover:opacity-80 transition-opacity ${color}`}>
              {icon}
              {label}
              <ExternalLink className="w-3.5 h-3.5 ml-auto" />
            </a>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onNew}
        className="flex items-center gap-2 h-10 px-6 rounded-xl border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        <RotateCcw className="w-4 h-4" /> Cargar otro CIPL
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const EMPTY_LINKS: DriveLinks = { excel: null, ci: null, pl: null }

export default function ComercialPage() {
  const [step, setStep]           = useState<1 | 2 | 3>(1)
  const [items, setItems]         = useState<ExtractedItem[]>([])
  const [tipo, setTipo]           = useState<'Repuesto' | 'Mercaderia'>('Repuesto')
  const [category, setCategory]   = useState('')
  const [driveLinks, setDriveLinks] = useState<DriveLinks>(EMPTY_LINKS)
  const [saved, setSaved]         = useState(0)

  function handleExtracted(extracted: ExtractedItem[], t: 'Repuesto' | 'Mercaderia', cat: string, links: DriveLinks) {
    setItems(extracted)
    setTipo(t)
    setCategory(cat)
    setDriveLinks(links)
    setStep(2)
  }

  function handleSaved(count: number, _sos: string[]) {
    setSaved(count)
    setStep(3)
  }

  function handleReset() {
    setItems([])
    setDriveLinks(EMPTY_LINKS)
    setStep(1)
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Módulo</p>
        <h1 className="text-2xl font-semibold text-zinc-900">Carga Comercial</h1>
        <p className="text-sm text-zinc-400 mt-1">Extraé y guardá CIPLs de Repuestos o Mercadería DJI</p>
      </div>

      <div className="flex items-center gap-2 mb-8 text-xs">
        {([
          [1, 'Cargar archivo'],
          [2, 'Revisar y asignar SOs'],
          [3, 'Confirmado'],
        ] as const).map(([n, label], idx) => (
          <div key={n} className="flex items-center gap-2">
            {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-zinc-200" />}
            <span className={`flex items-center gap-1.5 font-medium ${
              step === n ? 'text-amber-600' : step > n ? 'text-zinc-400' : 'text-zinc-300'
            }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                step > n   ? 'bg-emerald-100 text-emerald-600' :
                step === n ? 'bg-amber-100 text-amber-600' : 'bg-zinc-100 text-zinc-400'
              }`}>{n}</span>
              {label}
            </span>
          </div>
        ))}
      </div>

      {step === 1 && <Step1Upload onDone={handleExtracted} />}
      {step === 2 && (
        <Step2AssignSOs
          items={items}
          tipoCarga={tipo}
          categoryName={category}
          driveLinks={driveLinks}
          onBack={handleReset}
          onSaved={handleSaved}
        />
      )}
      {step === 3 && <Step3Done count={saved} driveLinks={driveLinks} onNew={handleReset} />}
    </div>
  )
}
