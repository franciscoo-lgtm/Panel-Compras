'use client'

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

type Datum = { month: string; count: number }

function shortMonth(month: string): string {
  const [y, m] = month.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1, 1)
  return date.toLocaleDateString('es-AR', { month: 'short' })
}

export function EmbarquesPorMesChart({ data }: { data: Datum[] }) {
  const fmt = data.map(d => ({ ...d, label: shortMonth(d.month) }))
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={fmt} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: '#a1a1aa' }}
          cursor={{ fill: 'rgba(49,175,79,0.08)' }}
        />
        <Bar dataKey="count" fill="#31AF4F" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
