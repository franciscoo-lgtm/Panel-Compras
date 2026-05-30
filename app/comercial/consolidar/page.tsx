export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ChevronLeft, FileSpreadsheet } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { ConsolidarClient, type PLSummary } from './ConsolidarClient'

async function listPLs(): Promise<PLSummary[]> {
  // Agrupar por ASN. Para cada ASN: count items, sum qty/cbm/gwKg, distinct SOs,
  // primer PI, supplier vinculado, fecha de carga más vieja.
  const items = await prisma.cIPLItem.findMany({
    select: {
      id: true,
      asn: true,
      piNo: true,
      qty: true,
      cbm: true,
      gwKg: true,
      soPrincipal: true,
      tipoCarga: true,
      categoryName: true,
      createdAt: true,
      driveLinkExcel: true,
      driveLinkPl: true,
      compra: {
        select: { supplierName: true, piNo: true },
      },
    },
    where: { asn: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  })

  const map = new Map<string, PLSummary>()
  for (const it of items) {
    const asn = it.asn!.trim()
    if (!asn) continue
    let agg = map.get(asn)
    if (!agg) {
      agg = {
        asn,
        items: 0,
        qty: 0,
        cbm: 0,
        gwKg: 0,
        sosUnique: new Set<string>(),
        piNo: it.piNo ?? it.compra?.piNo ?? null,
        supplier: it.compra?.supplierName ?? null,
        tipoCarga: it.tipoCarga,
        categoryName: it.categoryName ?? null,
        loadedAt: it.createdAt.toISOString(),
        hasDriveLink: false,
      } as PLSummary & { sosUnique: Set<string> }
      map.set(asn, agg)
    }
    const ext = agg as PLSummary & { sosUnique: Set<string> }
    ext.items++
    ext.qty   += it.qty ?? 0
    ext.cbm   += it.cbm ?? 0
    ext.gwKg  += it.gwKg ?? 0
    if (it.soPrincipal) ext.sosUnique.add(it.soPrincipal.trim().toUpperCase())
    if (it.driveLinkExcel || it.driveLinkPl) ext.hasDriveLink = true
    if (it.createdAt.toISOString() < ext.loadedAt) ext.loadedAt = it.createdAt.toISOString()
  }

  return Array.from(map.values()).map(p => {
    const ext = p as PLSummary & { sosUnique: Set<string> }
    return {
      asn: ext.asn,
      items: ext.items,
      qty: ext.qty,
      cbm: ext.cbm,
      gwKg: ext.gwKg,
      sosCount: ext.sosUnique.size,
      sos: Array.from(ext.sosUnique).sort(),
      piNo: ext.piNo,
      supplier: ext.supplier,
      tipoCarga: ext.tipoCarga,
      categoryName: ext.categoryName,
      loadedAt: ext.loadedAt,
      hasDriveLink: ext.hasDriveLink,
    }
  }).sort((a, b) => b.loadedAt.localeCompare(a.loadedAt))   // más nuevos primero
}

export default async function ConsolidarPage() {
  const pls = await listPLs()

  return (
    <div className="px-6 py-5 max-w-[1400px]">
      <div className="flex items-center gap-2 mb-3 text-[11px] text-zinc-500">
        <Link href="/comercial" className="hover:text-white transition-colors inline-flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" />
          Carga CIPL
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <FileSpreadsheet className="w-5 h-5 text-[#31AF4F] shrink-0" />
        <h1 className="text-xl font-display font-semibold text-white tracking-tight">PL Consolidado</h1>
      </div>

      <p className="text-[12px] text-zinc-500 mb-6">
        Marcá los PLs que querés consolidar en un solo Excel. Usá esto para mandar instrucción al forwarder
        cuando varios PLs viajan juntos.
      </p>

      <ConsolidarClient pls={pls} />
    </div>
  )
}
