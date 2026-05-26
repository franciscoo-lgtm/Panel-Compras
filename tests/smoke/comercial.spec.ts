import { test, expect } from '@playwright/test'

test.describe('comercial (Carga CIPL)', () => {
  test('stepper carga sin 500', async ({ page }) => {
    const resp = await page.goto('/comercial')
    expect(resp?.status()).toBeLessThan(500)
  })

  test('header y link a fotos', async ({ page }) => {
    await page.goto('/comercial')
    await expect(page.getByRole('heading', { name: /carga cipl/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /subir fotos/i })).toBeVisible()
  })

  test('/comercial/fotos standalone carga', async ({ page }) => {
    const resp = await page.goto('/comercial/fotos')
    expect(resp?.status()).toBeLessThan(500)
    await expect(page.getByRole('heading', { name: /subir fotos de inspección/i })).toBeVisible()
  })

  test('/inspeccion redirige', async ({ page }) => {
    await page.goto('/inspeccion')
    await page.waitForURL('**/comercial')
    expect(page.url()).toContain('/comercial')
  })
})
