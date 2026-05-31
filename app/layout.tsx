import type { Metadata } from 'next'
import { Inter, Inter_Tight, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { LayoutShell } from '@/components/layout-shell'
import { AuthSessionProvider } from '@/components/session-provider'
import { Toaster } from '@/components/ui/sonner'

const interBody = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const interDisplay = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Bidcom Agro · Panel de Compras',
  description: 'Panel de seguimiento de compras, embarques y logística de Bidcom Agro',
  icons: {
    icon: '/brand/bidcom-favicon.png',
    apple: '/brand/bidcom-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${interBody.variable} ${interDisplay.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        <AuthSessionProvider>
          <LayoutShell>{children}</LayoutShell>
          <Toaster position="bottom-right" richColors />
        </AuthSessionProvider>
      </body>
    </html>
  )
}
