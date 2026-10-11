import { expect, test } from '@playwright/test'
import { FAKE_CAMERA_BARCODE } from './fake-camera'
import { collectErrors, NUTELLA_PRODUCT, onboard } from './nutrition-helpers'

// Chromium seulement : sa fausse caméra filme un code-barres (voir playwright.config.ts).
test('scan : la caméra lit le code-barres, le produit va au petit-déjeuner', async ({ page, context }) => {
  const errors = collectErrors(page)
  await page.clock.setFixedTime(new Date('2026-10-21T08:00:00+02:00'))
  const lookups: string[] = []
  await page.route('https://world.openfoodfacts.org/**', (route) => {
    lookups.push(route.request().url())
    return route.fulfill({ json: NUTELLA_PRODUCT })
  })
  // Rien d'autre ne sort de l'appli : le lecteur ZXing (WebAssembly) est servi par l'appli elle-même.
  const outside: string[] = []
  context.on('request', (request) => {
    const host = new URL(request.url()).hostname
    if (host !== 'localhost' && host !== 'world.openfoodfacts.org') outside.push(request.url())
  })
  await onboard(page)

  await page.goto('nutrition/scan?meal=breakfast')
  const sheet = page.getByRole('dialog', { name: 'Pâte à tartiner aux noisettes' })
  await expect(sheet).toBeVisible({ timeout: 20_000 })
  expect(lookups).toEqual([expect.stringContaining(`/product/${FAKE_CAMERA_BARCODE}?`)])
  await sheet.getByRole('button', { name: 'Ajouter au petit-déjeuner' }).click()
  await page.getByRole('button', { name: 'Terminé' }).click()
  await expect(
    page.getByRole('list', { name: 'Petit-déjeuner' }).getByRole('button', { name: /^Pâte à tartiner/ }),
  ).toBeVisible()
  expect(outside).toEqual([])
  expect(errors).toEqual([])
})
