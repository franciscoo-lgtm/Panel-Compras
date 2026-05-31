import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from '@/auth.config'

/**
 * Middleware Edge-compatible: usa `auth.config.ts` (sin Prisma) para no
 * traer módulos de Node al Edge Runtime. El callback `authorized`
 * decide si la sesión actual puede ver la ruta — la verificación de
 * dominio del email vive en `auth.ts` (signIn callback, Node runtime).
 */
const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth?.user
  const path = nextUrl.pathname

  const isPublic =
    path === '/login' ||
    path.startsWith('/api/auth') ||
    path.startsWith('/_next') ||
    path.startsWith('/brand') ||
    path === '/favicon.ico' ||
    path === '/robots.txt'

  if (isPublic) {
    if (isLoggedIn && path === '/login') {
      return NextResponse.redirect(new URL('/', nextUrl))
    }
    return NextResponse.next()
  }

  if (!isLoggedIn) {
    const loginUrl = new URL('/login', nextUrl)
    if (path !== '/') loginUrl.searchParams.set('callbackUrl', path)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/.*).*)'],
}
