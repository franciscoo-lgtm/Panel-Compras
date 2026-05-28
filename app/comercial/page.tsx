'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Upload, Sparkles, Camera, ShieldCheck, CheckCircle2, FileSpreadsheet } from 'lucide-react'
import type { ExtractedItem, DriveLinks } from '@/app/lib/etl'
import type { PhotoExtractionResult } from '@/components/shared/InspectionPhotoUploader'
import { Step1Upload } from './_components/Step1Upload'
import { Step2AssignSOs } from './_components/Step2AssignSOs'
import { Step3Photos } from './_components/Step3Photos'
import { Step4Control } from './_components/Step4Control'
import { Step5Confirm } from './_components/Step5Confirm'

const EMPTY_LINKS: DriveLinks = { excel: null, ci: null, pl: null }

type Step = 1 | 2 | 3 | 4 | 5

const STEPS: { n: Step; label: string; icon: React.ElementType }[] = [
  { n: 1, label: 'Cargar archivo',       icon: Upload      },
  { n: 2, label: 'Asignar SOs',          icon: Sparkles    },
  { n: 3, label: 'Fotos inspección',     icon: Camera      },
  { n: 4, label: 'Control',              icon: ShieldCheck },
  { n: 5, label: 'Confirmado',           icon: CheckCircle2},
]

export default function ComercialPage() {
  const [step, setStep] = useState<Step>(1)
  const [items, setItems] = useState<ExtractedItem[]>([])
  const [tipo, setTipo] = useState<'Repuesto' | 'Mercaderia'>('Repuesto')
  const [category, setCategory] = useState('')
  const [driveLinks, setDriveLinks] = useState<DriveLinks>(EMPTY_LINKS)
  const [sos, setSos] = useState<string[]>([])
  const [photos, setPhotos] = useState<PhotoExtractionResult[]>([])
  const [saved, setSaved] = useState(0)

  function handleExtracted(extracted: ExtractedItem[], t: 'Repuesto' | 'Mercaderia', cat: string, links: DriveLinks) {
    setItems(extracted)
    setTipo(t); setCategory(cat); setDriveLinks(links)
    setSos(Array(extracted.length).fill(''))
    setStep(2)
  }

  function handleSOsAssigned(count: number, sosAssigned: string[]) {
    setSos(sosAssigned)
    setSaved(count)
    setStep(3)
  }

  function handlePhotosDone(p: PhotoExtractionResult[]) {
    setPhotos(p)
    setStep(4)
  }

  function handleConfirm() {
    setStep(5)
  }

  function handleReset() {
    setItems([]); setSos([]); setPhotos([]); setDriveLinks(EMPTY_LINKS); setSaved(0)
    setStep(1)
  }

  return (
    <div className="px-6 py-5 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-display font-bold text-white tracking-tight mb-1">Carga CIPL</h1>
            <p className="text-[12px] text-zinc-500">Extraé y guardá CIPLs de Repuestos o Mercadería DJI</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/comercial/consolidar"
              className="px-3 py-2 rounded-md text-[11px] font-medium border border-white/[0.08] hover:border-[#E30613]/40 hover:bg-[#E30613]/10 text-zinc-300 hover:text-white inline-flex items-center gap-1.5 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Exportar PL Consolidado
            </Link>
            <Link
              href="/comercial/fotos"
              className="px-3 py-2 rounded-md text-[11px] font-medium border border-white/[0.08] hover:border-[#E30613]/40 hover:bg-[#E30613]/10 text-zinc-300 hover:text-white inline-flex items-center gap-1.5 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              Subir fotos a un CIPL ya cargado
            </Link>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-6 text-[11px] overflow-x-auto pb-1">
        {STEPS.map(({ n, label, icon: Icon }, idx) => {
          const done = step > n
          const active = step === n
          return (
            <React.Fragment key={n}>
              {idx > 0 && <ChevronRight className="w-3 h-3 text-zinc-700 shrink-0" />}
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded font-medium whitespace-nowrap ${
                active ? 'text-[#E30613] bg-[#E30613]/10' :
                done   ? 'text-emerald-400' : 'text-zinc-500'
              }`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  done   ? 'bg-emerald-500/20 text-emerald-400' :
                  active ? 'bg-[#E30613]/20 text-[#E30613]' :
                          'bg-white/[0.06] text-zinc-500'
                }`}>{n}</span>
                <Icon className="w-3.5 h-3.5" />
                {label}
              </div>
            </React.Fragment>
          )
        })}
      </div>

      {step === 1 && <Step1Upload onDone={handleExtracted} />}
      {step === 2 && (
        <Step2AssignSOs
          items={items}
          tipoCarga={tipo}
          categoryName={category}
          driveLinks={driveLinks}
          onBack={handleReset}
          onSaved={handleSOsAssigned}
        />
      )}
      {step === 3 && <Step3Photos onBack={() => setStep(2)} onContinue={handlePhotosDone} />}
      {step === 4 && <Step4Control items={items} sos={sos} photos={photos} onBack={() => setStep(3)} onContinue={handleConfirm} />}
      {step === 5 && <Step5Confirm count={saved} driveLinks={driveLinks} onNew={handleReset} />}
    </div>
  )
}
