'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const data = [
  { mes: 'Ene', monto: 420000 },
  { mes: 'Feb', monto: 381000 },
  { mes: 'Mar', monto: 512000 },
  { mes: 'Abr', monto: 447000 },
  { mes: 'May', monto: 623000 },
  { mes: 'Jun', monto: 578000 },
]

const fmt = (v: number) => `$${(v / 1000).toFixed(0)}k`

export function PurchaseChart() {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="mes"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: '#94a3b8' }}
        />
        <YAxis
          tickFormatter={fmt}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: '#94a3b8' }}
          width={48}
        />
        <Tooltip
          formatter={(value) => [`$${Number(value).toLocaleString('es-AR')}`, 'Monto']}
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            fontSize: '12px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          }}
          cursor={{ fill: '#f8fafc' }}
        />
        <Bar dataKey="monto" fill="#f59e0b" radius={[5, 5, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  )
}
