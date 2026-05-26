import { test, expect } from '@playwright/test'

test.describe('embarques', () => {
  test('lista carga sin 500', async ({ page }) => {
    const resp = await page.goto('/embarques')
    expect(resp?.status()).toBeLessThan(500)
  })

  test('header muestra título', async ({ page }) => {
    await page.goto('/embarques')
    await expect(page.getByRole('heading', { name: /^embarques$/i })).toBeVisible()
  })

  test('filtros de estado aparecen', async ({ page }) => {
    await page.goto('/embarques')
    await expect(page.getByRole('button', { name: /todos/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /en tránsito/i })).toBeVisible()
  })
})
