import { cn } from '@/lib/utils'

export type EmbarqueEstado = 'pendiente' | 'en-transito' | 'arribado' | 'desconocido'

const CONFIG: Record<EmbarqueEstado, { label: string; cls: string }> = {
  'pendiente':    { label: 'Pendiente',   cls: 'bg-amber-500/15  text-amber-400  border-amber-500/30' },
  'en-transito':  { label: 'En tránsito', cls: 'bg-blue-500/15   text-blue-400   border-blue-500/30'  },
  'arribado':     { label: 'Arribado',    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  'desconocido':  { label: 'Sin tracking',cls: 'bg-zinc-500/10   text-zinc-400   border-zinc-500/20'  },
}

export function StatusPill({ estado, className }: { estado: EmbarqueEstado; className?: string }) {
  const c = CONFIG[estado]
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border',
      c.cls, className,
    )}>
      {c.label}
    </span>
  )
}
