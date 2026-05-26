'use client'

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

type Datum = { name: string; valorUSD: number }

const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function TopProveedoresChart({ data }: { data: Datum[] }) {
  if (data.length === 0) {
    return <p className="text-[11px] text-zinc-500 text-center py-10">Sin datos</p>
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 8, bottom: 0, left: 80 }}>
        <XAxis type="number" stroke="#71717a" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
        <YAxis type="category" dataKey="name" stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={80} />
        <Tooltip
          contentStyle={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: '#a1a1aa' }}
          formatter={(v) => typeof v === 'number' ? fmtUSD.format(v) : String(v)}
          cursor={{ fill: 'rgba(139,92,246,0.06)' }}
        />
        <Bar dataKey="valorUSD" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
