import { expect, test, type Locator } from '@playwright/test'
import { collectErrors, onboard } from './nutrition-helpers'
import {
  clipFrames,
  personCameraStopped,
  playPersonCamera,
  usePersonCamera,
  watchOutside,
} from './person-camera'
import { openCounter, setDone, setReps, SQUATS, startFreeWorkout } from './rep-counter-helpers'
import { dumpOnFailure, sampleLoop } from './diag-dump'

dumpOnFailure()

/*
 * Le compteur caméra avec le vrai MediaPipe (WebAssembly et modèle servis par l'appli) sur une vraie vidéo :
 * la démo de Sports2D (e2e/media/sports2d-walk), où personne ne fait de squat. Dans Chromium et dans WebKit.
 */

// La caméra des tests sert ses images par page.route : sous WebKit, il faut bloquer le service worker.
test.use({ serviceWorkers: 'block' })

const CLIP = 'sports2d-walk'
const FPS = 10

/** « Silhouette trouvée : 74 images sur 77 » : les images où MediaPipe a trouvé quelqu'un. */
async function silhouettes(debug: Locator): Promise<number> {
  const line = (await debug.getByText(/^Silhouette trouvée/).textContent()) ?? ''
  const found = /^Silhouette trouvée\s:\s(\d+)\simages\ssur\s\d+$/.exec(line)
  if (!found?.[1]) throw new Error(`Ligne inattendue : ${line}`)
  return Number(found[1])
}

test('compteur caméra : MediaPipe tourne sur le téléphone, rien ne sort de l’appli, la marche n’est pas comptée', async ({
  page,
}) => {
  // Long parcours : MediaPipe se charge (11 Mo de WebAssembly), puis analyse tout le clip.
  test.setTimeout(120_000)
  const errors = collectErrors(page)
  const outside = watchOutside(page)
  await usePersonCamera(page, { clip: CLIP, fps: FPS })
  await onboard(page)
  await startFreeWorkout(page, [SQUATS])

  const sheet = await openCounter(page, SQUATS)
  await sheet.getByRole('button', { name: 'Ouvrir la caméra' }).click()
  // Le moteur se prépare (« Préparation du compteur… »), puis l'image de la caméra arrive.
  await expect(sheet.getByRole('status', { name: 'Consigne' })).toBeVisible({ timeout: 60_000 })
  await expect(sheet.getByText('Préparation du compteur…')).toBeHidden()
  await sheet.getByRole('button', { name: 'Infos de réglage' }).click()
  const debug = sheet.getByRole('region', { name: 'Réglage du compteur' })
  await expect(debug.getByText(/^Calcul\s:\sprocesseur$/)).toBeVisible()

  await playPersonCamera(page)
  const playedAt = Date.now()
  const samples = sampleLoop(page)
  try {
    await expect.poll(() => silhouettes(debug), { timeout: 30_000 }).toBeGreaterThanOrEqual(20)
  } catch (error) {
    console.log(`DIAGSAMPLES ${samples().join(' | ')}`)
    throw error
  }
  samples()
  // Tout le clip, puis encore 3 s sur sa dernière image : personne n'a fait de squat.
  const clipMs = (clipFrames(CLIP).length * 1000) / FPS
  await page.waitForTimeout(Math.max(0, playedAt + clipMs + 3_000 - Date.now()))
  await expect(sheet.getByRole('button', { name: 'Terminer la série' })).toBeVisible()
  await expect(sheet.getByRole('heading', { level: 3 })).toHaveCount(0)
  await expect(
    sheet.getByRole('status', { name: 'Répétitions comptées' }).filter({ hasText: /^[1-9]/ }),
  ).toHaveCount(0)

  // Rien de compté : la feuille se ferme tout de suite, et MediaPipe est libéré (landmarker.close()).
  await sheet.getByRole('button', { name: 'Fermer' }).click()
  await expect(sheet).toBeHidden()
  await page.waitForTimeout(1_000)
  expect(outside).toEqual([])
  expect(errors).toEqual([])
  expect(await personCameraStopped(page)).toBe(true)
  await expect(setDone(page, SQUATS)).toHaveAttribute('aria-pressed', 'false')
  await expect(setReps(page, SQUATS)).toHaveValue('')
})
