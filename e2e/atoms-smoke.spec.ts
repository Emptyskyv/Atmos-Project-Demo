import { expect, test } from '@playwright/test'

test('home page exposes the Atoms entry point', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000')

  await expect(page.getByRole('heading', { name: /atoms/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /start building/i })).toBeVisible()
})
