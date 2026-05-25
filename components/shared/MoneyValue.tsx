import { cn } from '@/lib/utils'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function MoneyValue({ usd, className }: { usd: number; className?: string }) {
  return (
    <span className={cn('tabular-nums', className)}>{fmt.format(usd)}</span>
  )
}
