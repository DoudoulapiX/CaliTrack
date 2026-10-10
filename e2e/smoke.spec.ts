import { expect, test } from '@playwright/test'

test('premier lancement : accueil, puis fiche d’exercice', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible()
  await page.getByRole('button', { name: 'Commencer' }).click()
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  await expect(nav).toBeVisible()

  await nav.getByRole('link', { name: 'Plus' }).click()
  await page.getByRole('link', { name: 'Exercices' }).click()
  await page.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('tractions')
  await page
    .getByRole('link', { name: /^Tractions\b/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Tractions', level: 1 })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Animation : Tractions' })).toBeVisible()

  // L'accueil n'est proposé qu'une fois : après rechargement, on reste sur la fiche.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tractions', level: 1 })).toBeVisible()
  expect(errors).toEqual([])
})
