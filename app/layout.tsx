import type { Metadata } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono, Barlow_Condensed } from 'next/font/google'
import './globals.css'
import { LayoutShell } from '@/components/layout-shell'
import { Toaster } from '@/components/ui/sonner'

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist-mono',
})

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display',
})

export const metadata: Metadata = {
  title: 'Seguimiento Envíos DJI',
  description: 'Sistema de seguimiento de envíos y logística DJI Argentina',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <body className="h-full">
        <LayoutShell>{children}</LayoutShell>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  )
}
