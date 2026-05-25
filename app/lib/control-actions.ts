'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getCurrentRole } from '@/app/lib/roles'

type Result = { ok: true } | { ok: false; error: string }

async function actor(): Promise<string> {
  // TODO: cuando NextAuth esté wired up, usar la sesión real
  const role = await getCurrentRole()
  return role ?? 'desconocido'
}

export async function markReviewed(itemId: string, reviewed: boolean): Promise<Result> {
  try {
    await prisma.cIPLItem.update({
      where: { id: itemId },
      data: reviewed
        ? { controlReviewed: true,  controlReviewedAt: new Date(), controlReviewedBy: await actor() }
        : { controlReviewed: false, controlReviewedAt: null,        controlReviewedBy: null },
    })
    revalidatePath('/embarques', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function setManualQty(itemId: string, qty: number | null): Promise<Result> {
  try {
    await prisma.cIPLItem.update({
      where: { id: itemId },
      data: { controlManualQty: qty },
    })
    revalidatePath('/embarques', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function setNota(itemId: string, nota: string | null): Promise<Result> {
  try {
    await prisma.cIPLItem.update({
      where: { id: itemId },
      data: { controlNota: (nota ?? '').trim() || null },
    })
    revalidatePath('/embarques', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
