export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ChevronLeft, Camera } from 'lucide-react'
import { listAllItemsForPhotoAssignment } from '@/app/lib/photo-actions'
import { PhotosUploadClient } from './PhotosUploadClient'

export default async function FotosPage() {
  const items = await listAllItemsForPhotoAssignment()

  return (
    <div className="px-6 py-5 max-w-[1200px]">
      <div className="flex items-center gap-2 mb-3 text-[11px] text-zinc-500">
        <Link href="/comercial" className="hover:text-white transition-colors inline-flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" />
          Carga CIPL
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <Camera className="w-5 h-5 text-[#31AF4F] shrink-0" />
        <h1 className="text-xl font-display font-semibold text-white tracking-tight">Subir fotos de inspección</h1>
      </div>

      <p className="text-[12px] text-zinc-500 mb-6">
        Subí un Excel con fotos embebidas. La IA extrae las etiquetas y matchea cada foto
        contra los ítems ya cargados. Después podés ajustar las asignaciones antes de guardar.
      </p>

      <PhotosUploadClient items={items} />
    </div>
  )
}
