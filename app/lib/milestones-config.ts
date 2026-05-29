'use server'

import { prisma } from '@/lib/prisma'
import { CONFIG_KEY, DEFAULT_MILESTONES, type MilestoneConfig } from '@/app/lib/milestones-types'

export async function getMilestonesConfig(): Promise<MilestoneConfig[]> {
  const row = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEY } })
  if (!row) return DEFAULT_MILESTONES
  try {
    const parsed = JSON.parse(row.value)
    if (Array.isArray(parsed)) return parsed as MilestoneConfig[]
    return DEFAULT_MILESTONES
  } catch {
    return DEFAULT_MILESTONES
  }
}

export async function saveMilestonesConfig(milestones: MilestoneConfig[]): Promise<void> {
  await prisma.appConfig.upsert({
    where:  { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: JSON.stringify(milestones) },
    update: { value: JSON.stringify(milestones) },
  })
}

export async function resetMilestonesConfig(): Promise<void> {
  await prisma.appConfig.deleteMany({ where: { key: CONFIG_KEY } })
}
