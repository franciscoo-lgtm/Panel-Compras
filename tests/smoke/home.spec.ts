import { test, expect } from '@playwright/test'

test.describe('home', () => {
  test('carga sin 500', async ({ page }) => {
    const resp = await page.goto('/')
    expect(resp?.status()).toBeLessThan(500)
  })

  test('header del tablero ejecutivo visible', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /tablero ejecutivo/i })).toBeVisible()
  })

  test('sidebar tiene exactamente 5 items', async ({ page }) => {
    await page.goto('/')
    const navLinks = page.locator('aside nav a')
    await expect(navLinks).toHaveCount(5)
  })
})
