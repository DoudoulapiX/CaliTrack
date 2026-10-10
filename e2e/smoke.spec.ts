import { expect, test, type Page } from '@playwright/test'

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

test('premier lancement : accueil en six étapes, puis fiche d’exercice', async ({ page }) => {
  const errors = collectErrors(page)
  const next = page.getByRole('button', { name: 'Continuer' })

  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible()
  await page.getByRole('button', { name: 'Commencer' }).click()

  await page.getByLabel('Prénom').fill('Charles')
  await page.getByLabel('Poids').fill('72,5')
  await next.click()
  await expect(page.getByRole('heading', { name: 'Tes objectifs' })).toBeVisible()
  await next.click()
  await expect(page.getByRole('heading', { name: 'Ton planning' })).toBeVisible()
  await next.click()

  const where = page.getByRole('group', { name: /Où t’entraînes-tu/ })
  await where.getByRole('button', { name: 'Maison' }).click()
  await where.getByRole('button', { name: 'Parc' }).click()
  const home = page.getByRole('group', { name: /Matériel.+Maison/ })
  await home.getByRole('button', { name: 'Barre de traction' }).click()
  await home.getByRole('button', { name: 'Haltères' }).click()
  await next.click()

  await page.getByLabel('Tractions').fill('8')
  await page.getByLabel('Pompes').fill('30')
  await expect(page.getByText('Niveau estimé')).toBeVisible()
  await page.getByRole('button', { name: 'Terminer' }).click()

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

test('profil, test de niveau et matériel', async ({ page }) => {
  const errors = collectErrors(page)

  await page.goto('./')
  await page.getByRole('button', { name: 'Commencer' }).click()
  for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Terminer' }).click()
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  await expect(nav).toBeVisible()

  // Profil puis test de niveau
  await nav.getByRole('link', { name: 'Plus' }).click()
  await page.getByRole('link', { name: 'Profil et niveau' }).click()
  await page.getByLabel('Prénom').fill('Charles')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Profil enregistré')).toBeVisible()
  await page.getByRole('link', { name: 'Faire le test' }).click()
  await page.getByLabel('Pompes').fill('45')
  await page.getByLabel('Tractions').fill('13')
  await page.getByRole('button', { name: 'Enregistrer le test' }).click()
  await expect(page.getByRole('link', { name: 'Refaire le test' })).toBeVisible()
  await expect(page.getByRole('radio', { name: /^Avancé/ })).toHaveAttribute('aria-checked', 'true')

  // Matériel : un lieu, des haltères de 2 et 10 kg
  await page.getByRole('button', { name: 'Plus' }).click()
  await page.getByRole('link', { name: 'Matériel et lieux' }).click()
  await page.getByRole('button', { name: 'Ajouter un lieu' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Ajouter le lieu' }).click()
  await expect(page.getByRole('button', { name: /^Maison/ })).toBeVisible()
  await page.getByRole('button', { name: 'Ajouter du matériel' }).first().click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Haltères/ })
    .click()
  const weights = page.getByRole('group', { name: 'Charges' })
  await weights.getByRole('button', { name: '2 kg', exact: true }).click()
  await weights.getByRole('button', { name: '10 kg', exact: true }).click()
  await page.getByRole('button', { name: 'Ajouter le matériel' }).click()
  await expect(page.getByRole('link', { name: /Haltères.*2 kg, 10 kg · Maison/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('programme : création, réglage d’un exercice, et tout reste après rechargement', async ({ page }) => {
  const errors = collectErrors(page)
  const next = page.getByRole('button', { name: 'Continuer' })

  await page.goto('./')
  await page.getByRole('button', { name: 'Commencer' }).click()
  await next.click()
  await next.click()
  await next.click()
  const where = page.getByRole('group', { name: /Où t’entraînes-tu/ })
  await where.getByRole('button', { name: 'Maison' }).click()
  const home = page.getByRole('group', { name: /Matériel.+Maison/ })
  await home.getByRole('button', { name: 'Barre de traction' }).click()
  await next.click()
  await page.getByLabel('Tractions').fill('8')
  await page.getByLabel('Pompes').fill('30')
  await page.getByRole('button', { name: 'Terminer' }).click()

  // L'accueil a préparé le programme : la semaine est déjà là.
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  await nav.getByRole('link', { name: 'Entraînement' }).click()
  await expect(page.getByText('Cette semaine')).toBeVisible()
  await page
    .getByRole('link', { name: /^lundi .+ : / })
    .first()
    .click()

  // Une série de plus sur le premier exercice de renforcement.
  const strength = page.locator('section', { has: page.getByRole('heading', { name: 'Renforcement' }) })
  const first = strength.getByRole('button').first()
  await expect(first).toContainText('×')
  const before = Number(/(\d+) ×/.exec((await first.textContent()) ?? '')?.[1])
  expect(before).toBeGreaterThan(0)
  await first.click()
  const sheet = page.getByRole('dialog', { name: 'Renforcement' })
  await sheet.getByRole('button', { name: 'Séries : plus', exact: true }).click()
  await expect(sheet.getByRole('group', { name: 'Séries', exact: true }).getByRole('status')).toHaveText(
    String(before + 1),
  )
  await sheet.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Exercice enregistré')).toBeVisible()
  await expect(first).toContainText(`${String(before + 1)} ×`)

  await page.reload()
  await expect(first).toContainText(`${String(before + 1)} ×`)
  expect(errors).toEqual([])
})
