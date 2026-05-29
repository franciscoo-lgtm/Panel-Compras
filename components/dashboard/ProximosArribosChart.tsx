'use client'

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

type Datum = { semana: string; count: number; embarques: string[] }

type TooltipProps = {
  active?: boolean
  payload?: Array<{ payload: Datum }>
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
      maxWidth: 240,
    }}>
      <p style={{ fontWeight: 600, color: '#fff' }}>Semana del {d.semana}</p>
      <p>{d.count} embarque{d.count === 1 ? '' : 's'}</p>
      {d.embarques.length > 0 && (
        <p style={{ marginTop: 4, fontSize: 10, fontFamily: 'monospace', color: '#71717a' }}>
          {d.embarques.slice(0, 5).join(', ')}{d.count > 5 ? '…' : ''}
        </p>
      )}
    </div>
  )
}

export function ProximosArribosChart({ data }: { data: Datum[] }) {
  if (data.every(d => d.count === 0)) {
    return <p className="text-[11px] text-zinc-500 text-center py-10">Sin arribos planificados en las próximas 4 semanas</p>
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis dataKey="semana" stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(16,185,129,0.06)' }} />
        <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
