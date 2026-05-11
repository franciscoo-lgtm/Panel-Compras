'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './sidebar'

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem('sidebar-collapsed') === 'true')
  }, [])

  const toggle = () =>
    setCollapsed(prev => {
      localStorage.setItem('sidebar-collapsed', String(!prev))
      return !prev
    })

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <main
        className="flex-1 overflow-y-auto bg-gray-50 transition-all duration-200"
        style={{ marginLeft: collapsed ? 56 : 240 }}
      >
        {children}
      </main>
    </div>
  )
}
