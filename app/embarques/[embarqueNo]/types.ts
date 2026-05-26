// Item fields the UI tabs actually read. Comes from prisma.cIPLItem.findMany with
// `include: { photos: true }`, serialized through JSON.parse(JSON.stringify(...))
// in the server component before reaching the client.
export type EmbarqueItem = {
  id: string
  asn: string | null
  soPrincipal: string | null
  description: string | null
  sku: string | null
  codeEan: string | null
  qty: number | null
  qPi: number | null
  diferenciaPiPl: number | null
  cbm: number | null
  gwKg: number | null
  photos: { id: string; dataUrl: string }[]
  // ── Control (Fase 2) ──────────────────────────────────────────────────────
  controlReviewed: boolean
  controlReviewedAt: string | null   // ISO string after JSON.parse(JSON.stringify(...))
  controlReviewedBy: string | null
  controlNota: string | null
  controlManualQty: number | null
  // ── Drive links (cargados en /comercial) ──────────────────────────────────
  driveLinkExcel: string | null
  driveLinkCi:    string | null
  driveLinkPl:    string | null
}

export type EmbarqueCompra = {
  id: string
  piNo: string | null
  supplierName: string | null
  fechaPago: string | null
  fechaLMS: string | null
  fechaEnvio: string | null
  sos: { id: string; soNumber: string }[]
}
