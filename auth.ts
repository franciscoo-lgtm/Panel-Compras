import NextAuth, { type DefaultSession } from 'next-auth'
import Resend from 'next-auth/providers/resend'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'

/**
 * Restricción por dominio: solo emails @bidcom.com.ar pueden entrar.
 * El check vive en el callback signIn — NextAuth bloquea el flujo
 * antes de crear el User si retorna false. También se valida en el
 * authorize del provider Email para evitar incluso enviar el mail.
 */
const ALLOWED_EMAIL_DOMAIN = 'bidcom.com.ar'

function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return email.toLowerCase().trim().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)
}

// Tipos extendidos: agregamos el role del User a la session.
declare module 'next-auth' {
  interface Session {
    user: {
      role?: string
    } & DefaultSession['user']
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM ?? 'Bidcom Agro <onboarding@resend.dev>',
    }),
  ],
  pages: {
    signIn: '/login',
    verifyRequest: '/login?check=mail',
    error: '/login?error',
  },
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },
  callbacks: {
    /**
     * Gate principal: cualquier signIn (ya sea login nuevo o callback
     * desde el magic link) pasa por acá. Retornamos false para
     * rechazar — NextAuth muestra el `pages.error` con ?error=AccessDenied.
     */
    async signIn({ user }) {
      return isAllowedEmail(user.email)
    },

    /**
     * Inyectamos el role del DB en la session para que los componentes
     * que lo consultan no tengan que volver a hacer query.
     */
    async session({ session, user }) {
      if (session.user) {
        session.user.role = (user as { role?: string }).role
      }
      return session
    },
  },
  events: {
    /**
     * Defensa en profundidad: si alguien bypasea el signIn (modificando
     * el provider, exploit, etc), también validamos al crear el user.
     */
    async createUser({ user }) {
      if (!isAllowedEmail(user.email)) {
        await prisma.user.delete({ where: { id: user.id! } })
        throw new Error('Email no autorizado')
      }
    },
  },
})

export { isAllowedEmail }
