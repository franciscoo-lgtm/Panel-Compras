'use client'

import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

type Datum = { month: string; pctConDiff: number }

function shortMonth(month: string): string {
  const [y, m] = month.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1, 1)
  return date.toLocaleDateString('es-AR', { month: 'short' })
}

export function DiscrepanciasTrendChart({ data }: { data: Datum[] }) {
  const fmt = data.map(d => ({ ...d, label: shortMonth(d.month) }))
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={fmt} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
        <Tooltip
          contentStyle={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: '#a1a1aa' }}
          formatter={(v) => typeof v === 'number' ? `${v}%` : String(v)}
        />
        <Line type="monotone" dataKey="pctConDiff" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
