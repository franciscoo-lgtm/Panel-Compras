import Link from 'next/link'
import { cn } from '@/lib/utils'

export function EmbarqueChip({ embarqueNo, className }: { embarqueNo: string; className?: string }) {
  return (
    <Link
      href={`/embarques/${encodeURIComponent(embarqueNo)}`}
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-medium',
        'bg-white/[0.04] text-zinc-300 border border-white/[0.06]',
        'hover:bg-[#E30613]/10 hover:text-white hover:border-[#E30613]/30 transition-colors',
        className,
      )}
    >
      {embarqueNo}
    </Link>
  )
}
