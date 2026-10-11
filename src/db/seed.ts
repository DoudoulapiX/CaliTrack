import { defaultGradeScales } from '@/content/grades'
import { db as defaultDb, type CaliTrackDB } from './db'
import { defaultNutritionGoals, defaultProfile, defaultSettings } from './defaults'

/**
 * Crée les données de départ si elles manquent (premier lancement, ou après une remise à zéro).
 * Ne remplace jamais ce que l'utilisateur a déjà modifié.
 */
export async function ensureSeeded(database: CaliTrackDB = defaultDb): Promise<void> {
  const tables = [database.settings, database.profile, database.gradeScales, database.nutritionGoals]
  await database.transaction('rw', tables, async () => {
    if (!(await database.settings.get('app'))) await database.settings.put(defaultSettings())
    if (!(await database.profile.get('me'))) await database.profile.put(defaultProfile())
    if (!(await database.nutritionGoals.get('me'))) await database.nutritionGoals.put(defaultNutritionGoals())
    for (const scale of defaultGradeScales()) {
      if (!(await database.gradeScales.get(scale.id))) await database.gradeScales.put(scale)
    }
  })
}

/** Demande au navigateur de ne pas effacer les données (utile sur iPhone). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('storage' in navigator)) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
