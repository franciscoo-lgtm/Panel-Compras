'use server'

import { prisma } from '@/lib/prisma'
import { listEmbarques, type EmbarqueSummary } from '@/app/lib/embarques'
import { parseDateLoose } from '@/app/lib/comex-internals'

export type ExecutiveKPIs = {
  // KPIs principales (las 4 cards)
  valorEnTransitoUSD:     number    // FOB de SOs en embarques activos
  embarquesActivos:       number    // pendiente + en-transito (solo con CIPLs)
  proximosArribos7d:      number    // ETA en los próximos 7 días
  embarquesRetrasados:    number    // ETA pasada hace > 5 días sin arribo

  // Métricas secundarias (textuales o pequeñas)
  tiempoMedioTransitoDias:   number     // promedio ETD→ETA en días (sobre arribados)
  unidadesArribadasMes:      number
  slaCumplimiento:           number     // % arribados ≤ 21 días tránsito
  cbmEnTransito:             number     // CBM total en embarques activos

  // Charts
  embarquesPorMes:        { month: string; count: number }[]
  proximosArribos:        { semana: string; count: number; embarques: string[] }[]   // 4 semanas
  discrepanciasPorMes:    { month: string; pctConDiff: number }[]
  tipoCargaDist:          { name: string; value: number }[]
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)   // semana empieza lunes
  return new Date(d.getFullYear(), d.getMonth(), diff)
}

function fmtWeekLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function getExecutiveKPIs(): Promise<ExecutiveKPIs> {
  const { summaries: allSummaries } = await listEmbarques()
  // SOLO embarques con CIPL cargado — mismo criterio que /embarques default
  const summaries = allSummaries.filter(s => s.totalItems > 0)

  const now = new Date()
  const thisMonth = monthKey(now)

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

  // ── Próximos arribos (7 días) y retrasados ────────────────────────────────
  let proximosArribos7d = 0
  let embarquesRetrasados = 0
  for (const s of summaries) {
    if (s.estado === 'arribado') continue
    const eta = parseDateLoose(s.eta)
    if (!eta) continue
    const days = Math.round((eta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (days >= 0 && days <= 7) proximosArribos7d++
    if (days < -5) embarquesRetrasados++
  }

  // ── Tiempo medio de tránsito (ETD→ETA, arribados) ─────────────────────────
  const arribados = summaries.filter(s => s.estado === 'arribado')
  const tiempos: number[] = []
  let slaOk = 0, slaTotal = 0
  for (const s of arribados) {
    const etd = parseDateLoose(s.etd)
    const eta = parseDateLoose(s.eta)
    if (!etd || !eta) continue
    const dias = Math.round((eta.getTime() - etd.getTime()) / (1000 * 60 * 60 * 24))
    if (dias >= 0 && dias <= 60) {
      tiempos.push(dias)
      slaTotal++
      if (dias <= 21) slaOk++
    }
  }
  const tiempoMedioTransitoDias = tiempos.length === 0
    ? 0
    : Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length)
  const slaCumplimiento = slaTotal === 0 ? 0 : Math.round((slaOk / slaTotal) * 100)

  // ── Unidades arribadas este mes ───────────────────────────────────────────
  let unidadesArribadasMes = 0
  for (const s of summaries) {
    if (s.estado !== 'arribado') continue
    const eta = parseDateLoose(s.eta)
    if (eta && monthKey(eta) === thisMonth) unidadesArribadasMes += s.totalQty
  }

  // ── Embarques por mes (últimos 12) ────────────────────────────────────────
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

  // ── Próximos arribos por semana (próximas 4) ──────────────────────────────
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
    const days = Math.round((eta.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
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
  // Restringimos solo a los items de embarques visibles (= con CIPLs cargados,
  // que ya es la base de la query general)
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
    unidadesArribadasMes,
    slaCumplimiento,
    cbmEnTransito,
    embarquesPorMes,
    proximosArribos,
    discrepanciasPorMes,
    tipoCargaDist,
  }
}

export type AlertItem = {
  kind: 'critical' | 'warn' | 'info'
  text: string
  href?: string
}

export async function getAlerts(summaries: EmbarqueSummary[]): Promise<AlertItem[]> {
  // Solo embarques con CIPLs cargados (mismo criterio que /embarques)
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
