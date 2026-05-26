'use server'

import { prisma } from '@/lib/prisma'
import { listEmbarques, type EmbarqueSummary } from '@/app/lib/embarques'

export type ExecutiveKPIs = {
  valorEnTransitoUSD: number
  embarquesActivos: number
  unidadesArribadasMes: number
  slaCumplimiento: number
  topProveedores: { name: string; valorUSD: number }[]
  embarquesPorMes: { month: string; count: number }[]
  discrepanciasPorMes: { month: string; pctConDiff: number }[]
  tipoCargaDist: { name: string; value: number }[]
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function parseDateLoose(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const iso = new Date(raw)
  if (!isNaN(iso.getTime())) return iso
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    const dd = parseInt(m[1], 10)
    const mm = parseInt(m[2], 10) - 1
    let yyyy = parseInt(m[3], 10)
    if (yyyy < 100) yyyy += 2000
    const d = new Date(yyyy, mm, dd)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

export async function getExecutiveKPIs(): Promise<ExecutiveKPIs> {
  const { summaries } = await listEmbarques()

  const activeEmbarques = summaries.filter(s => s.estado === 'pendiente' || s.estado === 'en-transito')
  const activeSOs = new Set<string>()
  for (const s of activeEmbarques) for (const so of s.sos) activeSOs.add(so)

  const activeItems = await prisma.compraSOItem.findMany({
    where: { soNumber: { in: Array.from(activeSOs) } },
    select: { fobTotal: true },
  })
  const valorEnTransitoUSD = activeItems.reduce((s, i) => s + (i.fobTotal ?? 0), 0)

  const now = new Date()
  const thisMonth = monthKey(now)
  let unidadesArribadasMes = 0
  for (const s of summaries) {
    if (s.estado !== 'arribado') continue
    const eta = parseDateLoose(s.eta)
    if (eta && monthKey(eta) === thisMonth) unidadesArribadasMes += s.totalQty
  }

  const arribados = summaries.filter(s => s.estado === 'arribado')
  let slaOk = 0
  let slaTotal = 0
  for (const s of arribados) {
    const etd = parseDateLoose(s.etd)
    const eta = parseDateLoose(s.eta)
    if (!etd || !eta) continue
    slaTotal++
    const dias = Math.round((eta.getTime() - etd.getTime()) / (1000 * 60 * 60 * 24))
    if (dias >= 0 && dias <= 21) slaOk++
  }
  const slaCumplimiento = slaTotal === 0 ? 0 : Math.round((slaOk / slaTotal) * 100)

  const byProveedor = new Map<string, number>()
  const allFobItems = await prisma.compraSOItem.findMany({
    select: { fobTotal: true, compra: { select: { supplierName: true } } },
  })
  for (const i of allFobItems) {
    const name = i.compra.supplierName ?? 'Sin proveedor'
    byProveedor.set(name, (byProveedor.get(name) ?? 0) + (i.fobTotal ?? 0))
  }
  const topProveedores = Array.from(byProveedor.entries())
    .map(([name, valorUSD]) => ({ name, valorUSD }))
    .sort((a, b) => b.valorUSD - a.valorUSD)
    .slice(0, 5)

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

  const tipoCarga = await prisma.cIPLItem.groupBy({
    by: ['tipoCarga'],
    _count: { _all: true },
  })
  const tipoCargaDist = tipoCarga.map(t => ({ name: t.tipoCarga, value: t._count._all }))

  return {
    valorEnTransitoUSD,
    embarquesActivos: activeEmbarques.length,
    unidadesArribadasMes,
    slaCumplimiento,
    topProveedores,
    embarquesPorMes,
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
  const alerts: AlertItem[] = []
  const now = new Date()

  for (const s of summaries.slice(0, 30)) {
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
