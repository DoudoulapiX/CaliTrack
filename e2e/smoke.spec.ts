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
  // La semaine en cours, ou la suivante quand celle-ci n'a plus de séance à faire.
  await expect(page.getByRole('heading', { name: /^(Cette semaine|La semaine prochaine)$/ })).toBeVisible()
  await page
    .getByRole('link', { name: /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) .+ : / })
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

test('séance libre : série cochée, repos qui défile, rechargement, puis bilan et historique', async ({
  page,
}) => {
  const errors = collectErrors(page)

  await page.goto('./')
  await page.getByRole('button', { name: 'Commencer' }).click()
  for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Terminer' }).click()
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  await nav.getByRole('link', { name: 'Entraînement' }).click()

  // Séance libre, avec des pompes ajoutées depuis le répertoire.
  await page.getByRole('button', { name: /^Séance libre/ }).click()
  await expect(page.getByRole('heading', { name: 'Séance libre', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Ajouter un exercice' }).click()
  const picker = page.getByRole('dialog', { name: 'Ajouter un exercice' })
  await picker.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill('pompes')
  await picker.getByRole('button', { name: /^Pompes\s?Sans matériel/ }).click()
  const pushups = page.getByRole('article', { name: 'Pompes' })
  await expect(pushups).toBeVisible()

  // Première série : 10 répétitions, cochée ; le repos défile vraiment.
  await pushups.getByRole('textbox', { name: 'Pompes, série 1 : répétitions' }).fill('10')
  const firstSet = pushups.getByRole('button', { name: 'Pompes, série 1 faite' })
  await firstSet.click()
  await expect(firstSet).toHaveAttribute('aria-pressed', 'true')
  const timer = page.getByRole('timer', { name: 'Repos restant' })
  await expect(timer).toBeVisible()
  const start = await timer.textContent()
  await expect(timer).not.toHaveText(start ?? '', { timeout: 5_000 })
  await expect(page.getByText(/Pompes · série 2 sur 3 · 10 rép\./)).toBeVisible()

  // L'appli fermée puis rouverte : la séance, la série et le repos sont toujours là.
  await page.reload()
  await expect(firstSet).toHaveAttribute('aria-pressed', 'true')
  await expect(pushups.getByRole('textbox', { name: 'Pompes, série 1 : répétitions' })).toHaveValue('10')
  await expect(timer).toBeVisible()

  // On peut quitter l'écran : la barre au-dessus des onglets ramène à la séance.
  await page.getByRole('button', { name: 'Retour' }).click()
  const bar = page.getByRole('link', { name: 'Reprendre la séance en cours : Séance libre' })
  await expect(bar).toBeVisible()
  await expect(bar).toContainText(/Repos \d:\d\d/)
  await bar.click()
  await expect(pushups).toBeVisible()

  // Fin de séance, bilan puis historique.
  await page.getByRole('button', { name: 'Passer' }).click()
  await page.getByRole('button', { name: 'Terminer la séance' }).click()
  const finish = page.getByRole('dialog', { name: 'Terminer la séance' })
  await finish.getByRole('radio', { name: 'Correct' }).click()
  await finish.getByRole('button', { name: 'Enregistrer la séance' }).click()
  await expect(page.getByText('Séance terminée')).toBeVisible()
  await expect(page.getByRole('link', { name: /^Pompes\s?10 rép\./ })).toBeVisible()
  await page.getByRole('button', { name: 'Terminé' }).click()
  await expect(bar).toBeHidden()
  await page.getByRole('link', { name: 'Historique' }).click()
  await expect(page.getByRole('link', { name: /^Séance libre/ })).toContainText('1 série · Correct')
  expect(errors).toEqual([])
})

test('calendrier : séance du programme passée, course ajoutée en deux touches, rechargement', async ({
  page,
}) => {
  const errors = collectErrors(page)
  // Un mercredi : le programme préparé à l'accueil (lundi, mercredi, vendredi) commence aujourd'hui.
  await page.clock.setFixedTime(new Date('2026-10-21T10:00:00+02:00'))

  await page.goto('./')
  await page.getByRole('button', { name: 'Commencer' }).click()
  for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Terminer' }).click()
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  // Le calendrier n'a pas d'onglet par défaut : on y va par « Plus ».
  await nav.getByRole('link', { name: 'Plus' }).click()
  await page.getByRole('link', { name: 'Calendrier' }).click()
  await expect(page.getByRole('heading', { name: 'Octobre 2026', level: 2 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mercredi 21 octobre · Aujourd’hui' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Vendredi 23 octobre, Corps complet/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Lundi 19 octobre$/ })).toBeVisible() // avant le début

  // La séance du jour : on la passe.
  const session = page.getByRole('button', { name: /^Corps complet/ })
  await session.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('button', { name: 'Commencer la séance' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Passer cette séance' }).click()
  await expect(page.getByText('Séance passée')).toBeVisible()
  await expect(session).toContainText('Passée')

  // Une course faite aujourd'hui : le + puis « Ajouter la séance ».
  await page.getByRole('button', { name: 'Ajouter une séance' }).click()
  await page
    .getByRole('dialog', { name: 'Nouvelle séance' })
    .getByRole('button', { name: 'Ajouter la séance' })
    .click()
  await expect(page.getByText('Séance ajoutée')).toBeVisible()
  const run = page.getByRole('button', { name: /^Course à pied/ })
  await expect(run).toContainText('Faite')

  // Tout reste après rechargement ; l'onglet Entraînement le montre aussi.
  await page.reload()
  await expect(run).toContainText('Faite')
  await expect(session).toContainText('Passée')
  await page.getByRole('button', { name: 'Mois suivant' }).click()
  await expect(page.getByRole('heading', { name: 'Novembre 2026', level: 2 })).toBeVisible()
  await nav.getByRole('link', { name: 'Entraînement' }).click()
  await expect(page.getByRole('heading', { name: 'Cette semaine' })).toBeVisible()
  await expect(
    page.getByRole('link', { name: /^mercredi 21 oct\. \(aujourd’hui\) : .+ \(passée\)$/ }),
  ).toBeVisible()
  await expect(page.getByText('Repos aujourd’hui')).toBeHidden()
  expect(errors).toEqual([])
})

test('objectifs : figure visée suivie dès l’accueil, poids noté, tout reste après rechargement', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.clock.setFixedTime(new Date('2026-10-21T10:00:00+02:00'))

  // Accueil : 80 kg, le muscle-up visé (par défaut) et 10 tractions au test de niveau.
  await page.goto('./')
  await page.getByRole('button', { name: 'Commencer' }).click()
  await page.getByLabel('Poids').fill('80')
  for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByLabel('Tractions').fill('10')
  await page.getByRole('button', { name: 'Terminer' }).click()
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()

  // Le muscle-up est déjà un objectif, et le test de niveau a validé sa première étape.
  await page.goto('goals')
  const muscleUp = page.getByRole('link', { name: /^Muscle-up \(sur l’accueil\)/ })
  await expect(muscleUp).toContainText('Étape 2 sur 6')
  await expect(muscleUp).toContainText(/16\s%/)
  await muscleUp.click()
  await expect(page.getByRole('heading', { name: 'Muscle-up', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: /^Étape 2 : / }).click()
  await page.getByRole('button', { name: 'Je l’ai réussie' }).click()
  await expect(page.getByText('Étape cochée')).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Avancement de « Muscle-up »' })).toHaveAttribute(
    'aria-valuenow',
    '33',
  )

  // Un objectif de poids, puis une pesée.
  await page.getByRole('button', { name: 'Objectifs', exact: true }).click()
  await page.getByRole('button', { name: 'Nouvel objectif' }).click()
  await page.getByRole('radio', { name: 'Poids', exact: true }).click()
  await expect(page.getByLabel('Poids actuel')).toHaveValue('80')
  await page.getByLabel('Poids visé').fill('75')
  await page.getByRole('button', { name: 'Créer l’objectif' }).click()
  await expect(page.getByRole('heading', { name: 'Peser 75 kg', level: 1 })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Peser 75 kg', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Noter mon poids' }).click()
  const sheet = page.getByRole('dialog', { name: 'Noter mon poids' })
  await sheet.getByLabel('Poids').fill('77,5')
  await sheet.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('progressbar', { name: 'Avancement de « Peser 75 kg »' })).toHaveAttribute(
    'aria-valuenow',
    '50',
  )

  // Tout reste après rechargement.
  await page.reload()
  await expect(page.getByText('77,5 kg · objectif 75 kg')).toBeVisible()
  await page.goto('goals')
  await expect(page.getByRole('link', { name: /^Peser 75 kg/ })).toContainText(/50\s%/)
  await expect(page.getByRole('link', { name: /^Muscle-up/ })).toContainText(/33\s%/)
  expect(errors).toEqual([])
})

test('escalade : blocs notés par couleur, séance gardée au rechargement, bilan, statistiques et niveaux', async ({
  page,
}) => {
  const errors = collectErrors(page)
  // Un samedi soir.
  await page.clock.setFixedTime(new Date('2026-10-24T18:00:00+02:00'))

  await page.goto('./')
  await page.getByRole('button', { name: 'Commencer' }).click()
  for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Terminer' }).click()
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  await nav.getByRole('link', { name: 'Escalade', exact: true }).click()
  await page.getByRole('button', { name: 'Commencer une séance' }).click()
  await expect(page.getByRole('heading', { name: 'Vertical’Art', level: 1 })).toBeVisible()
  await expect(nav).toBeHidden()

  // Un bleu du premier coup, puis un rouge au deuxième essai.
  await page.getByRole('button', { name: /^Bleu, .+\sajouter un bloc/ }).click()
  await page
    .getByRole('dialog', { name: 'Bloc bleu' })
    .getByRole('button', { name: 'Ajouter le bloc' })
    .click()
  await expect(page.getByRole('heading', { name: 'Blocs notés (1)' })).toBeVisible()
  await page.getByRole('button', { name: /^Rouge, .+\sajouter un bloc/ }).click()
  const red = page.getByRole('dialog', { name: 'Bloc rouge' })
  await red.getByRole('button', { name: 'Essais : plus' }).click()
  await expect(red.getByText('Réussi au 2e essai.')).toBeVisible()
  await red.getByRole('button', { name: 'Ajouter le bloc' }).click()
  await expect(page.getByRole('heading', { name: 'Blocs notés (2)' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Bleu, .+\(1 réussi\)$/ })).toBeVisible()

  // Rechargée, la séance est toujours en cours ; sa barre la rouvre depuis les onglets.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Blocs notés (2)' })).toBeVisible()
  await page.getByRole('button', { name: 'Escalade', exact: true }).click()
  await expect(page.getByText('Séance en cours')).toBeVisible()
  const bar = page.getByRole('link', { name: /^Reprendre la séance d’escalade en cours/ })
  await bar.click()
  await page.getByRole('button', { name: 'Terminer la séance' }).click()
  const finish = page.getByRole('dialog', { name: 'Terminer la séance' })
  await finish.getByLabel('Durée', { exact: true }).fill('90')
  await finish.getByRole('radio', { name: 'Dur', exact: true }).click()
  await finish.getByRole('button', { name: 'Enregistrer la séance' }).click()
  await expect(page.getByText('Séance terminée')).toBeVisible()
  await page.getByRole('button', { name: 'Terminé' }).click()
  await expect(page.getByRole('heading', { name: 'Dernières séances' })).toBeVisible()
  await expect(bar).toBeHidden()

  // Tout reste après rechargement : l'onglet, puis les statistiques.
  await page.reload()
  await expect(page.getByRole('link', { name: /^Samedi 24 octobre/ })).toContainText(
    'Vertical’Art · 1 h 30 · 2 blocs réussis · Dur',
  )
  await page.getByRole('link', { name: /^Statistiques/ }).click()
  await expect(page.getByRole('list', { name: 'Blocs réussis par séance' })).toContainText(
    /Samedi 24 octobre\s:\s2 réussis \(1 bloc bleu et 1 bloc rouge\)/,
  )

  // Un niveau de plus pour la salle, gardé lui aussi.
  await page.goto('climbing/grades')
  await page.getByRole('button', { name: 'Ajouter un niveau' }).click()
  const sheet = page.getByRole('dialog', { name: 'Nouveau niveau' })
  await sheet.getByLabel('Nom', { exact: true }).fill('Blanc')
  await sheet.getByRole('button', { name: 'Ajouter le niveau' }).click()
  await expect(page.getByText('Niveau ajouté')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /^Blanc/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('accueil : cartes, pesée, réglages appliqués, puis sauvegarde téléchargée et restaurée', async ({
  page,
}) => {
  const errors = collectErrors(page)
  // Un mercredi matin.
  await page.clock.setFixedTime(new Date('2026-10-21T10:00:00+02:00'))
  // Sans feuille de partage (comme sur un ordinateur), la sauvegarde se télécharge.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, value: undefined })
    Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: undefined })
  })

  // Accueil : 80 kg, le muscle-up visé (par défaut), 10 tractions au test de niveau.
  await page.goto('./')
  await page.getByRole('button', { name: 'Commencer' }).click()
  await page.getByLabel('Poids').fill('80')
  for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByLabel('Tractions').fill('10')
  await page.getByRole('button', { name: 'Terminer' }).click()
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  await expect(nav).toBeVisible()

  // L'écran Aujourd'hui et ses sept cartes, dans l'ordre par défaut (celle d'Oura attend la bague).
  await expect(page.getByRole('heading', { name: 'Aujourd’hui', level: 1 })).toBeVisible()
  await expect(page.getByText('Mercredi 21 octobre')).toBeVisible()
  const titles = page.getByRole('heading', { level: 2 })
  await expect(titles).toHaveText([
    'Au programme',
    'Calories du jour',
    'Ma semaine',
    'Objectifs',
    'Escalade',
    'Poids',
    'Records récents',
  ])
  await expect(page.getByRole('link', { name: /^Muscle-up\s:\s/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Mercredi 21 octobre, aujourd’hui/ })).toHaveAttribute(
    'aria-current',
    'date',
  )

  // Une pesée depuis la carte du poids.
  const weight = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Poids', level: 2 }) })
  await expect(weight).toContainText('80 kg')
  await weight.getByRole('button', { name: 'Noter mon poids' }).click()
  const sheet = page.getByRole('dialog', { name: 'Noter mon poids' })
  await sheet.getByLabel('Poids').fill('79,5')
  await sheet.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(weight).toContainText('79,5 kg')
  await expect(weight).toContainText(/Dernière pesée\s:\saujourd’hui/)

  // Réglages : sans la carte du poids, les objectifs en premier, sans escalade, en thème clair.
  await page.getByRole('link', { name: 'Personnaliser l’accueil' }).click()
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible()
  const cards = page.getByRole('list', { name: 'Cartes de l’accueil' })
  await cards.getByRole('switch', { name: 'Poids' }).click()
  for (let move = 0; move < 4; move++) {
    await cards.getByRole('button', { name: 'Objectifs épinglés : monter' }).click()
  }
  await page.getByRole('switch', { name: 'Module escalade' }).click()
  await expect(page.getByText('Escalade masquée')).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Escalade' })).toHaveCount(0)
  await page.getByRole('radiogroup', { name: 'Thème' }).getByRole('radio', { name: 'Clair' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await nav.getByRole('link', { name: 'Aujourd’hui' }).click()
  // L'accueil garde la barre finale de l'adresse (/CaliTrack/) : il se recharge sans erreur.
  await expect(page).toHaveURL(/\/CaliTrack\/$/)
  const shown = ['Objectifs', 'Au programme', 'Calories du jour', 'Ma semaine', 'Records récents']
  await expect(titles).toHaveText(shown)
  await page.reload()
  await expect(titles).toHaveText(shown)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  // La sauvegarde, téléchargée et notée.
  await page.goto('more/backup')
  await expect(page.getByText('0 séance, 0 séance d’escalade, 1 objectif')).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Enregistrer dans Fichiers' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('calitrack-sauvegarde-2026-10-21.json')
  const file = await download.path()
  await expect(page.getByText('Sauvegarde téléchargée')).toBeVisible()
  await expect(page.getByText('Aujourd’hui à 10:00')).toBeVisible()

  // Tout effacer ramène au premier lancement, d'où la sauvegarde se restaure.
  await page.getByRole('button', { name: 'Tout effacer' }).click()
  await page
    .getByRole('dialog', { name: /^Tout effacer/ })
    .getByRole('button', { name: 'Tout effacer' })
    .click()
  await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
  await page.getByLabel('Restaurer une sauvegarde').setInputFiles(file)
  const restore = page.getByRole('dialog', { name: /^Restaurer cette sauvegarde/ })
  await expect(restore).toContainText(
    /Sauvegarde du 21 octobre 2026\s:\s0\sséance, 0\sséance d’escalade, 1\sobjectif\./,
  )
  await restore.getByRole('button', { name: 'Restaurer' }).click()
  await expect(nav).toBeVisible()
  await expect(titles).toHaveText(shown)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  // Tout est revenu : la pesée, et la date de la sauvegarde.
  await page.goto('more/backup')
  await expect(page.getByText('Aujourd’hui à 10:00')).toBeVisible()
  await page.goto('more/settings')
  await page.getByRole('list', { name: 'Cartes de l’accueil' }).getByRole('switch', { name: 'Poids' }).click()
  await nav.getByRole('link', { name: 'Aujourd’hui' }).click()
  await expect(weight).toContainText('79,5 kg')
  expect(errors).toEqual([])
})
