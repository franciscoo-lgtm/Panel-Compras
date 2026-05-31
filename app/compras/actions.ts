'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { buildGSOMap } from '@/app/lib/sheets'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CompraManualField =
  | 'fechaOrden'
  | 'fechaEnvio'
  | 'fechaPago'
  | 'fechaSegundaValPA'
  | 'fechaInstruccionCat'
  | 'fechaLMS'

export type CreateCompraInput = {
  piNo:                string
  notas:               string
  supplierName:        string
  supplierAddress:     string
  supplierContactName: string
  supplierContactPhone:string
  supplierContactEmail:string
  soNumbers:           string[]
}

export type ActionResult =
  | { ok: true;  compraId?: string }
  | { ok: false; error: string }

// ─── Create Compra ────────────────────────────────────────────────────────────

export async function crearCompra(input: CreateCompraInput): Promise<ActionResult> {
  try {
    if (!input.piNo.trim()) return { ok: false, error: 'El PI N° es obligatorio.' }
    if (input.soNumbers.length === 0) return { ok: false, error: 'Seleccioná al menos un SO.' }

    const gsoMap = await buildGSOMap()

    const compra = await prisma.compra.create({
      data: {
        piNo:                input.piNo.trim(),
        notas:               input.notas.trim() || null,
        supplierName:        input.supplierName.trim()        || null,
        supplierAddress:     input.supplierAddress.trim()     || null,
        supplierContactName: input.supplierContactName.trim() || null,
        supplierContactPhone:input.supplierContactPhone.trim()|| null,
        supplierContactEmail:input.supplierContactEmail.trim()|| null,
        sos: {
          create: input.soNumbers.map(soNumber => {
            const row = gsoMap.get(soNumber.toUpperCase())
            return {
              soNumber: soNumber.toUpperCase(),
              modelo:   row?.modelo   ?? null,
              sku:      row?.sku      ?? null,
              qPi:      row?.qPi      ?? null,
              fobUnit:  row?.fobUnit  ?? null,
              fobTotal: row?.fobTotal ?? null,
              incoterm: row?.incoterm ?? null,
              pa:       row?.pa       ?? null,
            }
          }),
        },
      },
    })

    revalidatePath('/compras')
    return { ok: true, compraId: compra.id }
  } catch (err) {
    console.error('[crearCompra]', err)
    return { ok: false, error: String(err) }
  }
}

// ─── Mark a manual milestone date ─────────────────────────────────────────────

export async function marcarHito(
  compraId: string,
  field: CompraManualField,
  isoDate: string | null,
): Promise<ActionResult> {
  try {
    // fechaOrden no es nullable en el schema (siempre tiene un default).
    // Si el user borra el input, lo dejamos como fecha actual en vez de
    // dejarlo en null que Prisma rechaza.
    if (field === 'fechaOrden' && !isoDate) {
      return { ok: false, error: 'La fecha de creación de orden no puede estar vacía.' }
    }
    await prisma.compra.update({
      where: { id: compraId },
      data:  { [field]: isoDate ? new Date(isoDate) : null },
    })
    revalidatePath(`/compras/${compraId}`)
    revalidatePath('/compras')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// ─── Delete Compra ────────────────────────────────────────────────────────────

export type DeleteCompraResult =
  | { ok: true;  itemsUnlinked: number; sosDeleted: number }
  | { ok: false; error: string }

/**
 * Borra una Compra:
 * 1. Desvincula CIPLItems (compraId → null) para no romper FK
 * 2. Borra los CompraSOItem (cascade configurado en el schema)
 * 3. Borra la Compra
 *
 * Los CIPLItems quedan en su lugar (no se borran las fotos / drive links).
 * Si querés borrar también los CIPLs, hacelo desde /embarques/<no>/items.
 */
export async function eliminarCompra(compraId: string): Promise<DeleteCompraResult> {
  try {
    const result = await prisma.$transaction(async tx => {
      const unlink = await tx.cIPLItem.updateMany({
        where: { compraId },
        data:  { compraId: null },
      })
      const sosDel = await tx.compraSOItem.deleteMany({ where: { compraId } })
      await tx.compra.delete({ where: { id: compraId } })
      return { itemsUnlinked: unlink.count, sosDeleted: sosDel.count }
    })

    revalidatePath('/compras')
    revalidatePath('/embarques', 'layout')
    revalidatePath('/')

    return { ok: true, ...result }
  } catch (err) {
    console.error('[eliminarCompra]', err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Edit supplier / notes ────────────────────────────────────────────────────

export async function editarCompra(
  compraId: string,
  data: Partial<Pick<CreateCompraInput, 'piNo' | 'notas' | 'supplierName' | 'supplierAddress' | 'supplierContactName' | 'supplierContactPhone' | 'supplierContactEmail'>>,
): Promise<ActionResult> {
  try {
    await prisma.compra.update({
      where: { id: compraId },
      data: {
        ...(data.piNo                !== undefined && { piNo:                data.piNo.trim() || null }),
        ...(data.notas               !== undefined && { notas:               data.notas.trim() || null }),
        ...(data.supplierName        !== undefined && { supplierName:        data.supplierName.trim() || null }),
        ...(data.supplierAddress     !== undefined && { supplierAddress:     data.supplierAddress.trim() || null }),
        ...(data.supplierContactName !== undefined && { supplierContactName: data.supplierContactName.trim() || null }),
        ...(data.supplierContactPhone!== undefined && { supplierContactPhone:data.supplierContactPhone.trim() || null }),
        ...(data.supplierContactEmail!== undefined && { supplierContactEmail:data.supplierContactEmail.trim() || null }),
      },
    })
    revalidatePath(`/compras/${compraId}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
