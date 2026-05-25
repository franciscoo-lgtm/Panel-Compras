function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function DateRange({ etd, eta }: { etd: string | null; eta: string | null }) {
  return (
    <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
      {fmt(etd)} <span className="text-zinc-600">→</span> {fmt(eta)}
    </span>
  )
}
