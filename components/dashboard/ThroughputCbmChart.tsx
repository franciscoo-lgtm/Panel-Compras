'use client'

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

type Datum = { month: string; cbm: number }

function shortMonth(month: string): string {
  const [y, m] = month.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1, 1)
  return date.toLocaleDateString('es-AR', { month: 'short' })
}

type TooltipProps = {
  active?: boolean
  payload?: Array<{ payload: Datum & { label: string } }>
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: '#0d0d0d',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 6,
      padding: '8px 10px',
      fontSize: 11,
      color: '#a1a1aa',
    }}>
      <p style={{ fontWeight: 600, color: '#fff' }}>{d.label}</p>
      <p>{d.cbm.toFixed(2)} m³ arribados</p>
    </div>
  )
}

export function ThroughputCbmChart({ data }: { data: Datum[] }) {
  const fmt = data.map(d => ({ ...d, label: shortMonth(d.month) }))
  if (fmt.every(d => d.cbm === 0)) {
    return <p className="text-[11px] text-zinc-500 text-center py-10">Sin arribos a depósito en los últimos 12 meses</p>
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={fmt} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
        <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit=" m³" />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59,130,246,0.06)' }} />
        <Bar dataKey="cbm" fill="#3b82f6" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
