import NextAuth, { type DefaultSession } from 'next-auth'
import Resend from 'next-auth/providers/resend'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import { authConfig, isAllowedEmail } from '@/auth.config'

// Tipos extendidos: agregamos el role del User a la session.
declare module 'next-auth' {
  interface Session {
    user: {
      role?: string
    } & DefaultSession['user']
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM ?? 'Bidcom Agro <onboarding@resend.dev>',
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,

    /**
     * Gate principal: cualquier signIn (login nuevo o callback desde el
     * magic link) pasa por acá. Retornamos false para rechazar — NextAuth
     * muestra el `pages.error` con ?error=AccessDenied.
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
