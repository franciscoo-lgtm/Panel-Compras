import { NextResponse } from 'next/server'
import { auth } from '@/auth'

/**
 * Middleware: bloquea todo lo que no sea /login, /api/auth/*, o assets
 * de Next/marca. Si no hay sesión, redirige a /login conservando la
 * intent original (`callbackUrl`).
 */
export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth?.user
  const path = nextUrl.pathname

  // Rutas públicas: login, auth API, favicon, brand assets, _next, archivos estáticos
  const isPublic =
    path === '/login' ||
    path.startsWith('/api/auth') ||
    path.startsWith('/_next') ||
    path.startsWith('/brand') ||
    path === '/favicon.ico' ||
    path === '/robots.txt'

  if (isPublic) {
    // Si ya está logueado y entra a /login, mandalo al home
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

/**
 * Matcher: corremos en todas las rutas excepto las que son claramente
 * estáticas. Las exclusions en `isPublic` arriba son la fuente de
 * verdad — esto solo evita el overhead de invocar el middleware en
 * archivos estáticos.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/.*).*)'],
}
