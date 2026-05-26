import { test, expect } from '@playwright/test'

test.describe('cmd+k search', () => {
  test('atajo abre el modal', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Control+k')
    // Modal placeholder
    await expect(page.getByPlaceholder(/buscar embarque/i)).toBeVisible()
  })

  test('escape cierra el modal', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Control+k')
    await expect(page.getByPlaceholder(/buscar embarque/i)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByPlaceholder(/buscar embarque/i)).not.toBeVisible()
  })
})
