/**
 * Tipos del resultado de fetchComexData. Separados de comex.ts (que es
 * 'use server') para poder importarlos desde server components y desde
 * archivos pure como comex-internals.ts.
 */

export type ComexShipment = {
  embarqueNo: string
  extras: Record<string, string | null>
}

export type ComexSORow = {
  so: string
  shipments: ComexShipment[]
}

export type ComexData = {
  bySO: Map<string, ComexSORow>
  byEmbarque: Map<string, Set<string>>
  extraColumns: { fieldKey: string; label: string }[]
  fetchedAt: Date
  errors: string[]
}
