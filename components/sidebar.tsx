'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, LayoutDashboard, Upload, Anchor, ShoppingBag, Database, ChevronLeft, ChevronRight, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/',              label: 'Inicio',          icon: Home },
  { href: '/panel-general', label: 'Panel General',   icon: LayoutDashboard },
  { href: '/comercial',     label: 'Carga Comercial', icon: Upload },
  { href: '/comex',         label: 'Comex Tracking',  icon: Anchor },
  { href: '/operaciones',   label: 'Fuentes',          icon: Database },
  { href: '/inspeccion',   label: 'Inspección Fotos', icon: Camera },
]

type Props = { collapsed: boolean; onToggle: () => void }

export function Sidebar({ collapsed, onToggle }: Props) {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 h-screen bg-[#0C0F17] flex flex-col border-r border-white/5 z-40 transition-all duration-200 overflow-hidden"
      style={{ width: collapsed ? 56 : 240 }}
    >
      {/* Brand */}
      <div className={cn('border-b border-white/5 flex items-center', collapsed ? 'px-3 py-4 justify-center' : 'px-5 py-5')}>
        <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
          <ShoppingBag className="w-4 h-4 text-zinc-950" />
        </div>
        {!collapsed && (
          <div className="ml-2.5 min-w-0">
            <p className="text-white text-sm font-semibold leading-none truncate">Panel Compras</p>
            <p className="text-zinc-500 text-xs mt-0.5">Procurement Suite</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className={cn('flex-1 py-4 space-y-0.5', collapsed ? 'px-1.5' : 'px-3')}>
        {!collapsed && (
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            Módulos
          </p>
        )}
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-all duration-150',
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
                active
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-amber-400' : 'text-zinc-500')} />
              {!collapsed && <span>{label}</span>}
              {!collapsed && active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer / toggle */}
      <div className={cn('border-t border-white/5 flex items-center', collapsed ? 'px-1.5 py-3 justify-center' : 'px-5 py-4 justify-between')}>
        {!collapsed && <p className="text-[11px] text-zinc-600">v1.0.0 · Mayo 2026</p>}
        <button
          onClick={onToggle}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-colors shrink-0"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  )
}
