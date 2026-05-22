export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getComexSources, fetchAllSourcesData } from '@/app/lib/comex-sources'
import { CompraDetail } from './CompraDetail'

export default async function CompraDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const compra = await prisma.compra.findUnique({
    where: { id },
    include: {
      sos: true,
      ciplItems: {
        select: { id: true, asn: true, qty: true, soPrincipal: true, description: true, caseNo: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!compra) notFound()

  const sources = await getComexSources()
  const { liveData } = await fetchAllSourcesData(sources)

  const compraSerial = {
    ...compra,
    createdAt:          compra.createdAt.toISOString(),
    updatedAt:          compra.updatedAt.toISOString(),
    fechaOrden:         compra.fechaOrden.toISOString(),
    fechaEnvio:         compra.fechaEnvio?.toISOString()         ?? null,
    fechaPago:          compra.fechaPago?.toISOString()          ?? null,
    fechaSegundaValPA:  compra.fechaSegundaValPA?.toISOString()  ?? null,
    fechaInstruccionCat:compra.fechaInstruccionCat?.toISOString()?? null,
    fechaLMS:           compra.fechaLMS?.toISOString()           ?? null,
    ciplItems: compra.ciplItems.map(c => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    })),
  }

  return <CompraDetail compra={compraSerial} liveData={liveData} />
}
