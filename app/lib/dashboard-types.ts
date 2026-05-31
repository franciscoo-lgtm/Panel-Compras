/**
 * Tipos del dashboard separados de dashboard.ts porque ese archivo es
 * 'use server' y solo puede exportar funciones async.
 */

/**
 * Segmentos del dashboard. Los repuestos SIEMPRE viajan por avión
 * (no hay envíos de repuestos por barco), por eso 'repuesto' no se
 * subdivide por transporte. La mercadería sí puede ir por AIR o
 * Barco (FCL/LCL).
 */
export type DashboardSegment =
  | 'todos'
  | 'repuesto'
  | 'mercaderia-air'
  | 'mercaderia-barco'
  | 'mixto'

export const DASHBOARD_SEGMENT_LABELS: Record<DashboardSegment, string> = {
  'todos':             'Todos',
  'repuesto':          'Repuesto',
  'mercaderia-air':    'Mercadería · AIR',
  'mercaderia-barco':  'Mercadería · Barco',
  'mixto':             'Mixto',
}
