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

      // Programme préparé à la fin de l'accueil, puis un nouveau à partir de l'aperçu.
      await page.goto('training')
      await expect(
        page.getByRole('heading', { name: /^(Cette semaine|La semaine prochaine)$/ }),
      ).toBeVisible()
      await expectAccessible(page, 'entraînement')
      await page.getByRole('link', { name: /^Refaire mon programme/ }).click()
      await expect(page.getByRole('button', { name: 'Suivre ce programme' })).toBeVisible()
      await expectAccessible(page, 'nouveau programme')
      await page.getByRole('button', { name: 'Suivre ce programme' }).click()
      await expect(
        page.getByRole('heading', { name: /^(Cette semaine|La semaine prochaine)$/ }),
      ).toBeVisible()
      await page.goto('training/programs')
      await expect(page.getByRole('heading', { name: 'Mes programmes', level: 1 })).toBeVisible()
      await expectAccessible(page, 'mes programmes')
      await page.getByRole('link', { name: /Suivi/ }).click()
      await expect(page.getByText('Programme suivi')).toBeVisible()
      await expectAccessible(page, 'programme')
      await page.getByRole('button', { name: 'Réglages du programme' }).click()
      await expect(page.getByRole('dialog', { name: 'Réglages du programme' })).toBeVisible()
      await expectAccessible(page, 'réglages du programme')
      await page.getByRole('button', { name: 'Fermer' }).click()

      // Une séance, le réglage d'un exercice et le choix d'un autre.
      await page.getByRole('link', { name: /^Corps complet A/ }).click()
      await expect(page.getByRole('button', { name: 'Ajouter un exercice' })).toBeVisible()
      await expectAccessible(page, 'séance')
      await page
        .locator('section', { has: page.getByRole('heading', { name: 'Renforcement' }) })
        .getByRole('button')
        .first()
        .click()
      const slot = page.getByRole('dialog')
      await expect(slot.getByRole('button', { name: 'Changer' })).toBeVisible()
      await expectAccessible(page, 'réglage d’un exercice')
      await slot.getByRole('button', { name: 'Changer' }).click()
      await expect(page.getByRole('dialog', { name: 'Changer d’exercice' })).toBeVisible()
      await expectAccessible(page, 'choix d’un exercice')
      await page.getByRole('button', { name: 'Fermer' }).click()
      await page.getByRole('button', { name: 'Réorganiser' }).click()
      await expect(page.getByRole('button', { name: 'Terminé' })).toBeVisible()
      await expectAccessible(page, 'réorganiser')
      await page.getByRole('button', { name: 'Terminé' }).click()

      // La séance en direct : séries, repos, options d'un exercice, fin, bilan.
      await page.getByRole('button', { name: 'Commencer la séance' }).click()
      const firstSet = page
        .locator('section', { has: page.getByRole('heading', { name: 'Renforcement' }) })
        .getByRole('button', { name: /, série 1 faite$/ })
        .first()
      await expect(firstSet).toBeVisible()
      await expectAccessible(page, 'séance en cours')
      await firstSet.click()
      await expect(page.getByRole('timer', { name: 'Repos restant' })).toBeVisible()
      await expectAccessible(page, 'repos')
      await page
        .getByRole('button', { name: /^Options : / })
        .first()
        .click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectAccessible(page, 'options d’un exercice')
      await page.getByRole('button', { name: 'Fermer' }).click()
      await page.getByRole('button', { name: 'Retour' }).click()
      await expect(page.getByRole('link', { name: /^Reprendre la séance en cours/ })).toBeVisible()
      await expectAccessible(page, 'barre de séance')
      await page.getByRole('link', { name: /^Reprendre la séance en cours/ }).click()
      await page.getByRole('button', { name: 'Passer' }).click()
      await page.getByRole('button', { name: 'Terminer la séance' }).click()
      await expect(page.getByRole('dialog', { name: 'Terminer la séance' })).toBeVisible()
      await expectAccessible(page, 'fin de séance')
      await page.getByRole('button', { name: 'Enregistrer la séance' }).click()
      await expect(page.getByText('Séance terminée')).toBeVisible()
      await expectAccessible(page, 'bilan')

      for (const [path, heading] of [
        ['training/history', 'Historique'],
        ['training/records', 'Records'],
      ] as const) {
        await page.goto(path)
        await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
        await expectAccessible(page, path)
      }
      await page
        .getByRole('link')
        .filter({ hasText: /séance$/ })
        .first()
        .click()
      await expect(page.getByRole('heading', { name: 'Mes records' })).toBeVisible()
      await expectAccessible(page, 'fiche avec records')
    })

    test('calendrier accessible', async ({ page }) => {
      // Un mercredi : le programme préparé à l'accueil a une séance aujourd'hui.
      await page.clock.setFixedTime(new Date('2026-10-21T10:00:00+02:00'))
      await page.goto('./')
      await page.getByRole('button', { name: 'Commencer' }).click()
      for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Continuer' }).click()
      await page.getByRole('button', { name: 'Terminer' }).click()
      await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()

      await page.goto('calendar')
      await expect(page.getByRole('heading', { name: 'Octobre 2026', level: 2 })).toBeVisible()
      await expectAccessible(page, 'calendrier')
      await page.getByRole('button', { name: /^Corps complet/ }).click()
      await expect(page.getByRole('button', { name: 'Passer cette séance' })).toBeVisible()
      await expectAccessible(page, 'séance du programme')
      await page.getByRole('button', { name: 'Passer cette séance' }).click()
      await expect(page.getByRole('button', { name: /^Corps complet/ })).toContainText('Passée')
      await expectAccessible(page, 'séance passée')

      await page.getByRole('button', { name: 'Ajouter une séance' }).click()
      const sheet = page.getByRole('dialog', { name: 'Nouvelle séance' })
      await expect(sheet).toBeVisible()
      await expectAccessible(page, 'nouvelle séance')
      await sheet.getByRole('switch', { name: 'Répéter chaque semaine' }).click()
      await expect(sheet.getByRole('group', { name: 'Jours de la semaine' })).toBeVisible()
      await expectAccessible(page, 'séance répétée')
      await sheet.getByRole('button', { name: 'Ajouter la séance' }).click()
      await expect(page.getByText('Séance ajoutée')).toBeVisible()
      await page.getByRole('button', { name: /^Course à pied/ }).click()
      await expect(page.getByRole('button', { name: 'C’est fait' })).toBeVisible()
      await expectAccessible(page, 'jour d’une séance répétée')
      await page.getByRole('button', { name: 'Modifier la répétition' }).click()
      await expect(page.getByRole('dialog', { name: 'Séance répétée' })).toBeVisible()
      await expectAccessible(page, 'modifier la répétition')
      await page.getByRole('button', { name: 'Fermer' }).click()

      await page.goto('training')
      await expect(page.getByRole('heading', { name: 'Cette semaine' })).toBeVisible()
      await expectAccessible(page, 'entraînement avec le calendrier')
    })
  })
}
