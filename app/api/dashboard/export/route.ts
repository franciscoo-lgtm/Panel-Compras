import { listEmbarques } from '@/app/lib/embarques'
import { getExecutiveKPIs } from '@/app/lib/dashboard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/dashboard/export?format=csv
 * Genera un CSV con los KPIs ejecutivos + tabla resumen de embarques.
 * El archivo se sirve con Content-Disposition para que el browser lo
 * descargue directo. Útil para que dirección o Comex tengan los KPIs
 * en Excel sin tener que screenshot del panel.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const format = url.searchParams.get('format') ?? 'csv'

  if (format !== 'csv') {
    return Response.json({ error: 'Formato no soportado. Use format=csv' }, { status: 400 })
  }

  const [{ summaries: allSummaries }, kpis] = await Promise.all([listEmbarques(), getExecutiveKPIs()])
  const summaries = allSummaries.filter(s => s.totalItems > 0)

  // Helpers
  const esc = (v: unknown): string => {
    if (v == null) return ''
    const s = String(v)
    // RFC 4180: si tiene coma, quotes, o newline, envolver en quotes y duplicar quotes internas
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const row = (cells: unknown[]): string => cells.map(esc).join(',') + '\n'

  // ─── KPIs ─────────────────────────────────────────────────────────────────
  let csv = ''
  csv += `Bidcom Agro - Panel de Compras - Tablero ejecutivo\n`
  csv += `Generado,${new Date().toISOString()}\n`
  csv += `\n`

  csv += row(['Métrica', 'Valor', 'Detalle'])
  csv += row(['FOB en tránsito (USD)',  kpis.valorEnTransitoUSD,       `${kpis.cbmEnTransito.toFixed(2)} CBM`])
  csv += row(['Embarques activos',      kpis.embarquesActivos,         'pendiente + en tránsito'])
  csv += row(['Próximos 7 días',        kpis.proximosArribos7d,        'ETA en los próximos 7 días'])
  csv += row(['Retrasados',             kpis.embarquesRetrasados,      'ETA pasada hace +5 días'])
  csv += row(['Tránsito promedio (d)',  kpis.tiempoMedioTransitoDias,  'ETD → depósito (global)'])
  csv += row(['Tránsito promedio AIR (d)', kpis.tiempoMedioAirDias,    'ETD → depósito (AIR)'])
  csv += row(['Tránsito promedio FCL (d)', kpis.tiempoMedioFclDias,    'ETD → depósito (FCL/LCL)'])
  csv += row(['SLA Global (%)',         kpis.slaCumplimientoGlobal,    'ponderado por tipo'])
  csv += row(['SLA AIR (%)',            kpis.slaAir,                   '≤ 30 días'])
  csv += row(['SLA FCL (%)',            kpis.slaFcl,                   '≤ 65 días'])
  csv += row(['Lead time pago (d)',     kpis.leadTimePagoArriboDias,   'pago → depósito'])
  csv += row(['Anticipación Comex (d)', kpis.anticipacionComexDias,    'instrucción → ETD'])
  csv += row(['Demora vs plan (%)',     kpis.pctDemoraVsPlan,          'llegaron después de ETA'])
  csv += row(['Unidades del mes',       kpis.unidadesArribadasMes,     'arribadas al depósito'])
  csv += `\n`

  // ─── Días entre etapas ────────────────────────────────────────────────────
  csv += row(['Etapa', 'Días promedio', 'Muestras (N)'])
  for (const e of kpis.diasEntreEtapas) {
    csv += row([e.etapa, e.dias, e.n])
  }
  csv += `\n`

  // ─── Embarques por mes ────────────────────────────────────────────────────
  csv += row(['Mes', 'Embarques'])
  for (const e of kpis.embarquesPorMes) {
    csv += row([e.month, e.count])
  }
  csv += `\n`

  // ─── Tabla de embarques activos ───────────────────────────────────────────
  csv += row(['N° Embarque', 'Estado', 'ETD', 'ETA', 'AWB', 'SOs', 'Unidades', 'CBM'])
  for (const s of summaries) {
    csv += row([
      s.embarqueNo,
      s.estado,
      s.etd ?? '',
      s.eta ?? '',
      s.awb ?? '',
      s.sos.join(' | '),
      s.totalQty,
      s.totalCbm.toFixed(2),
    ])
  }

  const filename = `bidcom-tablero-ejecutivo-${new Date().toISOString().slice(0, 10)}.csv`

  // ﻿ (BOM) hace que Excel detecte UTF-8 automáticamente y no rompa
  // los acentos en columnas como "Días promedio" o "Tránsito".
  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
