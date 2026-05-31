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
      id?: string
    } & DefaultSession['user']
  }
}

/**
 * Session strategy = 'jwt': la sesión vive en una cookie JWT firmada,
 * NO en una row de Session en la DB. Esto es necesario para que el
 * middleware (Edge Runtime) pueda decodificarla sin tocar Postgres.
 *
 * El PrismaAdapter sigue activo para User, Account y VerificationToken
 * (necesarios para el flujo de magic link), solo evitamos la tabla
 * Session que en JWT mode no se usa.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
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
     * Gate principal: rechaza login si el email no es del dominio
     * permitido. Corre tanto al iniciar (envío de mail) como al
     * callback del magic link.
     */
    async signIn({ user }) {
      return isAllowedEmail(user.email)
    },

    /**
     * JWT strategy: el token vive en cookie. Cargamos el role + id del
     * DB la primera vez (después de signIn) y los persistimos en el
     * token para que session() pueda leerlos sin volver a la DB.
     */
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role
        token.id = user.id
      }
      return token
    },

    async session({ session, token }) {
      if (session.user && token) {
        if (typeof token.role === 'string') session.user.role = token.role
        if (typeof token.id === 'string') session.user.id = token.id
      }
      return session
    },
  },
})

export { isAllowedEmail }
