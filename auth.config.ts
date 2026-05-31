import type { NextAuthConfig } from 'next-auth'

/**
 * Config base de NextAuth — compatible con Edge Runtime (middleware).
 *
 * IMPORTANTE: este archivo NO puede importar PrismaAdapter ni nada
 * que use módulos de Node (fs, crypto, path). El adapter completo
 * y los providers que requieren Node viven en `auth.ts`.
 *
 * Referencia: https://authjs.dev/guides/edge-compatibility
 */

const ALLOWED_EMAIL_DOMAIN = 'bidcom.com.ar'

function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return email.toLowerCase().trim().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)
}

export const authConfig = {
  providers: [],   // los providers reales se agregan en auth.ts (Node runtime)
  pages: {
    signIn: '/login',
    verifyRequest: '/login?check=mail',
    error: '/login?error',
  },
  callbacks: {
    /**
     * Este callback se ejecuta TAMBIÉN en el middleware (Edge), por eso
     * no puede acceder a la DB. Solo decide si la sesión existente es
     * válida para esta ruta. La validación de dominio del email vive en
     * el signIn callback de auth.ts (Node runtime).
     */
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const path = request.nextUrl.pathname

      const isPublic =
        path === '/login' ||
        path.startsWith('/api/auth') ||
        path.startsWith('/_next') ||
        path.startsWith('/brand') ||
        path === '/favicon.ico' ||
        path === '/robots.txt'

      if (isPublic) return true
      return isLoggedIn
    },
  },
} satisfies NextAuthConfig

export { isAllowedEmail }
