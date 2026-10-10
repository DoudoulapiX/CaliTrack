import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** Aucun défaut d'accessibilité détecté par axe sur l'écran affiché. */
async function expectAccessible(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const summary = violations.map((v) => `${screen} : ${v.id} (${v.nodes.length})`)
  expect(summary).toEqual([])
}

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`thème ${colorScheme === 'dark' ? 'sombre' : 'clair'}`, () => {
    test.use({ colorScheme })

    test('écrans accessibles', async ({ page }) => {
      const next = () => page.getByRole('button', { name: 'Continuer' }).click()

      await page.goto('./')
      await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible()
      await expectAccessible(page, 'accueil')
      await page.getByRole('button', { name: 'Commencer' }).click()
      await expectAccessible(page, 'toi')
      await next()
      await expectAccessible(page, 'objectifs')
      await next()
      await expectAccessible(page, 'planning')
      await next()
      await page
        .getByRole('group', { name: /Où t’entraînes-tu/ })
        .getByRole('button', { name: 'Maison' })
        .click()
      await expectAccessible(page, 'matériel')
      await next()
      await page.getByLabel('Pompes').fill('30')
      await expectAccessible(page, 'niveau')
      await page.getByRole('button', { name: 'Terminer' }).click()
      await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()

      for (const [path, heading] of [
        ['more', 'Plus'],
        ['library', 'Exercices'],
        ['library/pullup', 'Tractions'],
        ['more/profile', 'Profil et niveau'],
        ['more/profile/test', 'Test de niveau'],
        ['more/equipment', 'Matériel et lieux'],
        ['more/equipment/new/dumbbells', 'Nouveau matériel'],
      ] as const) {
        await page.goto(path)
        await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
        await expectAccessible(page, path)
      }

      await page.goto('more/equipment')
      await page.getByRole('button', { name: 'Ajouter un lieu' }).click()
      await expect(page.getByRole('dialog', { name: 'Nouveau lieu' })).toBeVisible()
      await expectAccessible(page, 'nouveau lieu')
    })
  })
}
