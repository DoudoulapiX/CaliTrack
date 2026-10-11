import { expect, test } from '@playwright/test'
import { collectErrors, NUTELLA_PRODUCT, onboard } from './nutrition-helpers'

test('nutrition : un aliment de la table Ciqual, puis un produit au code-barres tapé', async ({ page }) => {
  const errors = collectErrors(page)
  // Un mercredi midi : l'ajout vise le déjeuner.
  await page.clock.setFixedTime(new Date('2026-10-21T12:30:00+02:00'))
  await page.route('https://world.openfoodfacts.org/**', (route) => route.fulfill({ json: NUTELLA_PRODUCT }))
  // Sans caméra (comme sur un appareil qui n'en a pas) : le code se tape à la main, dans tous les navigateurs.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'mediaDevices', { configurable: true, get: () => undefined })
  })
  await onboard(page)

  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  await nav.getByRole('link', { name: 'Nutrition' }).click()
  await expect(page.getByRole('heading', { name: 'Nutrition', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: 'Ajouter au déjeuner' }).click()

  // La table Ciqual se charge à la demande.
  await page.getByRole('searchbox', { name: 'Chercher un aliment' }).fill('riz blanc cuit')
  await page.getByRole('button', { name: /^Riz blanc, cuit, sans sel/ }).click()
  const rice = page.getByRole('dialog', { name: /^Riz blanc, cuit, sans sel/ })
  await expect(rice.getByLabel('Quantité', { exact: true })).toHaveValue('110')
  await rice.getByRole('button', { name: 'Ajouter au déjeuner' }).click()
  await expect(rice).toBeHidden()

  // Le produit au code-barres (les raccourcis reviennent une fois la recherche effacée).
  await page.getByRole('button', { name: 'Effacer la recherche' }).click()
  await page.getByRole('link', { name: 'Scanner un produit' }).click()
  await expect(page.getByText(/^Pas de caméra disponible\s:/)).toBeVisible()
  await page.getByLabel('Ou tape le code').fill('3017620422003')
  await page.getByRole('button', { name: 'Chercher' }).click()
  const spread = page.getByRole('dialog', { name: 'Pâte à tartiner aux noisettes' })
  await expect(spread.getByLabel('Quantité', { exact: true })).toHaveValue('15')
  await spread.getByRole('button', { name: 'Ajouter au déjeuner' }).click()
  await page.getByRole('button', { name: 'Terminé' }).click()

  // Le journal, aussi après rechargement.
  // (L'horloge est figée : les deux ajouts ont la même heure, leur ordre n'est pas vérifié.)
  const lunch = page.getByRole('list', { name: 'Déjeuner' })
  const entries = [
    /^Riz blanc, cuit, sans sel ajouté\s*110\sg · 171\skcal$/,
    /^Pâte à tartiner aux noisettes\s*15\sg · 81\skcal$/,
  ]
  for (const reload of [false, true]) {
    if (reload) await page.reload()
    await expect(lunch.getByRole('button')).toHaveCount(2)
    for (const entry of entries) await expect(lunch.getByRole('button', { name: entry })).toBeVisible()
    await expect(page.getByText(/^sur 2\s630\skcal$/)).toBeVisible()
    await expect(page.getByText(/^Il te reste 2\s378\skcal$/)).toBeVisible()
  }
  expect(errors).toEqual([])
})
