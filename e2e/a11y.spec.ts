import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Attend la fin des transitions et animations en cours (pas de celles qui tournent sans fin). Une pastille
 * qu'on vient de toucher passe du gris à l'orange en 150 ms : ses couleurs intermédiaires, que personne
 * ne lit, ne doivent pas être mesurées.
 */
async function animationsDone(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' || animation.effect?.getComputedTiming().endTime === Infinity,
      ),
  )
}

/** Aucun défaut d'accessibilité détecté par axe sur l'écran affiché, une fois immobile. */
async function expectAccessible(page: Page, screen: string) {
  await animationsDone(page)
  const { violations } = await new AxeBuilder({ page }).analyze()
  const summary = violations.flatMap((v) =>
    v.nodes.map((node) => `${screen} : ${v.id} : ${node.target.join(' ')}\n${node.failureSummary ?? ''}`),
  )
  expect(summary).toEqual([])
}

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`thème ${colorScheme === 'dark' ? 'sombre' : 'clair'}`, () => {
    test.use({ colorScheme })

    test('écrans accessibles', async ({ page }) => {
      // Long parcours (accueil, programme, séance, bilan) : plus de temps quand les tests tournent en parallèle.
      test.slow()
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

    test('objectifs accessibles', async ({ page }) => {
      test.slow()
      await page.clock.setFixedTime(new Date('2026-10-21T10:00:00+02:00'))
      await page.goto('./')
      await page.getByRole('button', { name: 'Commencer' }).click()
      await page.getByLabel('Poids').fill('80')
      for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Continuer' }).click()
      await page.getByRole('button', { name: 'Terminer' }).click()
      await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()

      // La figure visée à l'accueil : la liste, sa fiche, une étape, la modification.
      await page.goto('goals')
      await expect(page.getByRole('heading', { name: 'Objectifs', level: 1 })).toBeVisible()
      await expectAccessible(page, 'objectifs')
      await page.getByRole('link', { name: /^Muscle-up/ }).click()
      await expect(page.getByRole('heading', { name: 'Muscle-up', level: 1 })).toBeVisible()
      await expectAccessible(page, 'objectif figure')
      await page.getByRole('button', { name: /^Étape 1 : / }).click()
      await expect(page.getByRole('dialog', { name: 'Étape 1 sur 6' })).toBeVisible()
      await expectAccessible(page, 'étape d’une figure')
      await page.getByRole('button', { name: 'Fermer' }).click()
      await page.getByRole('button', { name: 'Modifier l’objectif' }).click()
      await expect(page.getByRole('dialog', { name: 'Modifier l’objectif' })).toBeVisible()
      await expectAccessible(page, 'modifier un objectif')
      await page.getByRole('button', { name: 'Fermer' }).click()

      // Un objectif de chaque genre.
      await page.goto('goals/new')
      await expect(page.getByRole('radio', { name: 'Figure', exact: true })).toBeVisible()
      await expectAccessible(page, 'nouvel objectif : figure')
      await page.getByRole('radio', { name: 'Exercice', exact: true }).click()
      await page.getByRole('button', { name: 'Choisir un exercice' }).click()
      const picker = page.getByRole('dialog', { name: 'Choisir un exercice' })
      await expect(picker).toBeVisible()
      await expectAccessible(page, 'choix de l’exercice d’un objectif')
      await picker.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('pompes')
      await picker.getByText('Pompes', { exact: true }).click()
      await page.getByLabel('Objectif', { exact: true }).fill('20')
      await expectAccessible(page, 'nouvel objectif : exercice')
      await page.getByRole('button', { name: 'Créer l’objectif' }).click()
      await expect(page.getByRole('heading', { name: /^Pompes\s:\s20 rép\.$/, level: 1 })).toBeVisible()
      await expectAccessible(page, 'objectif exercice')

      await page.goto('goals/new?type=bodyweight')
      await page.getByLabel('Poids visé').fill('75')
      await expectAccessible(page, 'nouvel objectif : poids')
      await page.getByRole('button', { name: 'Créer l’objectif' }).click()
      await expect(page.getByRole('heading', { name: 'Peser 75 kg', level: 1 })).toBeVisible()
      await expectAccessible(page, 'objectif poids')
      await page.getByRole('button', { name: 'Noter mon poids' }).click()
      await expect(page.getByRole('dialog', { name: 'Noter mon poids' })).toBeVisible()
      await expectAccessible(page, 'noter mon poids')
      await page.getByRole('button', { name: 'Fermer' }).click()

      await page.goto('goals/new?type=climbing')
      await page.getByRole('radio', { name: 'Bleu', exact: true }).click()
      await expectAccessible(page, 'nouvel objectif : escalade')
      await page.getByRole('button', { name: 'Créer l’objectif' }).click()
      await expect(page.getByRole('heading', { name: '1 bloc bleu', level: 1 })).toBeVisible()
      await expectAccessible(page, 'objectif escalade')

      await page.goto('goals/new?type=custom')
      await page.getByLabel('Nom', { exact: true }).fill('Courir 10 km')
      await expectAccessible(page, 'nouvel objectif libre')
      await page.getByRole('button', { name: 'Créer l’objectif' }).click()
      await expect(page.getByRole('heading', { name: 'Courir 10 km', level: 1 })).toBeVisible()
      await expectAccessible(page, 'objectif libre')

      await page.goto('goals')
      await expect(page.getByRole('link', { name: /^Courir 10 km/ })).toBeVisible()
      await expectAccessible(page, 'objectifs de chaque genre')
    })

    test('escalade accessible', async ({ page }) => {
      test.slow()
      // Un samedi, jour d'escalade choisi à l'accueil.
      await page.clock.setFixedTime(new Date('2026-10-24T18:00:00+02:00'))
      const next = () => page.getByRole('button', { name: 'Continuer' }).click()
      await page.goto('./')
      await page.getByRole('button', { name: 'Commencer' }).click()
      await next()
      await next()
      await page
        .getByRole('group', { name: 'Jours d’escalade' })
        .getByRole('button', { name: 'samedi' })
        .click()
      await next()
      await next()
      await page.getByRole('button', { name: 'Terminer' }).click()
      const nav = page.getByRole('navigation', { name: 'Navigation principale' })
      await expect(nav).toBeVisible()

      // L'onglet encore vide, et une séance passée à noter.
      await nav.getByRole('link', { name: 'Escalade', exact: true }).click()
      await expect(page.getByText('Note ta première séance')).toBeVisible()
      await expectAccessible(page, 'escalade')
      await page.getByRole('button', { name: 'Noter une séance passée' }).click()
      await expect(page.getByRole('dialog', { name: 'Séance passée' })).toBeVisible()
      await expectAccessible(page, 'séance passée')
      await page.getByRole('button', { name: 'Fermer' }).click()

      // L'escalade prévue aujourd'hui, commencée depuis le calendrier.
      // Le calendrier n'a pas d'onglet par défaut : on y va par « Plus ».
      await nav.getByRole('link', { name: 'Plus' }).click()
      await expect(page.getByRole('heading', { name: 'Plus', level: 1 })).toBeVisible()
      await page.getByRole('link', { name: 'Calendrier' }).click()
      await page.getByRole('button', { name: /^Escalade/ }).click()
      const planned = page.getByRole('dialog', { name: 'Escalade' })
      await expect(planned.getByRole('button', { name: 'Commencer la séance' })).toBeVisible()
      await expectAccessible(page, 'escalade prévue')
      await planned.getByRole('button', { name: 'Commencer la séance' }).click()
      await expect(page.getByRole('heading', { name: 'Vertical’Art', level: 1 })).toBeVisible()
      await expectAccessible(page, 'séance d’escalade')

      // Un bloc, puis un autre avec son style, et la modification d'un bloc noté.
      await page.getByRole('button', { name: /^Bleu, .+\sajouter un bloc/ }).click()
      const blue = page.getByRole('dialog', { name: 'Bloc bleu' })
      await expect(blue).toBeVisible()
      await expectAccessible(page, 'bloc')
      await blue.getByRole('button', { name: 'Ajouter le bloc' }).click()
      await expect(page.getByRole('heading', { name: 'Blocs notés (1)' })).toBeVisible()
      await page.getByRole('button', { name: /^Rouge, .+\sajouter un bloc/ }).click()
      const red = page.getByRole('dialog', { name: 'Bloc rouge' })
      await red.getByRole('radio', { name: 'Pas réussi' }).click()
      await red.getByRole('button', { name: 'Style et note (facultatif)' }).click()
      await red.getByRole('button', { name: 'Dévers' }).click()
      await expectAccessible(page, 'bloc avec son style')
      await red.getByRole('button', { name: 'Ajouter le bloc' }).click()
      await expect(page.getByRole('heading', { name: 'Blocs notés (2)' })).toBeVisible()
      await expectAccessible(page, 'séance avec des blocs')
      await page.getByRole('button').filter({ hasText: 'Dévers' }).click()
      await expect(page.getByRole('dialog', { name: 'Modifier le bloc' })).toBeVisible()
      await expectAccessible(page, 'modifier un bloc')
      await page.getByRole('button', { name: 'Fermer' }).click()
      await page.getByRole('button', { name: 'Modifier la séance' }).click()
      await expect(page.getByRole('dialog', { name: 'Séance d’escalade' })).toBeVisible()
      await expectAccessible(page, 'réglages de la séance en cours')
      await page.getByRole('button', { name: 'Fermer' }).click()

      // On sort : la séance continue, avec sa barre au-dessus des onglets.
      await page.getByRole('button', { name: 'Escalade', exact: true }).click()
      const bar = page.getByRole('link', { name: /^Reprendre la séance d’escalade en cours/ })
      await expect(bar).toBeVisible()
      await expectAccessible(page, 'calendrier avec la séance en cours')
      await nav.getByRole('link', { name: 'Escalade', exact: true }).click()
      await expect(page.getByText('Séance en cours')).toBeVisible()
      await expectAccessible(page, 'escalade en cours')
      await bar.click()
      await page.getByRole('button', { name: 'Terminer la séance' }).click()
      await expect(page.getByRole('dialog', { name: 'Terminer la séance' })).toBeVisible()
      await expectAccessible(page, 'fin de la séance d’escalade')
      await page.getByRole('button', { name: 'Enregistrer la séance' }).click()
      await expect(page.getByText('Séance terminée')).toBeVisible()
      await expectAccessible(page, 'bilan d’escalade')
      await page.getByRole('button', { name: 'Terminé' }).click()
      await expect(page.getByRole('heading', { name: 'Dernières séances' })).toBeVisible()
      await expectAccessible(page, 'escalade avec une séance')

      // L'historique : la séance, ses blocs à compléter, ses réglages et sa suppression.
      await page.getByRole('link', { name: /^Toutes les séances/ }).click()
      await expect(page.getByRole('heading', { name: 'Séances d’escalade', level: 1 })).toBeVisible()
      await expectAccessible(page, 'séances d’escalade')
      await page.getByRole('link', { name: /^Samedi 24/ }).click()
      await expect(page.getByRole('button', { name: 'Supprimer la séance' })).toBeVisible()
      await expectAccessible(page, 'séance d’escalade terminée')
      await page.getByRole('button', { name: 'Ajouter un bloc', exact: true }).click()
      await expect(page.getByRole('button', { name: /^Vert, .+\sajouter un bloc/ })).toBeVisible()
      await expectAccessible(page, 'bloc oublié')
      await page.getByRole('button', { name: 'Modifier la séance' }).click()
      await expect(page.getByRole('dialog', { name: 'Séance d’escalade' })).toBeVisible()
      await expectAccessible(page, 'modifier une séance d’escalade')
      await page.getByRole('button', { name: 'Fermer' }).click()
      await page.getByRole('button', { name: 'Supprimer la séance' }).click()
      await expect(page.getByRole('dialog', { name: /^Supprimer la séance/ })).toBeVisible()
      await expectAccessible(page, 'supprimer une séance d’escalade')
      await page.getByRole('button', { name: 'Annuler' }).click()

      // Statistiques, puis couleurs et cotations : un niveau, un niveau de plus, une autre salle.
      await page.goto('climbing/stats')
      await expect(page.getByRole('heading', { name: 'Statistiques', level: 1 })).toBeVisible()
      await expectAccessible(page, 'statistiques d’escalade')
      await page.goto('climbing/grades')
      await expect(page.getByRole('heading', { name: 'Couleurs et cotations', level: 1 })).toBeVisible()
      await expectAccessible(page, 'couleurs et cotations')
      await page.getByRole('button', { name: /^Bleu/ }).click()
      await expect(page.getByRole('dialog', { name: 'Niveau Bleu' })).toBeVisible()
      await expectAccessible(page, 'un niveau')
      await page.getByRole('button', { name: 'Fermer' }).click()
      await page.getByRole('button', { name: 'Ajouter un niveau' }).click()
      await expect(page.getByRole('dialog', { name: 'Nouveau niveau' })).toBeVisible()
      await expectAccessible(page, 'nouveau niveau')
      await page.getByRole('button', { name: 'Fermer' }).click()
      await page.getByRole('button', { name: /^Nouvelle échelle pour une autre salle/ }).click()
      await expect(page.getByRole('dialog', { name: 'Nouvelle échelle' })).toBeVisible()
      await expectAccessible(page, 'nouvelle échelle')
    })

    test('accueil, réglages et sauvegarde accessibles', async ({ page }) => {
      test.slow()
      // Un mercredi matin.
      await page.clock.setFixedTime(new Date('2026-10-21T10:00:00+02:00'))
      await page.goto('./')
      await page.getByRole('button', { name: 'Commencer' }).click()
      await page.getByLabel('Poids').fill('80')
      for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Continuer' }).click()
      await page.getByLabel('Tractions').fill('10')
      await page.getByRole('button', { name: 'Terminer' }).click()

      // L'écran Aujourd'hui, puis une pesée notée depuis sa carte.
      await expect(page.getByRole('heading', { name: 'Aujourd’hui', level: 1 })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Records récents', level: 2 })).toBeVisible()
      await expectAccessible(page, 'aujourd’hui')
      await page.getByRole('button', { name: 'Noter mon poids' }).click()
      const sheet = page.getByRole('dialog', { name: 'Noter mon poids' })
      await expect(sheet).toBeVisible()
      await expectAccessible(page, 'noter mon poids')
      await sheet.getByLabel('Poids').fill('79,5')
      await sheet.getByRole('button', { name: 'Enregistrer' }).click()
      await expect(page.getByText('79,5 kg')).toBeVisible()

      // Neuf jours plus tard : le rappel de sauvegarde en haut de l'accueil.
      await page.clock.setFixedTime(new Date('2026-10-30T10:00:00+01:00'))
      await page.reload()
      await expect(page.getByText('Pense à sauvegarder')).toBeVisible()
      await expectAccessible(page, 'aujourd’hui avec le rappel')

      for (const [path, heading] of [
        ['more/settings', 'Réglages'],
        ['more/backup', 'Sauvegarde'],
        ['more/about', 'À propos'],
      ] as const) {
        await page.goto(path)
        await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
        await expectAccessible(page, path)
      }

      // Sauvegarde : une copie de sécurité, puis les deux confirmations.
      await page.goto('more/backup')
      await page.getByRole('button', { name: 'Faire une copie maintenant' }).click()
      await page.getByRole('button', { name: /^Copie manuelle/ }).click()
      await expect(page.getByRole('dialog', { name: /^Revenir à cette copie/ })).toBeVisible()
      await expectAccessible(page, 'revenir à une copie')
      await page.getByRole('button', { name: 'Annuler' }).click()
      await page.getByRole('button', { name: 'Tout effacer' }).click()
      await expect(page.getByRole('dialog', { name: /^Tout effacer/ })).toBeVisible()
      await expectAccessible(page, 'tout effacer')
      await page.getByRole('button', { name: 'Annuler' }).click()
    })
  })
}
