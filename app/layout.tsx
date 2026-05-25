import type { Metadata } from 'next'
import { Inter, Inter_Tight, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { LayoutShell } from '@/components/layout-shell'
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
  weight: ['500', '600', '700'],
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: 'Seguimiento Envíos DJI',
  description: 'Sistema de seguimiento de envíos y logística DJI Argentina',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${interBody.variable} ${interDisplay.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        <LayoutShell>{children}</LayoutShell>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  )
}
