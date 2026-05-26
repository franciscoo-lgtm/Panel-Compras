import { NextResponse } from 'next/server'
import { getComexConfig, fetchComexData } from '@/app/lib/comex'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const cfg = await getComexConfig()
  if (!cfg) {
    return NextResponse.json(
      { ok: false, error: 'Sin configuración de Comex. Configurá en /configuracion primero.' },
      { status: 500 },
    )
  }

  const data = await fetchComexData()
  const splitCount = Array.from(data.bySO.values()).filter(r => r.shipments.length > 1).length

  return NextResponse.json({
    ok: data.errors.length === 0,
    fetchedAt: data.fetchedAt,
    config: {
      totalSources: cfg.sources.length,
      enabledSources: cfg.sources.filter(s => s.enabled).length,
      primarySourceId: cfg.primarySourceId,
      sources: cfg.sources.map(s => ({
        id: s.id,
        name: s.name,
        enabled: s.enabled,
        url: s.url,
        sheetName: s.sheetName ?? null,
        joinCol: s.joinCol,
        mappings: s.mappings.length,
        isPrimary: s.id === cfg.primarySourceId,
      })),
    },
    stats: {
      sosTotal: data.bySO.size,
      embarquesUnique: data.byEmbarque.size,
      sosWithSplit: splitCount,
      fieldsAvailable: data.extraColumns.length,
    },
    errors: data.errors,
  })
}
