import { expect, type Locator, type Page } from '@playwright/test'

/** Un exercice à ajouter à une séance libre : ce qu'on tape, son nom, et sa ligne dans la liste. */
export interface PickedExercise {
  readonly search: string
  readonly name: string
  readonly row: RegExp
  /** Hors du matériel noté au premier lancement (onboard n'en note aucun) : il faut tout le répertoire. */
  readonly needsEquipment: boolean
}

export const SQUATS: PickedExercise = {
  search: 'squat au poids',
  name: 'Squat au poids du corps',
  row: /^Squat au poids du corps\s?Sans matériel/,
  needsEquipment: false,
}

export const PULLUPS: PickedExercise = {
  search: 'tractions',
  name: 'Tractions',
  row: /^Tractions\s?Barre de traction/,
  needsEquipment: true,
}

/** Ajoute un exercice à la séance en cours, depuis le répertoire. */
export async function addExercise(page: Page, exercise: PickedExercise): Promise<Locator> {
  await page.getByRole('button', { name: 'Ajouter un exercice' }).click()
  const picker = page.getByRole('dialog', { name: 'Ajouter un exercice' })
  if (exercise.needsEquipment) {
    // Le répertoire s'ouvre filtré sur ton matériel : on enlève le filtre.
    const mine = picker.getByRole('button', { name: 'Avec mon matériel' })
    await expect(mine).toHaveAttribute('aria-pressed', 'true')
    await mine.click()
    await expect(mine).toHaveAttribute('aria-pressed', 'false')
  }
  await picker.getByRole('searchbox', { name: 'Rechercher un exercice' }).fill(exercise.search)
  await picker.getByRole('button', { name: exercise.row }).first().click()
  const card = page.getByRole('article', { name: exercise.name })
  await expect(card).toBeVisible()
  return card
}

/** Lance une séance libre (accueil déjà passé) avec ces exercices. */
export async function startFreeWorkout(page: Page, exercises: readonly PickedExercise[]): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  await nav.getByRole('link', { name: 'Entraînement' }).click()
  await page.getByRole('button', { name: /^Séance libre/ }).click()
  await expect(page.getByRole('heading', { name: 'Séance libre', level: 1 })).toBeVisible()
  for (const exercise of exercises) await addExercise(page, exercise)
}

/** « Compter à la caméra » sur la carte de l'exercice : rend la feuille du compteur (série `set`). */
export async function openCounter(page: Page, exercise: PickedExercise, set = 1): Promise<Locator> {
  await page
    .getByRole('article', { name: exercise.name })
    .getByRole('button', { name: `Compter à la caméra : ${exercise.name}` })
    .click()
  const sheet = page.getByRole('dialog', { name: `${exercise.name}, série ${String(set)}` })
  await expect(sheet).toBeVisible()
  return sheet
}

/** La case « série faite » d'une série de l'exercice. */
export function setDone(page: Page, exercise: PickedExercise, set = 1): Locator {
  return page
    .getByRole('article', { name: exercise.name })
    .getByRole('button', { name: `${exercise.name}, série ${String(set)} faite` })
}

/** Le champ des répétitions d'une série de l'exercice. */
export function setReps(page: Page, exercise: PickedExercise, set = 1): Locator {
  return page
    .getByRole('article', { name: exercise.name })
    .getByRole('textbox', { name: `${exercise.name}, série ${String(set)} : répétitions` })
}
