'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

type Datum = { name: string; value: number }

const COLORS = ['#E30613', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']

export function TipoCargaDonut({ data }: { data: Datum[] }) {
  if (data.length === 0) {
    return <p className="text-[11px] text-zinc-500 text-center py-10">Sin datos</p>
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip
          contentStyle={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 11 }}
          labelStyle={{ color: '#a1a1aa' }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
