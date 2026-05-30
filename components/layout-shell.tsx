'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './sidebar'
import { CmdK } from './shared/CmdK'

export function LayoutShell({ children }: { children: React.ReactNode }) {
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
