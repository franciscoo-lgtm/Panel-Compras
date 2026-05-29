'use server'

import { prisma } from '@/lib/prisma'
import { listEmbarques, type EmbarqueSummary } from '@/app/lib/embarques'
import { parseDateLoose } from '@/app/lib/comex-internals'
import { fetchComexData } from '@/app/lib/comex'

export type ExecutiveKPIs = {
  // KPIs principales (4 cards)
  valorEnTransitoUSD:     number
  embarquesActivos:       number
  proximosArribos7d:      number
  embarquesRetrasados:    number

  // KPIs secundarios (más cards)
  tiempoMedioTransitoDias:    number     // ETD → Arribo Depósito real (sobre arribados)
  slaCumplimiento:            number     // % arribados ≤ 30 días tránsito
  unidadesArribadasMes:       number
  cbmEnTransito:              number
  leadTimePagoArriboDias:     number     // fechaPago → Arribo Depósito
  pctDemoraVsPlan:            number     // % arribados después de ETA original
  anticipacionComexDias:      number     // Instrucción Category → ETD promedio

  // Charts
  embarquesPorMes:        { month: string; count: number }[]
  proximosArribos:        { semana: string; count: number; embarques: string[] }[]
  discrepanciasPorMes:    { month: string; pctConDiff: number }[]
  tipoCargaDist:          { name: string; value: number }[]
  diasEntreEtapas:        { etapa: string; dias: number; n: number }[]
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

  const activeItems = activeSOs.size > 0
    ? await prisma.compraSOItem.findMany({
        where: { soNumber: { in: Array.from(activeSOs) } },
        select: { fobTotal: true },
      })
    : []
  const valorEnTransitoUSD = activeItems.reduce((s, i) => s + (i.fobTotal ?? 0), 0)
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
  const tiempos: number[] = []           // ETD → arribo depósito (días)
  let slaOk = 0, slaTotal = 0
  const demoraVsPlan: number[] = []      // (arriboDeposito - ETA original) > 0 → demora
  for (const s of arribados) {
    const ship = shipmentFor(s)
    if (!ship) continue
    const etd = parseDateLoose(s.etd)
    const eta = parseDateLoose(s.eta)
    const arribo = parseDateLoose(pickFromExtras(ship.extras, 'deposito', 'depósito'))
    if (!arribo) continue
    if (etd) {
      const dias = diffDays(etd, arribo)
      if (dias >= 0 && dias <= 120) {
        tiempos.push(dias)
        slaTotal++
        if (dias <= 30) slaOk++
      }
    }
    if (eta) {
      const dem = diffDays(eta, arribo)
      demoraVsPlan.push(dem > 0 ? 1 : 0)
    }
  }
  const tiempoMedioTransitoDias = mean(tiempos)
  const slaCumplimiento = slaTotal === 0 ? 0 : Math.round((slaOk / slaTotal) * 100)
  const pctDemoraVsPlan = demoraVsPlan.length === 0
    ? 0
    : Math.round((demoraVsPlan.reduce((a, b) => a + b, 0) / demoraVsPlan.length) * 100)

  // ── Lead time pago → arribo depósito ──────────────────────────────────────
  // Necesitamos buscar la Compra de cada arribado y su fechaPago
  const arribadoSOs = new Set<string>()
  for (const s of arribados) for (const so of s.sos) arribadoSOs.add(so)

  const fechasPago: Record<string, Date | null> = {}    // soNumber → fechaPago
  if (arribadoSOs.size > 0) {
    const compraSOItems = await prisma.compraSOItem.findMany({
      where: { soNumber: { in: Array.from(arribadoSOs) } },
      select: { soNumber: true, compra: { select: { fechaPago: true, fechaInstruccionCat: true, fechaLMS: true } } },
    })
    for (const x of compraSOItems) {
      fechasPago[x.soNumber] = x.compra.fechaPago ?? null
    }
  }
  // Para cada arribado, fechaPago = la más temprana entre las compras de sus SOs
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
  // Necesitamos fechas de Instrucción Category de las compras
  const fechasInstr: Record<string, Date | null> = {}
  if (arribadoSOs.size > 0 || summaries.length > 0) {
    const allSOs = new Set<string>()
    for (const s of summaries) for (const so of s.sos) allSOs.add(so)
    if (allSOs.size > 0) {
      const compraSOItems = await prisma.compraSOItem.findMany({
        where: { soNumber: { in: Array.from(allSOs) } },
        select: { soNumber: true, compra: { select: { fechaInstruccionCat: true, fechaLMS: true } } },
      })
      for (const x of compraSOItems) {
        fechasInstr[x.soNumber] = x.compra.fechaInstruccionCat ?? null
      }
    }
  }
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

  // ── Días entre etapas (promedios por step) ────────────────────────────────
  // Para cada embarque con fechas de cada etapa, calculamos diferencias
  const fechasLMS: Record<string, Date | null> = {}
  for (const s of summaries) {
    for (const so of s.sos) {
      if (so in fechasLMS) continue
      // Ya cargamos fechasInstr arriba, agregamos fechaLMS también
    }
  }
  // Re-fetch para LMS (lo hacemos junto)
  const allSOsForStages = new Set<string>()
  for (const s of summaries) for (const so of s.sos) allSOsForStages.add(so)
  if (allSOsForStages.size > 0) {
    const compraSOItems = await prisma.compraSOItem.findMany({
      where: { soNumber: { in: Array.from(allSOsForStages) } },
      select: { soNumber: true, compra: { select: { fechaLMS: true } } },
    })
    for (const x of compraSOItems) {
      fechasLMS[x.soNumber] = x.compra.fechaLMS ?? null
    }
  }

  // Por cada embarque, recolectamos las 6 fechas de etapas
  const stageDiffs: Record<string, number[]> = {
    'Instr → LMS':       [],
    'LMS → ETD':         [],
    'ETD → ETA':         [],
    'ETA → Aduana':      [],
    'Aduana → Depósito': [],
  }
  for (const s of summaries) {
    const ship = shipmentFor(s)
    let instr: Date | null = null
    let lms: Date | null = null
    for (const so of s.sos) {
      const i = fechasInstr[so]
      if (i && (!instr || i < instr)) instr = i
      const l = fechasLMS[so]
      if (l && (!lms || l < lms)) lms = l
    }
    const etd = parseDateLoose(s.etd)
    const eta = parseDateLoose(s.eta)
    const aduana = ship ? parseDateLoose(pickFromExtras(ship.extras, 'aduana')) : null
    const deposito = ship ? parseDateLoose(pickFromExtras(ship.extras, 'deposito', 'depósito')) : null

    const checkAdd = (key: string, a: Date | null, b: Date | null) => {
      if (!a || !b) return
      const d = diffDays(a, b)
      if (d >= 0 && d <= 120) stageDiffs[key]!.push(d)
    }
    checkAdd('Instr → LMS',       instr,    lms)
    checkAdd('LMS → ETD',         lms,      etd)
    checkAdd('ETD → ETA',         etd,      eta)
    checkAdd('ETA → Aduana',      eta,      aduana)
    checkAdd('Aduana → Depósito', aduana,   deposito)
  }
  const diasEntreEtapas = Object.entries(stageDiffs).map(([etapa, arr]) => ({
    etapa,
    dias: mean(arr),
    n: arr.length,
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
    slaCumplimiento,
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

  for (const s of filtered.slice(0, 50)) {
    const eta = parseDateLoose(s.eta)
    if (!eta) continue
    const days = Math.round((eta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (s.estado === 'en-transito' && days >= 0 && days <= 7) {
      alerts.push({ kind: 'info', text: `${s.embarqueNo} llega en ${days} día${days === 1 ? '' : 's'}`, href: `/embarques/${encodeURIComponent(s.embarqueNo)}` })
    } else if (s.estado === 'en-transito' && days < 0) {
      alerts.push({ kind: 'critical', text: `${s.embarqueNo} ETA pasada hace ${-days} días sin arribo`, href: `/embarques/${encodeURIComponent(s.embarqueNo)}` })
    }
  }

  const itemsSinFoto = await prisma.cIPLItem.count({ where: { photos: { none: {} } } })
  if (itemsSinFoto > 0) {
    alerts.push({ kind: 'warn', text: `${itemsSinFoto} ítems sin foto cargada`, href: '/comercial' })
  }

  return alerts
}
