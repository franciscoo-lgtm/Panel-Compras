export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { listAllSOs } from '@/app/lib/sheets'
import { NuevaCompraClient, type SupplierSuggestions } from './NuevaCompraClient'

async function getSupplierSuggestions(): Promise<SupplierSuggestions> {
  const compras = await prisma.compra.findMany({
    select: {
      supplierName:         true,
      supplierAddress:      true,
      supplierContactName:  true,
      supplierContactPhone: true,
      supplierContactEmail: true,
    },
    take: 500,
    orderBy: { createdAt: 'desc' },  // más recientes primero (gana el último uso si hay duplicado de nombre)
  })

  const dedupe = (vals: (string | null)[]): string[] => {
    const set = new Set<string>()
    for (const v of vals) {
      const t = v?.trim()
      if (t) set.add(t)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }

  // Por nombre de proveedor, guardamos el registro completo más reciente
  // para poder auto-completar el resto de campos cuando el usuario lo elige.
  const byName: Record<string, {
    address: string | null
    contact: string | null
    phone:   string | null
    email:   string | null
  }> = {}
  for (const c of compras) {
    const name = c.supplierName?.trim()
    if (!name || name in byName) continue   // primero gana (más reciente)
    byName[name] = {
      address: c.supplierAddress?.trim()      || null,
      contact: c.supplierContactName?.trim()  || null,
      phone:   c.supplierContactPhone?.trim() || null,
      email:   c.supplierContactEmail?.trim() || null,
    }
  }

  return {
    names:     dedupe(compras.map(c => c.supplierName)),
    addresses: dedupe(compras.map(c => c.supplierAddress)),
    contacts:  dedupe(compras.map(c => c.supplierContactName)),
    phones:    dedupe(compras.map(c => c.supplierContactPhone)),
    emails:    dedupe(compras.map(c => c.supplierContactEmail)),
    byName,
  }
}

export default async function NuevaCompraPage() {
  const [soList, supplierSuggestions] = await Promise.all([
    listAllSOs(),
    getSupplierSuggestions(),
  ])
  return <NuevaCompraClient soList={soList} supplierSuggestions={supplierSuggestions} />
}
