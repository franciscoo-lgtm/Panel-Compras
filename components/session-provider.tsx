'use client'

import { SessionProvider } from 'next-auth/react'

/**
 * Wrapper client-only del SessionProvider de NextAuth para poder
 * importarlo desde el RootLayout (que es server component).
 */
export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
