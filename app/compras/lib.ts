// Types inlined to avoid depending on gitignored generated Prisma path

export type CompraStatus =
  | 'Borrador'
  | 'Enviada'
  | 'Pagada'
  | 'PA Validada'
  | 'PL Cargado'
  | 'Instrucción Category'
  | 'LMS'
  | 'Completada'

export type SOItem = {
  soNumber: string
  qPi:      number | null
  fobTotal: number | null
  modelo:   string | null
}

export type CompraWithSOS = {
  id:                  string
  createdAt:           Date
  piNo:                string | null
  fechaOrden:          Date
  fechaEnvio:          Date | null
  fechaPago:           Date | null
  fechaSegundaValPA:   Date | null
  fechaInstruccionCat: Date | null
  fechaLMS:            Date | null
  sos:       SOItem[]
  ciplItems: { qty: number | null; soPrincipal: string | null }[]
}

export function getCompraStatus(compra: CompraWithSOS): CompraStatus {
  const hasPlLinked = compra.ciplItems.length > 0
  if (compra.fechaLMS)            return 'LMS'
  if (compra.fechaInstruccionCat) return 'Instrucción Category'
  if (hasPlLinked)                return 'PL Cargado'
  if (compra.fechaSegundaValPA)   return 'PA Validada'
  if (compra.fechaPago)           return 'Pagada'
  if (compra.fechaEnvio)          return 'Enviada'
  return 'Borrador'
}

export function getStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    'Borrador':              'bg-white/[0.06] text-white/40',
    'Enviada':               'bg-indigo-500/15 text-indigo-300',
    'Pagada':                'bg-emerald-500/15 text-emerald-300',
    'PA Validada':           'bg-purple-500/15 text-purple-300',
    'PL Cargado':            'bg-yellow-500/[0.12] text-yellow-300',
    'Instrucción Category':  'bg-orange-500/[0.12] text-orange-300',
    'LMS':                   'bg-cyan-500/[0.12] text-cyan-300',
    'Completada':            'bg-teal-500/[0.12] text-teal-300',
    'En WH Airsea':          'bg-blue-500/[0.12] text-blue-300',
    'Embarcado':             'bg-violet-500/[0.12] text-violet-300',
    'En tránsito':           'bg-sky-500/[0.12] text-sky-300',
    'En Aduana':             'bg-amber-500/[0.12] text-amber-300',
  }
  return map[status] ?? 'bg-white/[0.06] text-white/40'
}

export function getQtyRecibida(compra: CompraWithSOS): number {
  const compraSONumbers = new Set(compra.sos.map(s => s.soNumber.toUpperCase()))
  return compra.ciplItems
    .filter(c => c.soPrincipal && compraSONumbers.has(c.soPrincipal.toUpperCase()))
    .reduce((sum, c) => sum + (c.qty ?? 0), 0)
}

export function getQtyPedida(compra: CompraWithSOS): number {
  return compra.sos.reduce((sum, s) => sum + (s.qPi ?? 0), 0)
}
