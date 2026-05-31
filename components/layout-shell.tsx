'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './sidebar'
import { CmdK } from './shared/CmdK'

/**
 * Rutas sin shell (sin sidebar): /login y cualquier pantalla pre-auth.
 * El middleware igualmente impide que un usuario no logueado vea las
 * demás rutas, pero usamos el pathname para no renderizar el chrome.
 */
function isChromeless(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/login/')
}

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const chromeless = isChromeless(pathname)

  const [collapsed, setCollapsed] = useState<boolean | null>(null)

  useEffect(() => {
    if (collapsed !== null) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration from localStorage requires post-mount read
    setCollapsed(localStorage.getItem('sidebar-collapsed') === 'true')
  }, [collapsed])

  const toggle = () =>
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })

  const effectiveCollapsed = collapsed ?? false

  if (chromeless) {
    return <div className="min-h-screen">{children}</div>
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={effectiveCollapsed} onToggle={toggle} />
      <main
        className="flex-1 overflow-y-auto brand-halo transition-all duration-200 min-w-0"
        style={{ marginLeft: effectiveCollapsed ? 56 : 240 }}
      >
        {children}
      </main>
      <CmdK />
    </div>
  )
}
