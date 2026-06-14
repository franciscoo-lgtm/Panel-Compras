'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import {
  Home, Anchor, Upload, ChevronLeft, ChevronRight, ShoppingCart, Settings, LogOut, Search,
  LayoutGrid, Package, Plane, FileText, DollarSign, Wrench, BarChart2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { openCmdK } from './shared/CmdK'

const navCompras = [
  { href: '/',              label: 'Inicio',        icon: Home,         badge: null },
  { href: '/embarques',     label: 'Embarques',     icon: Anchor,       badge: null },
  { href: '/compras',       label: 'Compras',       icon: ShoppingCart, badge: null },
  { href: '/comercial',     label: 'Carga CIPL',    icon: Upload,       badge: null },
  { href: '/configuracion', label: 'Configuración', icon: Settings,     badge: null },
]

const navERP = [
  { href: '/erp',               label: 'Panel ERP',    icon: LayoutGrid, badge: null },
  { href: '/erp/inventario',    label: 'Inventario',   icon: Package,    badge: null },
  { href: '/erp/importaciones', label: 'Importaciones',icon: Plane,      badge: null },
  { href: '/erp/comercial',     label: 'Comercial',    icon: FileText,   badge: null },
  { href: '/erp/finanzas',      label: 'Finanzas',     icon: DollarSign, badge: null },
  { href: '/erp/postventa',     label: 'Postventa',    icon: Wrench,     badge: null },
  { href: '/erp/planeamiento',  label: 'Planeamiento', icon: BarChart2,  badge: null },
]

type Props = { collapsed: boolean; onToggle: () => void }

export function Sidebar({ collapsed, onToggle }: Props) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user

  function NavItem({ href, label, icon: Icon, badge }: typeof navCompras[0]) {
    const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')
    return (
      <Link
        href={href}
        title={collapsed ? label : undefined}
        className={cn(
          'flex items-center rounded-md text-[13px] font-medium transition-all duration-150 group',
          collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-2.5 py-2',
          active
            ? 'bg-[#31AF4F]/10 text-white'
            : 'text-white/40 hover:text-white/80 hover:bg-white/[0.04]',
        )}
      >
        <Icon className={cn('w-4 h-4 shrink-0 transition-colors', active ? 'text-[#31AF4F]' : 'text-white/30 group-hover:text-white/60')} />
        {!collapsed && <span className="truncate">{label}</span>}
        {!collapsed && badge && (
          <span className="ml-auto text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#31AF4F]/15 text-[#31AF4F] font-semibold shrink-0">
            {badge}
          </span>
        )}
        {!collapsed && active && !badge && (
          <span className="ml-auto w-1 h-5 rounded-full bg-[#31AF4F] shrink-0" />
        )}
      </Link>
    )
  }

  return (
    <aside
      className="fixed left-0 top-0 h-screen bg-[#0A0A0A] flex flex-col border-r border-white/[0.06] z-40 transition-all duration-200 overflow-hidden"
      style={{ width: collapsed ? 56 : 240 }}
    >
      {/* Brand */}
      <Link
        href="/"
        className={cn(
          'border-b border-white/[0.06] flex items-center group/brand',
          collapsed ? 'px-3 py-4 justify-center' : 'px-4 py-4',
        )}
      >
        <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 ring-1 ring-white/[0.06] shadow-[0_0_18px_rgba(49,175,79,0.35)] group-hover/brand:shadow-[0_0_22px_rgba(49,175,79,0.55)] transition-shadow">
          <Image src="/brand/bidcom-icon.png" alt="Bidcom Agro" width={32} height={32} className="w-full h-full object-cover" />
        </div>
        {!collapsed && (
          <div className="ml-3 min-w-0">
            <p className="text-white text-[13px] font-semibold leading-tight tracking-tight truncate">Bidcom Agro</p>
            <p className="text-[#31AF4F]/70 text-[10px] mt-0.5 tracking-widest uppercase font-medium">Panel de Gestión</p>
          </div>
        )}
      </Link>

      {/* Search trigger */}
      <div className={cn('pt-3', collapsed ? 'px-1.5' : 'px-2.5')}>
        <button
          onClick={openCmdK}
          title={collapsed ? 'Buscar (⌘K)' : undefined}
          className={cn(
            'w-full flex items-center rounded-md text-[12px] transition-colors group',
            collapsed
              ? 'justify-center px-0 py-2 text-white/40 hover:text-white/80 hover:bg-white/[0.04]'
              : 'gap-2.5 px-2.5 py-1.5 bg-white/[0.02] border border-white/[0.06] text-white/45 hover:bg-white/[0.04] hover:border-white/[0.1]',
          )}
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && (
            <>
              <span className="truncate text-[11px]">Buscar…</span>
              <kbd className="ml-auto font-mono text-[9px] text-white/35 border border-white/[0.06] rounded px-1 py-0.5">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className={cn('flex-1 py-3 space-y-0.5 overflow-y-auto', collapsed ? 'px-1.5' : 'px-2.5')}>
        {/* Compras */}
        {!collapsed && (
          <p className="px-2 pb-2 pt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-white/20">
            Compras
          </p>
        )}
        {navCompras.map(item => <NavItem key={item.href} {...item} />)}

        {/* ERP Agtech */}
        {collapsed
          ? <div className="h-px mx-1 my-2 bg-white/[0.06]" />
          : <p className="px-2 pb-2 pt-3 text-[9px] font-bold uppercase tracking-[0.2em] text-white/20">ERP Agtech</p>
        }
        {navERP.map(item => <NavItem key={item.href} {...item} />)}
      </nav>

      {/* User pill */}
      {user && (
        <div className={cn(
          'border-t border-white/[0.06]',
          collapsed ? 'px-1.5 py-2' : 'px-2.5 py-2.5',
        )}>
          {collapsed ? (
            <button
              onClick={() => signOut({ redirectTo: '/login' })}
              title={`${user.email} · Cerrar sesión`}
              className="w-9 h-9 mx-auto flex items-center justify-center rounded-full bg-[#31AF4F]/15 text-[#31AF4F] hover:bg-red-500/15 hover:text-red-300 transition-colors text-[11px] font-semibold"
            >
              {initials(user.name, user.email)}
            </button>
          ) : (
            <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md group/user hover:bg-white/[0.03] transition-colors">
              <div className="w-8 h-8 rounded-full bg-[#31AF4F]/15 text-[#31AF4F] flex items-center justify-center text-[11px] font-semibold shrink-0">
                {initials(user.name, user.email)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-white/85 truncate">{user.name ?? user.email?.split('@')[0]}</p>
                <p className="text-[10px] text-white/35 truncate">{user.email}</p>
              </div>
              <button
                onClick={() => signOut({ redirectTo: '/login' })}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="w-7 h-7 flex items-center justify-center rounded-md text-white/30 hover:text-red-300 hover:bg-red-500/10 transition-colors shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Footer / toggle */}
      <div className={cn(
        'border-t border-white/[0.06] flex items-center',
        collapsed ? 'px-1.5 py-3 justify-center' : 'px-3 py-3 justify-between',
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

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email?.split('@')[0] || '?'
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}
