import { expect, test } from '@playwright/test'
import { expectAccessible } from './a11y-helpers'
import { CLAUDE_KEY, fakeClaude, onboard, solidPng } from './nutrition-helpers'
import { configureOura, fakeOura, OURA_TOKEN } from './oura-helpers'
import { usePersonCamera, useReplayedPose } from './person-camera'
import { openCounter, PULLUPS, SQUATS, startFreeWorkout } from './rep-counter-helpers'

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

    test.describe(() => {
      // Les services simulés exigent de bloquer le service worker (voir oura.spec.ts).
      test.use({ serviceWorkers: 'block' })

      test('nutrition, IA et Oura accessibles', async ({ page }) => {
        test.slow()
        // Un mercredi midi.
        await page.clock.setFixedTime(new Date('2026-10-21T12:30:00+02:00'))
        // Sans caméra : l'écran du scan propose de taper le code, dans tous les navigateurs.
        await page.addInitScript(() => {
          Object.defineProperty(Navigator.prototype, 'mediaDevices', {
            configurable: true,
            get: () => undefined,
          })
        })
        await fakeClaude(page)
        await fakeOura(page)
        await onboard(page)

        // Le journal, l'ajout d'un aliment et sa quantité.
        await page.goto('nutrition')
        await expect(page.getByRole('heading', { name: 'Nutrition', level: 1 })).toBeVisible()
        await expectAccessible(page, 'nutrition')
        await page.getByRole('link', { name: 'Ajouter au déjeuner' }).click()
        await expect(page.getByRole('link', { name: 'Scanner un produit' })).toBeVisible()
        await expectAccessible(page, 'ajouter un aliment')
        await page.getByRole('button', { name: 'Saisie rapide' }).click()
        await expect(page.getByRole('dialog', { name: 'Saisie rapide' })).toBeVisible()
        await expectAccessible(page, 'saisie rapide')
        await page.getByRole('button', { name: 'Fermer' }).click()
        await page.getByRole('searchbox', { name: 'Chercher un aliment' }).fill('riz blanc cuit')
        await page.getByRole('button', { name: /^Riz blanc, cuit, sans sel/ }).click()
        const rice = page.getByRole('dialog', { name: /^Riz blanc, cuit, sans sel/ })
        await expect(rice.getByLabel('Quantité', { exact: true })).toHaveValue('110')
        await expectAccessible(page, 'quantité')
        await rice.getByRole('button', { name: 'Ajouter au déjeuner' }).click()
        await expect(rice).toBeHidden()
        await expectAccessible(page, 'recherche')

        await page.goto('nutrition')
        await page.getByRole('list', { name: 'Déjeuner' }).getByRole('button').first().click()
        await expect(page.getByRole('dialog', { name: /^Riz blanc, cuit, sans sel/ })).toBeVisible()
        await expectAccessible(page, 'aliment noté')
        await page.getByRole('button', { name: 'Fermer' }).click()

        for (const [path, heading] of [
          ['nutrition/scan', 'Scanner un produit'],
          ['nutrition/targets', 'Objectifs caloriques'],
          ['nutrition/foods', 'Mes aliments'],
          ['nutrition/foods/new', 'Nouvel aliment'],
          ['nutrition/photo', 'Photo du repas'],
          ['more/ai', 'Intelligence artificielle'],
        ] as const) {
          await page.goto(path)
          await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
          await expect(page.getByText('Chargement…', { exact: true })).toHaveCount(0)
          await expectAccessible(page, path)
        }

        // La photo d'un repas, analysée par Claude (simulé), puis la correction d'un aliment.
        await page.getByLabel('Clé API Claude').fill(CLAUDE_KEY)
        await page.getByRole('button', { name: 'Enregistrer la clé' }).click()
        await expect(page.getByText('sk-ant-…ghij')).toBeVisible()
        await expectAccessible(page, 'clé enregistrée')

        // Les écrans du coach IA, la clé enregistrée (sans elle, ils renvoient aux réglages de l'IA), chacun
        // mesuré une fois prêt à servir.
        for (const [path, heading, ready] of [
          ['training/coach', 'Coach du jour', page.getByRole('button', { name: 'Demander au coach' })],
          ['nutrition/body', 'Coach physique', page.getByRole('button', { name: 'Analyser mes photos' })],
          [
            'nutrition/kitchen',
            'Frigo et placards',
            page.getByRole('link', { name: 'Photographier mon frigo' }),
          ],
          [
            'nutrition/kitchen/ideas',
            'Idées de repas',
            page.getByRole('button', { name: 'Proposer des idées' }),
          ],
          ['more/coach', 'Discussion avec le coach', page.getByLabel('Ton message')],
        ] as const) {
          await page.goto(path)
          await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
          await expect(ready).toBeVisible()
          await expect(page.getByText('Chargement…', { exact: true })).toHaveCount(0)
          await expectAccessible(page, path)
        }

        await page.goto('nutrition/photo?meal=lunch')
        await page.getByLabel('Prendre ou choisir une photo').setInputFiles({
          name: 'IMG_0002.png',
          mimeType: 'image/png',
          buffer: solidPng(400, 300, [200, 140, 60]),
        })
        await expect(page.getByRole('button', { name: 'Analyser la photo' })).toBeVisible()
        await expectAccessible(page, 'photo choisie')
        await page.getByRole('button', { name: 'Analyser la photo' }).click()
        const found = page.getByRole('list', { name: 'Aliments reconnus' })
        await expect(found.getByRole('button')).toHaveCount(2)
        await expectAccessible(page, 'aliments reconnus')
        await found.getByRole('button').first().click()
        await expect(page.getByRole('dialog', { name: 'Corriger l’aliment' })).toBeVisible()
        await expectAccessible(page, 'corriger l’aliment')
        await page.getByRole('button', { name: 'Fermer' }).click()

        // Oura : les réglages, le retour ouvert hors de l'appli, puis la bague connectée.
        await configureOura(page)
        await expectAccessible(page, 'oura prête')
        await page.goto(
          `oura/callback#access_token=${OURA_TOKEN}&token_type=bearer&expires_in=2592000&state=ailleurs`,
        )
        await expect(page.getByRole('heading', { name: 'Dernière étape', level: 2 })).toBeVisible()
        await expectAccessible(page, 'oura dernière étape')
        const link = await page.getByLabel('Lien de retour').inputValue()
        await page.goto('more/oura')
        await page.getByLabel('Lien de retour').fill(link)
        await page.getByRole('button', { name: 'Valider le lien' }).click()
        await expect(page.getByText('Synchronisée aujourd’hui à 12:30')).toBeVisible()
        await expectAccessible(page, 'oura connectée')
        await page.goto('./')
        await expect(page.getByText('Cette nuit')).toBeVisible()
        await expectAccessible(page, 'aujourd’hui avec Oura')
        await page.goto('oura/callback#error=access_denied')
        await expect(page.getByRole('heading', { name: 'Accès refusé', level: 2 })).toBeVisible()
        await expectAccessible(page, 'oura refusée')
      })
    })

    test.describe(() => {
      // La caméra des tests et le squelette rejoué passent par des scripts d'init : service worker bloqué.
      test.use({ serviceWorkers: 'block' })
      /** Une série rejouée dure 11 s, puis le compteur attend 6 s sans mouvement avant de la finir. */
      const SET_MS = 25_000

      test('compteur caméra accessible : série comptée', async ({ page }) => {
        test.slow()
        await usePersonCamera(page)
        await useReplayedPose(page, 'synth-squat-3')
        await onboard(page)
        await startFreeWorkout(page, [SQUATS])

        const sheet = await openCounter(page, SQUATS)
        await expect(sheet.getByRole('heading', { name: 'Place ton téléphone' })).toBeVisible()
        await expectAccessible(page, 'compteur caméra : conseils')
        await sheet.getByRole('button', { name: 'Ouvrir la caméra' }).click()
        await expect(sheet.getByRole('status', { name: 'Consigne' })).toBeVisible()
        await expectAccessible(page, 'compteur caméra : en direct')
        await sheet.getByRole('button', { name: 'Infos de réglage' }).click()
        await expect(sheet.getByRole('region', { name: 'Réglage du compteur' })).toBeVisible()
        await expectAccessible(page, 'compteur caméra : infos de réglage')
        await sheet.getByRole('button', { name: 'Infos de réglage' }).click()
        await expect(sheet.getByRole('region', { name: 'Réglage du compteur' })).toBeHidden()

        await expect(sheet.getByText('Série enregistrée.')).toBeVisible({ timeout: SET_MS })
        await expect(sheet.getByRole('timer', { name: 'Repos avant la série suivante' })).toBeVisible()
        await expectAccessible(page, 'compteur caméra : série enregistrée')
        await sheet.getByRole('button', { name: 'Corriger' }).click()
        await expect(sheet.getByRole('button', { name: 'Enregistrer la correction' })).toBeVisible()
        await expectAccessible(page, 'compteur caméra : correction')
        await sheet.getByRole('button', { name: 'Fermer' }).click()
        await expect(sheet).toBeHidden()
      })

      test('compteur caméra accessible : à vérifier', async ({ page }) => {
        test.slow()
        await usePersonCamera(page)
        await useReplayedPose(page, 'synth-pullup-3')
        await onboard(page)
        await startFreeWorkout(page, [PULLUPS])

        const sheet = await openCounter(page, PULLUPS)
        await sheet.getByRole('button', { name: 'Ouvrir la caméra' }).click()
        await expect(sheet.getByRole('heading', { name: /^3\srépétitions\s\?$/ })).toBeVisible({
          timeout: SET_MS,
        })
        await expectAccessible(page, 'compteur caméra : à vérifier')
        await sheet.getByRole('button', { name: 'Fermer' }).click()
        await expect(sheet.getByRole('button', { name: 'Fermer sans enregistrer' })).toBeVisible()
        await expectAccessible(page, 'compteur caméra : fermer sans enregistrer')
        await sheet.getByRole('button', { name: 'Fermer sans enregistrer' }).click()
        await expect(sheet).toBeHidden()
      })

      test('compteur caméra accessible : accès refusé', async ({ page }) => {
        await usePersonCamera(page, { deny: true })
        await onboard(page)
        await startFreeWorkout(page, [SQUATS])

        const sheet = await openCounter(page, SQUATS)
        await sheet.getByRole('button', { name: 'Ouvrir la caméra' }).click()
        await expect(sheet.getByRole('alert')).toContainText('CaliTrack n’a pas accès à la caméra.')
        await expectAccessible(page, 'compteur caméra : accès refusé')
      })
    })
  })
}
