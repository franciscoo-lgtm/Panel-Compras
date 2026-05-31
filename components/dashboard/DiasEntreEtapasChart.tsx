'use client'

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

type Datum = { etapa: string; dias: number; n: number }

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
    }}>
      <p style={{ fontWeight: 600, color: '#fff' }}>{d.etapa}</p>
      <p>{d.dias} días promedio</p>
      <p style={{ fontSize: 10, color: '#71717a', marginTop: 2 }}>basado en {d.n} embarque{d.n === 1 ? '' : 's'}</p>
    </div>
  )
}

export function DiasEntreEtapasChart({ data }: { data: Datum[] }) {
  if (data.length === 0 || data.every(d => d.n === 0)) {
    return <p className="text-[11px] text-zinc-500 text-center py-10">Sin datos suficientes</p>
  }

  // Altura dinámica: 32px por barra, min 210, max 600.
  // El user puede agregar hitos custom en /configuracion/hitos y cada
  // par consecutivo genera una etapa nueva acá. Con altura fija las
  // barras se aplastaban; ahora el chart crece con los hitos.
  const rowHeight = 32
  const computedHeight = Math.max(210, Math.min(600, data.length * rowHeight + 40))

  // Ancho del label se ajusta a la etapa más larga (truncamos > 30 chars).
  const longest = data.reduce((m, d) => Math.max(m, d.etapa.length), 0)
  const labelWidth = Math.min(180, Math.max(110, longest * 6.5))

  return (
    <ResponsiveContainer width="100%" height={computedHeight}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 20, bottom: 0, left: 80 }}>
        <XAxis type="number" stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="d" />
        <YAxis type="category" dataKey="etapa" stroke="#71717a" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={labelWidth} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(245,158,11,0.06)' }} />
        <Bar dataKey="dias" fill="#f59e0b" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
