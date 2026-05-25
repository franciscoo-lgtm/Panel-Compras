import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

type Props = {
  label: string
  value: string
  delta?: number | null
  hint?: string
  accent?: 'red' | 'blue' | 'emerald' | 'amber' | 'zinc'
}

const ACCENT: Record<NonNullable<Props['accent']>, string> = {
  red:     'border-l-[#E30613]',
  blue:    'border-l-blue-500',
  emerald: 'border-l-emerald-500',
  amber:   'border-l-amber-500',
  zinc:    'border-l-zinc-700',
}

export function KPICard({ label, value, delta, hint, accent = 'zinc' }: Props) {
  const TrendIcon = delta == null ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const trendCls = delta == null ? 'text-zinc-500' : delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-zinc-500'
  return (
    <div className={cn(
      'bg-[#0d0d0d] border border-white/[0.06] border-l-4 rounded-lg p-4 transition-colors hover:bg-[#111]',
      ACCENT[accent],
    )}>
      <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold mb-2">{label}</p>
      <p className="text-2xl font-display font-bold text-white tabular-nums leading-tight">{value}</p>
      <div className="mt-2 flex items-center gap-1.5 text-[11px]">
        <TrendIcon className={cn('w-3.5 h-3.5', trendCls)} />
        {delta != null && <span className={trendCls}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>}
        {hint && <span className="text-zinc-500">{hint}</span>}
      </div>
    </div>
  )
}
