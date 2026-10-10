import { expect, test } from '@playwright/test'

test("l'appli démarre", async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'CaliTrack' })).toBeVisible()
})
