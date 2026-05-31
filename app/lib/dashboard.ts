'use server'

import { prisma } from '@/lib/prisma'
import { listEmbarques, type EmbarqueSummary } from '@/app/lib/embarques'
import { parseDateLoose, detectTipoTransporte, slaThresholdDays } from '@/app/lib/comex-internals'
import { fetchComexData } from '@/app/lib/comex'
import { getMilestonesConfig } from '@/app/lib/milestones-config'
import { getMilestoneDateForEmbarque } from '@/app/lib/milestones-compute'
import type { ComexSORow } from '@/app/lib/comex-data-types'
import type { DashboardSegment } from '@/app/lib/dashboard-types'

export type ExecutiveKPIs = {
  // KPIs principales (4 cards)
  valorEnTransitoUSD:     number
  embarquesActivos:       number
  proximosArribos7d:      number
  embarquesRetrasados:    number

  // KPIs secundarios (más cards)
  tiempoMedioTransitoDias:    number     // ETD → Arribo Depósito (todos)
  tiempoMedioAirDias:         number     // ETD → Arribo Depósito (solo AIR)
  tiempoMedioFclDias:         number     // ETD → Arribo Depósito (solo FCL)
  slaCumplimientoGlobal:      number     // % global (threshold por tipo)
  slaAir:                     number     // % AIR ≤ 30 días
  slaFcl:                     number     // % FCL ≤ 65 días
  unidadesArribadasMes:       number
  cbmEnTransito:              number
  leadTimePagoArriboDias:     number
  pctDemoraVsPlan:            number
  anticipacionComexDias:      number

  // Charts
  embarquesPorMes:        { month: string; count: number }[]
  proximosArribos:        { semana: string; count: number; embarques: string[] }[]
  discrepanciasPorMes:    { month: string; pctConDiff: number }[]
  tipoCargaDist:          { name: string; value: number }[]
  diasEntreEtapas:        { etapa: string; dias: number; n: number }[]
  // Mismo dato que diasEntreEtapas pero segmentado por (tipoCarga, transporte).
  // El client tiene un selector para elegir qué segmento mostrar.
  diasEntreEtapasPorSegmento: Record<DashboardSegment, { etapa: string; dias: number; n: number }[]>
  throughputCbmPorMes:    { month: string; cbm: number }[]
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.getFullYear(), d.getMonth(), diff)
}

function fmtWeekLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
}

/**
 * Busca un campo en los extras del shipment usando substring lookup.
 * Útil cuando los keys son nombres como 'fechaArriboDeposito' o 'arriboWh'.
 */
function pickFromExtras(extras: Record<string, string | null>, ...candidates: string[]): string | null {
  for (const key of Object.keys(extras)) {
    const lower = key.toLowerCase()
    if (candidates.some(c => lower.includes(c))) {
      const v = extras[key]
      if (v) return v
    }
  }
  return null
}

export async function getExecutiveKPIs(): Promise<ExecutiveKPIs> {
  const { summaries: allSummaries } = await listEmbarques()
  const summaries = allSummaries.filter(s => s.totalItems > 0)

  const now = new Date()
  const thisMonth = monthKey(now)

  // ── Datos crudos de Comex (para pickear arribo depósito, aduana, etc.) ────
  const comexData = await fetchComexData()
  // Para cada embarque, mapear shipment del SO principal (usamos el primero)
  function shipmentFor(s: EmbarqueSummary): { extras: Record<string, string | null> } | null {
    for (const so of s.sos) {
      const row = comexData.bySO.get(so.toUpperCase())
      if (!row) continue
      const ship = row.shipments.find(sh => sh.embarqueNo.toUpperCase() === s.embarqueNo.toUpperCase())
      if (ship) return ship
    }
    return null
  }

  // ── Activos / FOB / CBM ────────────────────────────────────────────────────
  const activeEmbarques = summaries.filter(s => s.estado === 'pendiente' || s.estado === 'en-transito')
  const activeSOs = new Set<string>()
  for (const s of activeEmbarques) for (const so of s.sos) activeSOs.add(so)

  // ── Single query: TODAS las SOs que aparecen en summaries ──────────────────
  // Antes hacíamos 4 queries separadas a compraSOItem (activos, arribados,
  // anticipación, lms). Ahora una sola con todos los fields que se necesitan
  // y filtramos en memoria.
  const allSummariesSOs = new Set<string>()
  for (const s of summaries) for (const so of s.sos) allSummariesSOs.add(so)

  const compraItems = allSummariesSOs.size > 0
    ? await prisma.compraSOItem.findMany({
        where: { soNumber: { in: Array.from(allSummariesSOs) } },
        select: {
          soNumber: true,
          fobTotal: true,
          compra: { select: { fechaPago: true, fechaInstruccionCat: true, fechaLMS: true } },
        },
      })
    : []

  const fobBySO = new Map<string, number>()              // soNumber → fobTotal (activos)
  const fechasPago: Record<string, Date | null> = {}     // soNumber → fechaPago
  const fechasInstr: Record<string, Date | null> = {}    // soNumber → fechaInstruccionCat
  const fechasLMS: Record<string, Date | null> = {}      // soNumber → fechaLMS
  for (const ci of compraItems) {
    if (ci.fobTotal != null && activeSOs.has(ci.soNumber)) {
      fobBySO.set(ci.soNumber, (fobBySO.get(ci.soNumber) ?? 0) + ci.fobTotal)
    }
    fechasPago[ci.soNumber]  = ci.compra.fechaPago           ?? fechasPago[ci.soNumber]  ?? null
    fechasInstr[ci.soNumber] = ci.compra.fechaInstruccionCat ?? fechasInstr[ci.soNumber] ?? null
    fechasLMS[ci.soNumber]   = ci.compra.fechaLMS            ?? fechasLMS[ci.soNumber]   ?? null
  }

  const valorEnTransitoUSD = Array.from(fobBySO.values()).reduce((s, v) => s + v, 0)
  const cbmEnTransito = activeEmbarques.reduce((s, e) => s + e.totalCbm, 0)

  // ── Próximos / Retrasados ──────────────────────────────────────────────────
  let proximosArribos7d = 0
  let embarquesRetrasados = 0
  for (const s of summaries) {
    if (s.estado === 'arribado') continue
    const eta = parseDateLoose(s.eta)
    if (!eta) continue
    const days = diffDays(now, eta)
    if (days >= 0 && days <= 7) proximosArribos7d++
    if (days < -5) embarquesRetrasados++
  }

  // ── Arribados con fechas relevantes ────────────────────────────────────────
  const arribados = summaries.filter(s => s.estado === 'arribado')
  const tiempos: number[] = []           // ETD → arribo depósito (días, todos)
  const tiemposAir: number[] = []
  const tiemposFcl: number[] = []
  let slaOk = 0, slaTotal = 0            // global
  let slaAirOk = 0, slaAirTot = 0
  let slaFclOk = 0, slaFclTot = 0
  const demoraVsPlan: number[] = []
  for (const s of arribados) {
    const ship = shipmentFor(s)
    if (!ship) continue
    const etd = parseDateLoose(s.etd)
    const eta = parseDateLoose(s.eta)
    const arribo = parseDateLoose(pickFromExtras(ship.extras, 'deposito', 'depósito'))
    if (!arribo) continue
    const tipo = detectTipoTransporte(s.embarqueNo)
    const threshold = slaThresholdDays(tipo)
    if (etd) {
      const dias = diffDays(etd, arribo)
      if (dias >= 0 && dias <= 150) {
        tiempos.push(dias)
        if (tipo === 'AIR') tiemposAir.push(dias)
        if (tipo === 'FCL' || tipo === 'LCL') tiemposFcl.push(dias)
        slaTotal++
        if (dias <= threshold) slaOk++
        if (tipo === 'AIR') {
          slaAirTot++
          if (dias <= 30) slaAirOk++
        }
        if (tipo === 'FCL' || tipo === 'LCL') {
          slaFclTot++
          if (dias <= 65) slaFclOk++
        }
      }
    }
    if (eta) {
      const dem = diffDays(eta, arribo)
      demoraVsPlan.push(dem > 0 ? 1 : 0)
    }
  }
  const tiempoMedioTransitoDias = mean(tiempos)
  const tiempoMedioAirDias = mean(tiemposAir)
  const tiempoMedioFclDias = mean(tiemposFcl)
  const slaCumplimientoGlobal = slaTotal === 0 ? 0 : Math.round((slaOk / slaTotal) * 100)
  const slaAir = slaAirTot === 0 ? 0 : Math.round((slaAirOk / slaAirTot) * 100)
  const slaFcl = slaFclTot === 0 ? 0 : Math.round((slaFclOk / slaFclTot) * 100)
  const pctDemoraVsPlan = demoraVsPlan.length === 0
    ? 0
    : Math.round((demoraVsPlan.reduce((a, b) => a + b, 0) / demoraVsPlan.length) * 100)

  // ── Lead time pago → arribo depósito ──────────────────────────────────────
  // Las fechas ya están en fechasPago (cargadas arriba en la query única).
  // Para cada arribado, fechaPago = la más temprana entre las compras de sus SOs.
  const leadTimes: number[] = []
  for (const s of arribados) {
    const ship = shipmentFor(s)
    if (!ship) continue
    const arribo = parseDateLoose(pickFromExtras(ship.extras, 'deposito', 'depósito'))
    if (!arribo) continue
    let pago: Date | null = null
    for (const so of s.sos) {
      const p = fechasPago[so]
      if (!p) continue
      if (!pago || p < pago) pago = p
    }
    if (!pago) continue
    const d = diffDays(pago, arribo)
    if (d >= 0 && d <= 365) leadTimes.push(d)
  }
  const leadTimePagoArriboDias = mean(leadTimes)

  // ── Anticipación Comex (Instrucción Category → ETD) ───────────────────────
  // fechasInstr ya está cargada en la query única de arriba.
  const anticipaciones: number[] = []
  for (const s of summaries) {
    const etd = parseDateLoose(s.etd)
    if (!etd) continue
    let instr: Date | null = null
    for (const so of s.sos) {
      const i = fechasInstr[so]
      if (!i) continue
      if (!instr || i < instr) instr = i
    }
    if (!instr) continue
    const d = diffDays(instr, etd)
    if (d >= 0 && d <= 180) anticipaciones.push(d)
  }
  const anticipacionComexDias = mean(anticipaciones)

  // ── Días entre etapas (dinámico desde hitos configurables) ────────────────
  // Antes eran 5 etapas hardcodeadas. Ahora se leen de getMilestonesConfig() →
  // si el user agrega un hito custom en /configuracion/hitos, aparece como
  // etapa nueva acá automáticamente. Los hitos manuales completados a mano
  // (fechaInstruccionCat, fechaLMS, custom, etc) ya se incluyen.
  const milestonesConfig = await getMilestonesConfig()
  const stageMilestones = milestonesConfig.filter(m =>
    // Excluimos 'auto' (fechaOrden + plCargado) porque marcan eventos del
    // panel, no etapas del proceso operativo. El resto sí.
    m.source !== 'auto'
  )

  // Necesitamos las Compras completas (con todas sus fechas) por embarque
  // para que getMilestoneDateForEmbarque pueda resolver hitos custom.
  const allSummariesSOsArr = Array.from(allSummariesSOs)
  const comprasWithFechas = allSummariesSOsArr.length > 0
    ? await prisma.compra.findMany({
        where: { sos: { some: { soNumber: { in: allSummariesSOsArr } } } },
        select: {
          id: true,
          fechaOrden:           true,
          fechaEnvio:           true,
          fechaPago:            true,
          fechaSegundaValPA:    true,
          fechaInstruccionCat:  true,
          fechaLMS:             true,
          sos: { select: { soNumber: true } },
        },
      })
    : []

  // Index: soNumber → Compras vinculadas
  const comprasBySO = new Map<string, typeof comprasWithFechas>()
  for (const c of comprasWithFechas) {
    for (const so of c.sos) {
      const key = so.soNumber.toUpperCase()
      const list = comprasBySO.get(key) ?? []
      list.push(c)
      comprasBySO.set(key, list)
    }
  }

  // bySO record para getMilestoneDateForEmbarque (formato esperado por la lib)
  const bySORecordForMilestones: Record<string, ComexSORow> = {}
  for (const [so, row] of comexData.bySO) {
    bySORecordForMilestones[so] = row
  }

  // Buckets por segmento. Cada bucket guarda los días entre etapas
  // SOLO de embarques que entran en ese segmento. 'todos' incluye
  // todos los embarques.
  const SEGMENTS: DashboardSegment[] = [
    'todos', 'repuesto',
    'mercaderia-air', 'mercaderia-barco', 'mixto',
  ]

  type StageBuckets = Record<string, number[]>
  const segBuckets: Record<DashboardSegment, StageBuckets> = {} as Record<DashboardSegment, StageBuckets>
  for (const seg of SEGMENTS) {
    segBuckets[seg] = {}
    for (let i = 0; i < stageMilestones.length - 1; i++) {
      const from = stageMilestones[i]!
      const to   = stageMilestones[i + 1]!
      segBuckets[seg][`${from.label} → ${to.label}`] = []
    }
  }

  // Clasifica un embarque en su segmento. 'sin-datos' va solo a 'todos'.
  function classifyEmbarque(s: EmbarqueSummary): DashboardSegment[] {
    const segments: DashboardSegment[] = ['todos']
    const tipo = detectTipoTransporte(s.embarqueNo)
    const isAir = tipo === 'AIR'
    const isBarco = tipo === 'FCL' || tipo === 'LCL'

    // Repuesto: el transporte se ignora (siempre va por avión en la práctica).
    if (s.tipoCarga === 'Repuesto') {
      segments.push('repuesto')
    } else if (s.tipoCarga === 'Mercaderia') {
      if (isAir)   segments.push('mercaderia-air')
      if (isBarco) segments.push('mercaderia-barco')
    } else if (s.tipoCarga === 'Mixto') {
      segments.push('mixto')
    }
    // Silencio el lint warning si tipo no se usa para Repuesto
    void isAir
    void isBarco
    return segments
  }

  for (const s of summaries) {
    // Compras del embarque (dedupedas por id)
    const seen = new Set<string>()
    const comprasDelEmbarque: typeof comprasWithFechas = []
    for (const so of s.sos) {
      for (const c of comprasBySO.get(so.toUpperCase()) ?? []) {
        if (!seen.has(c.id)) {
          seen.add(c.id)
          comprasDelEmbarque.push(c)
        }
      }
    }
    const firstCiplCreatedAt = null

    // Fecha de cada hito para este embarque
    const datesByMilestoneKey = new Map<string, Date>()
    for (const m of stageMilestones) {
      const iso = getMilestoneDateForEmbarque(m, comprasDelEmbarque, firstCiplCreatedAt, s.sos, bySORecordForMilestones)
      const d = iso ? parseDateLoose(iso) : null
      if (d) datesByMilestoneKey.set(m.key, d)
    }

    const segments = classifyEmbarque(s)

    // Transiciones consecutivas → agregar a TODOS los buckets aplicables
    for (let i = 0; i < stageMilestones.length - 1; i++) {
      const from = stageMilestones[i]!
      const to   = stageMilestones[i + 1]!
      const dateFrom = datesByMilestoneKey.get(from.key)
      const dateTo   = datesByMilestoneKey.get(to.key)
      if (!dateFrom || !dateTo) continue
      const d = diffDays(dateFrom, dateTo)
      if (d < 0 || d > 120) continue
      const key = `${from.label} → ${to.label}`
      for (const seg of segments) {
        segBuckets[seg][key]!.push(d)
      }
    }
  }

  // Materializar cada segmento a su shape final
  const diasEntreEtapasPorSegmento = {} as Record<DashboardSegment, { etapa: string; dias: number; n: number }[]>
  for (const seg of SEGMENTS) {
    diasEntreEtapasPorSegmento[seg] = Object.entries(segBuckets[seg]).map(([etapa, arr]) => ({
      etapa,
      dias: mean(arr),
      n: arr.length,
    }))
  }

  // diasEntreEtapas global (compat retro con el shape actual)
  const diasEntreEtapas = diasEntreEtapasPorSegmento.todos.map(d => ({
    etapa: d.etapa,
    dias: d.dias,
    n: d.n,
  }))

  // ── Throughput CBM/mes (últimos 12) ───────────────────────────────────────
  const throughputByMonth = new Map<string, number>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    throughputByMonth.set(monthKey(d), 0)
  }
  for (const s of arribados) {
    const ship = shipmentFor(s)
    if (!ship) continue
    const arribo = parseDateLoose(pickFromExtras(ship.extras, 'deposito', 'depósito'))
    if (!arribo) continue
    const k = monthKey(arribo)
    if (throughputByMonth.has(k)) {
      throughputByMonth.set(k, (throughputByMonth.get(k) ?? 0) + s.totalCbm)
    }
  }
  const throughputCbmPorMes = Array.from(throughputByMonth.entries()).map(([month, cbm]) => ({
    month,
    cbm: +cbm.toFixed(2),
  }))

  // ── Unidades arribadas este mes ───────────────────────────────────────────
  let unidadesArribadasMes = 0
  for (const s of arribados) {
    const ship = shipmentFor(s)
    if (!ship) continue
    const arribo = parseDateLoose(pickFromExtras(ship.extras, 'deposito', 'depósito'))
    if (arribo && monthKey(arribo) === thisMonth) unidadesArribadasMes += s.totalQty
  }

  // ── Embarques por mes ─────────────────────────────────────────────────────
  const embByMonth = new Map<string, number>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    embByMonth.set(monthKey(d), 0)
  }
  for (const s of summaries) {
    const etd = parseDateLoose(s.etd)
    if (!etd) continue
    const k = monthKey(etd)
    if (embByMonth.has(k)) embByMonth.set(k, (embByMonth.get(k) ?? 0) + 1)
  }
  const embarquesPorMes = Array.from(embByMonth.entries()).map(([month, count]) => ({ month, count }))

  // ── Próximos arribos por semana (4) ───────────────────────────────────────
  const weekBuckets = new Map<string, { label: string; count: number; embarques: string[] }>()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  for (let i = 0; i < 4; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i * 7)
    const monday = startOfWeek(d)
    const key = monday.toISOString().slice(0, 10)
    weekBuckets.set(key, { label: fmtWeekLabel(monday), count: 0, embarques: [] })
  }
  for (const s of summaries) {
    if (s.estado === 'arribado') continue
    const eta = parseDateLoose(s.eta)
    if (!eta) continue
    const days = diffDays(today, eta)
    if (days < 0 || days > 28) continue
    const monday = startOfWeek(eta)
    const key = monday.toISOString().slice(0, 10)
    const bucket = weekBuckets.get(key)
    if (bucket) {
      bucket.count++
      if (bucket.embarques.length < 5) bucket.embarques.push(s.embarqueNo)
    }
  }
  const proximosArribos = Array.from(weekBuckets.entries()).map(([, b]) => ({
    semana: b.label,
    count: b.count,
    embarques: b.embarques,
  }))

  // ── Discrepancias por mes ─────────────────────────────────────────────────
  const discByMonth = new Map<string, { total: number; conDiff: number }>()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    discByMonth.set(monthKey(d), { total: 0, conDiff: 0 })
  }
  const recentItems = await prisma.cIPLItem.findMany({
    where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 6, 1) } },
    select: { createdAt: true, qty: true, qPi: true, controlManualQty: true },
  })
  for (const i of recentItems) {
    const k = monthKey(i.createdAt)
    const bucket = discByMonth.get(k)
    if (!bucket) continue
    bucket.total++
    const eq = i.controlManualQty ?? i.qty ?? 0
    if (i.qPi != null && eq !== i.qPi) bucket.conDiff++
  }
  const discrepanciasPorMes = Array.from(discByMonth.entries()).map(([month, b]) => ({
    month,
    pctConDiff: b.total === 0 ? 0 : Math.round((b.conDiff / b.total) * 100),
  }))

  // ── Tipo de carga ─────────────────────────────────────────────────────────
  const tipoCarga = await prisma.cIPLItem.groupBy({
    by: ['tipoCarga'],
    _count: { _all: true },
  })
  const tipoCargaDist = tipoCarga.map(t => ({ name: t.tipoCarga, value: t._count._all }))

  return {
    valorEnTransitoUSD,
    embarquesActivos: activeEmbarques.length,
    proximosArribos7d,
    embarquesRetrasados,
    tiempoMedioTransitoDias,
    tiempoMedioAirDias,
    tiempoMedioFclDias,
    slaCumplimientoGlobal,
    slaAir,
    slaFcl,
    unidadesArribadasMes,
    cbmEnTransito,
    leadTimePagoArriboDias,
    pctDemoraVsPlan,
    anticipacionComexDias,
    embarquesPorMes,
    proximosArribos,
    discrepanciasPorMes,
    tipoCargaDist,
    diasEntreEtapas,
    diasEntreEtapasPorSegmento,
    throughputCbmPorMes,
  }
}

export type AlertItem = {
  kind: 'critical' | 'warn' | 'info'
  text: string
  href?: string
}

export async function getAlerts(summaries: EmbarqueSummary[]): Promise<AlertItem[]> {
  const filtered = summaries.filter(s => s.totalItems > 0)
  const alerts: AlertItem[] = []
  const now = new Date()

  // Antes había un .slice(0, 50) silencioso. Ahora recorremos todos los
  // embarques con CIPL — el filtro previo a lugar (estado en-tránsito + ETA
  // existente) ya limita el ruido. El UI del home muestra los primeros N y
  // tiene "Ver todas" si hace falta.
  for (const s of filtered) {
    const eta = parseDateLoose(s.eta)
    if (!eta) continue
    const days = Math.round((eta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (s.estado === 'en-transito' && days >= 0 && days <= 7) {
      alerts.push({ kind: 'info', text: `${s.embarqueNo} llega en ${days} día${days === 1 ? '' : 's'}`, href: `/embarques/${encodeURIComponent(s.embarqueNo)}` })
    } else if (s.estado === 'en-transito' && days < 0) {
      alerts.push({ kind: 'critical', text: `${s.embarqueNo} ETA pasada hace ${-days} días sin arribo`, href: `/embarques/${encodeURIComponent(s.embarqueNo)}` })
    }
  }

  // Solo alertamos por fotos faltantes en Repuestos — Mercadería no usa
  // fotos de inspección en el flujo actual.
  const itemsSinFoto = await prisma.cIPLItem.count({
    where: { tipoCarga: 'Repuesto', photos: { none: {} } },
  })
  if (itemsSinFoto > 0) {
    alerts.push({ kind: 'warn', text: `${itemsSinFoto} ítems de Repuesto sin foto cargada`, href: '/comercial' })
  }

  // Sort: críticas primero, después warn, después info
  const KIND_PRIORITY: Record<AlertItem['kind'], number> = { critical: 0, warn: 1, info: 2 }
  alerts.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind])

  return alerts
}
