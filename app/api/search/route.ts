import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listEmbarques } from '@/app/lib/embarques'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type SearchResult = {
  embarques: { embarqueNo: string; estado: string; sos: string[] }[]
  sos:       { soNumber: string; count: number }[]
  asns:      { asn: string; count: number }[]
  productos: { id: string; description: string; sku: string | null; codeEan: string | null; soPrincipal: string | null }[]
  compras:   { id: string; piNo: string | null; supplierName: string | null }[]
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < 2) {
    return NextResponse.json({ embarques: [], sos: [], asns: [], productos: [], compras: [] })
  }

  const qUpper = q.toUpperCase()

  const [{ summaries }, sosRaw, asnsRaw, productos, compras] = await Promise.all([
    listEmbarques(),
    prisma.cIPLItem.groupBy({
      where: { soPrincipal: { contains: qUpper, mode: 'insensitive' } },
      by: ['soPrincipal'],
      _count: { _all: true },
      orderBy: { _count: { soPrincipal: 'desc' } },
      take: 5,
    }),
    prisma.cIPLItem.groupBy({
      where: { asn: { contains: qUpper, mode: 'insensitive' } },
      by: ['asn'],
      _count: { _all: true },
      orderBy: { _count: { asn: 'desc' } },
      take: 5,
    }),
    prisma.cIPLItem.findMany({
      where: {
        OR: [
          { description: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
          { codeEan: { contains: q } },
        ],
      },
      select: { id: true, description: true, sku: true, codeEan: true, soPrincipal: true },
      take: 8,
    }),
    prisma.compra.findMany({
      where: {
        OR: [
          { piNo: { contains: q, mode: 'insensitive' } },
          { supplierName: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, piNo: true, supplierName: true },
      take: 5,
    }),
  ])

  const embarques = summaries
    .filter(s => s.embarqueNo.toUpperCase().includes(qUpper) || s.sos.some(so => so.includes(qUpper)))
    .slice(0, 5)
    .map(s => ({ embarqueNo: s.embarqueNo, estado: s.estado, sos: s.sos }))

  return NextResponse.json({
    embarques,
    sos:  sosRaw.filter(s => s.soPrincipal != null).map(s => ({ soNumber: s.soPrincipal!, count: s._count._all })),
    asns: asnsRaw.filter(a => a.asn != null).map(a => ({ asn: a.asn!, count: a._count._all })),
    productos: productos.map(p => ({ ...p, description: p.description ?? '—' })),
    compras,
  })
}
