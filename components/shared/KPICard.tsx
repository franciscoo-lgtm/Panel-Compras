import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

type Props = {
  label: string
  value: string
  delta?: number | null
  hint?: string
  // Accent ahora es solo un indicador del color del trend / icon, no un border lateral.
  // Lo dejamos para compat con call-sites existentes; se ignora visualmente salvo en trend.
  accent?: 'red' | 'blue' | 'emerald' | 'amber' | 'zinc'
}

export function KPICard({ label, value, delta, hint }: Props) {
  const TrendIcon = delta == null ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const trendCls = delta == null ? 'text-white/30' : delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-red-300' : 'text-white/30'
  return (
    <div className={cn(
      'glass-card p-5',
    )}>
      <p className="eyebrow mb-3">{label}</p>
      <p className="text-[28px] font-display font-bold text-white tabular-nums leading-none tracking-tight">{value}</p>
      <div className="mt-3 flex items-center gap-1.5 text-[11px]">
        {delta != null && <TrendIcon className={cn('w-3 h-3', trendCls)} />}
        {delta != null && <span className={trendCls}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>}
        {hint && <span className="text-white/35">{hint}</span>}
      </div>
    </div>
  )
}
