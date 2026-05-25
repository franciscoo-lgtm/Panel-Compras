export type AppRole = 'comercial' | 'comex' | 'admin'

export const ROLE_LABELS: Record<AppRole, string> = {
  comercial: 'Comercial',
  comex:     'Comex',
  admin:     'Administrador',
}

// TODO: replace this stub with actual session lookup once auth (NextAuth) is wired up.
// For now everyone is admin so the new routes work without auth gating.
// Future implementation will require `prisma` (to load the user record) and the user's session.
export async function getCurrentRole(): Promise<AppRole | null> {
  return 'admin'
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
