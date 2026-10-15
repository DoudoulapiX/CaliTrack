import { expect, test, type Page } from '@playwright/test'
import { collectErrors, onboard } from './nutrition-helpers'
import { personCameraStopped, usePersonCamera, useReplayedPose, watchOutside } from './person-camera'
import {
  addExercise,
  openCounter,
  PULLUPS,
  setDone,
  setReps,
  SQUATS,
  startFreeWorkout,
} from './rep-counter-helpers'

/*
 * Le compteur caméra dans l'appli, avec un squelette rejoué (src/test/reps) à la place de MediaPipe et une
 * caméra grise : le même parcours dans Chromium et dans WebKit. MediaPipe lui-même : rep-counter-mediapipe.spec.ts.
 */

// La caméra et le squelette sont posés par des scripts d'init : sous WebKit, il faut bloquer le service worker.
test.use({ serviceWorkers: 'block' })

/** Une série rejouée dure 11 s, puis le compteur attend 6 s sans mouvement avant de finir la série. */
const SET_MS = 25_000

/** Les éléments flous (en-tête, barre d'onglets, fond de la feuille) : leur nom de balise. */
async function blurred(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const filtered = (style: CSSStyleDeclaration) =>
      ![undefined, '', 'none'].includes(
        style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter'),
      )
    const found: string[] = []
    for (const element of Array.from(document.querySelectorAll('*'))) {
      if (filtered(getComputedStyle(element))) found.push(element.tagName.toLowerCase())
    }
    for (const dialog of Array.from(document.querySelectorAll('dialog[open]'))) {
      if (filtered(getComputedStyle(dialog, '::backdrop'))) found.push('dialog::backdrop')
    }
    return found
  })
}

test('compteur caméra : 3 squats comptés, série enregistrée toute seule, repos lancé, compte corrigé', async ({
  page,
}) => {
  const errors = collectErrors(page)
  const outside = watchOutside(page)
  await usePersonCamera(page)
  await useReplayedPose(page, 'synth-squat-3')
  await onboard(page)
  await startFreeWorkout(page, [SQUATS])

  const sheet = await openCounter(page, SQUATS)
  await expect(sheet.getByRole('heading', { name: 'Place ton téléphone' })).toBeVisible()
  expect(await blurred(page)).not.toEqual([])
  await sheet.getByRole('button', { name: 'Ouvrir la caméra' }).click()
  // Caméra allumée : plus aucun flou derrière la feuille, qui se recalculerait à chaque image.
  await expect(page.locator('html')).toHaveAttribute('data-camera', '')
  expect(await blurred(page)).toEqual([])
  await expect(sheet.getByRole('status', { name: 'Répétitions comptées' })).toHaveText(/^3\srépétitions$/, {
    timeout: SET_MS,
  })
  await expect(sheet.getByText('Série enregistrée.')).toBeVisible({ timeout: SET_MS })
  await expect(sheet.getByRole('heading', { name: /^3\srépétitions$/ })).toBeVisible()
  await expect(sheet.getByRole('timer', { name: 'Repos avant la série suivante' })).toBeVisible()
  await expect(sheet.getByText(/^Ensuite\s:\ssérie\s2\ssur\s3\./)).toBeVisible()
  await expect(setDone(page, SQUATS)).toHaveAttribute('aria-pressed', 'true')

  // Une répétition oubliée : « Corriger », la série reste faite.
  await sheet.getByRole('button', { name: 'Corriger' }).click()
  await sheet.getByRole('button', { name: 'Répétitions : plus' }).click()
  await sheet.getByRole('button', { name: 'Enregistrer la correction' }).click()
  await expect(sheet.getByText('Correction enregistrée.')).toBeVisible()
  await expect(sheet.getByRole('heading', { name: /^4\srépétitions$/ })).toBeVisible()

  // Une série enregistrée se ferme tout de suite ; la caméra s'éteint, le repos continue.
  await sheet.getByRole('button', { name: 'Fermer' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.locator('html')).not.toHaveAttribute('data-camera')
  expect(await blurred(page)).not.toEqual([])
  await expect(setDone(page, SQUATS)).toHaveAttribute('aria-pressed', 'true')
  await expect(setReps(page, SQUATS)).toHaveValue('4')
  await expect(page.getByRole('timer', { name: 'Repos restant' })).toBeVisible()
  expect(await personCameraStopped(page)).toBe(true)
  expect(outside).toEqual([])
  expect(errors).toEqual([])
})

test('compteur caméra : tractions en essai, le compte attend ta vérification', async ({ page }) => {
  const errors = collectErrors(page)
  const outside = watchOutside(page)
  await usePersonCamera(page)
  await useReplayedPose(page, 'synth-pullup-3')
  await onboard(page)
  await startFreeWorkout(page, [PULLUPS])

  const sheet = await openCounter(page, PULLUPS)
  await expect(sheet.getByText(/^Ce compteur est encore en essai pour cet exercice/)).toBeVisible()
  await sheet.getByRole('button', { name: 'Ouvrir la caméra' }).click()
  await expect(sheet.getByRole('heading', { name: /^3\srépétitions\s\?$/ })).toBeVisible({ timeout: SET_MS })
  await expect(sheet.getByText('ce compteur est encore en essai pour cet exercice.')).toBeVisible()
  // Rien n'est enregistré avant la vérification.
  await expect(setDone(page, PULLUPS)).toHaveAttribute('aria-pressed', 'false')

  await sheet.getByRole('button', { name: /^Enregistrer 3\srépétitions$/ }).click()
  await expect(sheet.getByText('Série enregistrée.')).toBeVisible()
  await sheet.getByRole('button', { name: 'Fermer' }).click()
  await expect(sheet).toBeHidden()
  await expect(setDone(page, PULLUPS)).toHaveAttribute('aria-pressed', 'true')
  await expect(setReps(page, PULLUPS)).toHaveValue('3')
  expect(await personCameraStopped(page)).toBe(true)
  expect(outside).toEqual([])
  expect(errors).toEqual([])
})

test('compteur caméra : accès refusé', async ({ page }) => {
  const errors = collectErrors(page)
  const outside = watchOutside(page)
  await usePersonCamera(page, { deny: true })
  await useReplayedPose(page, 'synth-squat-3')
  await onboard(page)
  await startFreeWorkout(page, [SQUATS])

  const sheet = await openCounter(page, SQUATS)
  await sheet.getByRole('button', { name: 'Ouvrir la caméra' }).click()
  const denied =
    'CaliTrack n’a pas accès à la caméra. Autorise-la dans Réglages › Safari › Appareil photo, puis réessaie.'
  await expect(sheet.getByRole('alert')).toHaveText(denied)
  // Toujours refusé : le même message revient.
  await sheet.getByRole('button', { name: 'Réessayer' }).click()
  await expect(sheet.getByRole('alert')).toHaveText(denied)

  await sheet.getByRole('button', { name: 'Fermer' }).click()
  await expect(sheet).toBeHidden()
  await expect(setDone(page, SQUATS)).toHaveAttribute('aria-pressed', 'false')
  await expect(setReps(page, SQUATS)).toHaveValue('')
  expect(outside).toEqual([])
  expect(errors).toEqual([])
})

test('compteur caméra : conseils au premier lancement seulement', async ({ page }) => {
  const errors = collectErrors(page)
  const outside = watchOutside(page)
  await usePersonCamera(page)
  // Quelqu'un qui marche : rien n'est compté, la feuille se ferme tout de suite.
  await useReplayedPose(page, 'sports2d-walk')
  await onboard(page)
  await startFreeWorkout(page, [SQUATS])
  const guide = (sheet: ReturnType<typeof page.getByRole>) =>
    sheet.getByRole('heading', { name: 'Place ton téléphone' })
  const live = (sheet: ReturnType<typeof page.getByRole>) => sheet.getByRole('status', { name: 'Consigne' })

  let sheet = await openCounter(page, SQUATS)
  await expect(guide(sheet)).toBeVisible()
  await sheet.getByRole('button', { name: 'Ouvrir la caméra' }).click()
  await expect(live(sheet)).toBeVisible()
  await sheet.getByRole('button', { name: 'Fermer' }).click()
  await expect(sheet).toBeHidden()

  // Les fois suivantes, même après avoir rouvert l'appli, la caméra s'ouvre tout de suite.
  sheet = await openCounter(page, SQUATS)
  await expect(live(sheet)).toBeVisible()
  await expect(guide(sheet)).toBeHidden()
  await sheet.getByRole('button', { name: 'Fermer' }).click()
  await expect(sheet).toBeHidden()
  await page.reload()
  sheet = await openCounter(page, SQUATS)
  await expect(live(sheet)).toBeVisible()
  await expect(guide(sheet)).toBeHidden()
  // « Conseils de placement » les remontre à la demande.
  await sheet.getByRole('button', { name: 'Conseils de placement' }).click()
  await expect(guide(sheet)).toBeVisible()
  await sheet.getByRole('button', { name: 'Fermer' }).click()
  await expect(sheet).toBeHidden()

  // Chaque mouvement a ses conseils : la première fois pour les tractions, ils s'affichent.
  await addExercise(page, PULLUPS)
  sheet = await openCounter(page, PULLUPS)
  await expect(guide(sheet)).toBeVisible()
  await expect(sheet.getByText(/^Pose le téléphone au sol, à 2\sou\s3\smètres de la barre/)).toBeVisible()
  await sheet.getByRole('button', { name: 'Fermer' }).click()
  await expect(sheet).toBeHidden()
  expect(await personCameraStopped(page)).toBe(true)
  expect(outside).toEqual([])
  expect(errors).toEqual([])
})
