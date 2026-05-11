import type { Metadata } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
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

export const metadata: Metadata = {
  title: 'Panel de Compras',
  description: 'Sistema de gestión de compras corporativas',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        <LayoutShell>{children}</LayoutShell>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  )
}
