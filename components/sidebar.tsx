'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Anchor, Upload, ChevronLeft, ChevronRight, Send, ShoppingCart, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/',              label: 'Inicio',        icon: Home,         legacy: false, badge: null },
  { href: '/embarques',     label: 'Embarques',     icon: Anchor,       legacy: false, badge: null },
  { href: '/compras',       label: 'Compras',       icon: ShoppingCart, legacy: false, badge: null },
  { href: '/comercial',     label: 'Carga CIPL',    icon: Upload,       legacy: false, badge: null },
  { href: '/configuracion', label: 'Configuración', icon: Settings,     legacy: false, badge: null },
]

type Props = { collapsed: boolean; onToggle: () => void }

export function Sidebar({ collapsed, onToggle }: Props) {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 h-screen bg-[#0A0A0A] flex flex-col border-r border-white/[0.06] z-40 transition-all duration-200 overflow-hidden"
      style={{ width: collapsed ? 56 : 240 }}
    >
      {/* Brand */}
      <div className={cn(
        'border-b border-white/[0.06] flex items-center',
        collapsed ? 'px-3 py-4 justify-center' : 'px-4 py-4'
      )}>
        <div className="w-8 h-8 rounded-md bg-[#E30613] flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(227,6,19,0.4)]">
          <Send className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div className="ml-3 min-w-0">
            <p className="text-white text-[13px] font-semibold leading-tight tracking-tight truncate">Envíos DJI</p>
            <p className="text-[#E30613]/60 text-[10px] mt-0.5 tracking-widest uppercase font-medium">Tracking Suite</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className={cn('flex-1 py-3 space-y-0.5', collapsed ? 'px-1.5' : 'px-2.5')}>
        {!collapsed && (
          <p className="px-2 pb-2 pt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-white/20">
            Módulos
          </p>
        )}
        {nav.map(({ href, label, icon: Icon, badge }) => {
          const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center rounded-md text-[13px] font-medium transition-all duration-150 group',
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-2.5 py-2',
                active
                  ? 'bg-[#E30613]/10 text-white'
                  : 'text-white/40 hover:text-white/80 hover:bg-white/[0.04]'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0 transition-colors', active ? 'text-[#E30613]' : 'text-white/30 group-hover:text-white/60')} />
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && badge && (
                <span className="ml-auto text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#E30613]/15 text-[#E30613] font-semibold shrink-0">
                  {badge}
                </span>
              )}
              {!collapsed && active && !badge && (
                <span className="ml-auto w-1 h-5 rounded-full bg-[#E30613] shrink-0" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer / toggle */}
      <div className={cn(
        'border-t border-white/[0.06] flex items-center',
        collapsed ? 'px-1.5 py-3 justify-center' : 'px-3 py-3 justify-between'
      )}>
        {!collapsed && <p className="text-[10px] text-white/20 tabular-nums">v1.0 · {new Date().getFullYear()}</p>}
        <button
          onClick={onToggle}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className="w-7 h-7 flex items-center justify-center rounded-md text-white/20 hover:text-white/60 hover:bg-white/[0.06] transition-colors shrink-0"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>
    </aside>
  )
}
