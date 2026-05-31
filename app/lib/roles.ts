import { auth } from '@/auth'

export type AppRole = 'comercial' | 'comex' | 'admin'

export const ROLE_LABELS: Record<AppRole, string> = {
  comercial: 'Comercial',
  comex:     'Comex',
  admin:     'Administrador',
}

function isAppRole(value: string | null | undefined): value is AppRole {
  return value === 'comercial' || value === 'comex' || value === 'admin'
}

/**
 * Lee el role del usuario autenticado desde la sesión de NextAuth.
 * Retorna null si no hay sesión activa. El role default al crear un
 * usuario vía magic link es 'comercial' (definido en el schema).
 * Para promover a 'comex' o 'admin' hay que modificar el row en DB.
 */
export async function getCurrentRole(): Promise<AppRole | null> {
  const session = await auth()
  const role = session?.user?.role
  return isAppRole(role) ? role : null
}

export async function getCurrentUser() {
  const session = await auth()
  return session?.user ?? null
}

export async function requireRole(allowed: AppRole[]): Promise<AppRole> {
  const role = await getCurrentRole()
  if (!role || !allowed.includes(role)) {
    throw new Error(`Acceso denegado. Roles permitidos: ${allowed.join(', ')}`)
  }
  return role
}

export function canEditCIPL(role: AppRole | null): boolean {
  return role === 'admin' || role === 'comercial'
}

export function canConfigureComex(role: AppRole | null): boolean {
  return role === 'admin' || role === 'comex'
}

export function canDeleteAnything(role: AppRole | null): boolean {
  return role === 'admin'
}
