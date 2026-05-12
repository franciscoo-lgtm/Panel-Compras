import { Camera } from 'lucide-react'
import InspeccionClient from './InspeccionClient'

export const maxDuration = 60

export default function InspeccionPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Camera className="w-5 h-5 text-amber-500 shrink-0" />
        <h1 className="text-xl font-semibold text-zinc-900">Inspección de Fotos</h1>
        <span className="text-xs text-zinc-400">Subí el Excel de fotos para asignarlas a las cajas del CIPL</span>
      </div>
      <InspeccionClient />
    </div>
  )
}
