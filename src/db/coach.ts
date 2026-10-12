import { nowISO, type ISODate } from '@/lib/dates'
import { newId } from '@/lib/ids'
import { normalizeName } from '@/lib/text'
import { db as defaultDb, type CaliTrackDB } from './db'
import { updateNutritionGoals } from './nutrition'
import { bodyReviewSchema, coachDaySchema, coachMessageSchema, pantryItemSchema } from './schema'
import type { BodyReview, CoachDay, PantryItem, PantryPlace } from './types'

/*
 * Écritures du coach IA. Chaque ligne est vérifiée par son schéma avant d'être enregistrée : une ligne
 * invalide lève une erreur et rien n'est écrit.
 */

/* ------------------------------------------------------------------ */
/* Coach du jour                                                       */
/* ------------------------------------------------------------------ */

/** Enregistre le conseil du jour (il remplace celui déjà donné ce jour-là). */
export async function saveCoachDay(day: CoachDay, database: CaliTrackDB = defaultDb): Promise<void> {
  await database.coachDays.put(coachDaySchema.parse(day))
}

/** « Revenir à la séance prévue » (true) ou « Reprendre le conseil du coach » (false). */
export async function setCoachDayIgnored(
  date: ISODate,
  ignored: boolean,
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  await database.transaction('rw', database.coachDays, async () => {
    const day = await database.coachDays.get(date)
    if (!day) throw new Error('Conseil du coach introuvable.')
    await database.coachDays.put(coachDaySchema.parse({ ...day, ignored, updatedAt: nowISO() }))
  })
}

/* ------------------------------------------------------------------ */
/* Coach physique                                                      */
/* ------------------------------------------------------------------ */

/** Enregistre une analyse physique (elle remplace celle déjà faite ce jour-là). */
export async function saveBodyReview(review: BodyReview, database: CaliTrackDB = defaultDb): Promise<void> {
  await database.bodyReviews.put(bodyReviewSchema.parse(review))
}

/**
 * Applique la phase conseillée aux objectifs caloriques, en effaçant si demandé les valeurs fixées à la
 * main. Aucun nombre n'est écrit : les objectifs restent calculés par CaliTrack d'après la phase.
 */
export async function applyBodyReview(
  date: ISODate,
  opts: { resetOverrides: boolean; now?: string },
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  const now = opts.now ?? nowISO()
  await database.transaction('rw', [database.nutritionGoals, database.bodyReviews], async () => {
    const review = await database.bodyReviews.get(date)
    if (!review) throw new Error('Analyse physique introuvable.')
    const reset = opts.resetOverrides ? { kcal: null, proteinG: null, carbsG: null, fatG: null } : {}
    const applied = bodyReviewSchema.parse({ ...review, appliedAt: now, updatedAt: now })
    await updateNutritionGoals({ phase: review.phase, ...reset }, database)
    await database.bodyReviews.put(applied)
  })
}

/* ------------------------------------------------------------------ */
/* Frigo et placards                                                   */
/* ------------------------------------------------------------------ */

export interface PantryInput {
  place: PantryPlace
  name: string
  quantity: string
}

export type PantryPatch = Partial<PantryInput>

function pantryRow(input: PantryInput, source: PantryItem['source'], now: string): PantryItem {
  return pantryItemSchema.parse({
    id: newId(),
    place: input.place,
    name: input.name.trim(),
    quantity: input.quantity.trim(),
    source,
    createdAt: now,
    updatedAt: now,
  })
}

/** Ajoute un aliment à la main. */
export async function addPantryItem(
  input: PantryInput,
  database: CaliTrackDB = defaultDb,
): Promise<PantryItem> {
  const item = pantryRow(input, 'manual', nowISO())
  await database.pantryItems.put(item)
  return item
}

/** Change le nom, la quantité ou la place d'un aliment. */
export async function updatePantryItem(
  id: string,
  patch: PantryPatch,
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  await database.transaction('rw', database.pantryItems, async () => {
    const item = await database.pantryItems.get(id)
    if (!item) throw new Error('Aliment introuvable.')
    await database.pantryItems.put(
      pantryItemSchema.parse({
        ...item,
        place: patch.place ?? item.place,
        name: (patch.name ?? item.name).trim(),
        quantity: (patch.quantity ?? item.quantity).trim(),
        updatedAt: nowISO(),
      }),
    )
  })
}

export async function deletePantryItem(id: string, database: CaliTrackDB = defaultDb): Promise<void> {
  await database.pantryItems.delete(id)
}

/**
 * Enregistre les aliments vus sur une photo, dans une seule transaction. « merge » ajoute ceux qui ne sont
 * pas déjà à cette place (noms comparés sans casse, accents ni espaces en trop) ; « replace » vide d'abord
 * cette place, et elle seule. Renvoie le nombre d'aliments ajoutés.
 */
export async function applyPantryChanges(
  args: {
    place: PantryPlace
    names: readonly { name: string; quantity: string }[]
    mode: 'merge' | 'replace'
  },
  database: CaliTrackDB = defaultDb,
): Promise<number> {
  const now = nowISO()
  return database.transaction('rw', database.pantryItems, async () => {
    const current = await database.pantryItems.where('place').equals(args.place).toArray()
    const seen = new Set(args.mode === 'merge' ? current.map((item) => normalizeName(item.name)) : [])
    const added: PantryItem[] = []
    for (const { name, quantity } of args.names) {
      const key = normalizeName(name)
      if (seen.has(key)) continue
      seen.add(key)
      added.push(pantryRow({ place: args.place, name, quantity }, 'photo', now))
    }
    if (args.mode === 'replace') await database.pantryItems.bulkDelete(current.map((item) => item.id))
    await database.pantryItems.bulkPut(added)
    return added.length
  })
}

/* ------------------------------------------------------------------ */
/* Discussion                                                          */
/* ------------------------------------------------------------------ */

/** Messages gardés dans la discussion : au-delà, les plus anciens sont effacés. */
export const CHAT_MAX_STORED = 200
/** Longueur maximale d'un message enregistré (une réponse plus longue est coupée). */
export const CHAT_TEXT_MAX = 20000

function chatText(text: string): string {
  const trimmed = text.trim().slice(0, CHAT_TEXT_MAX).trimEnd()
  if (!trimmed) throw new Error('Message vide.')
  return trimmed
}

/**
 * Enregistre une question et la réponse du coach, à la suite de la discussion, dans une seule
 * transaction ; ne garde ensuite que les CHAT_MAX_STORED derniers messages.
 */
export async function appendChatExchange(
  args: { user: string; assistant: string; model: string; now?: string },
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  const user = chatText(args.user)
  const assistant = chatText(args.assistant)
  const now = args.now ?? nowISO()
  await database.transaction('rw', database.coachMessages, async () => {
    const last = await database.coachMessages.orderBy('seq').last()
    const seq = (last?.seq ?? -1) + 1
    const question = coachMessageSchema.parse({
      id: newId(),
      seq,
      role: 'user',
      text: user,
      model: null,
      createdAt: now,
    })
    const answer = coachMessageSchema.parse({
      id: newId(),
      seq: seq + 1,
      role: 'assistant',
      text: assistant,
      model: args.model,
      createdAt: now,
    })
    await database.coachMessages.put(question)
    await database.coachMessages.put(answer)
    const excess = (await database.coachMessages.count()) - CHAT_MAX_STORED
    if (excess > 0) {
      await database.coachMessages.bulkDelete(
        await database.coachMessages.orderBy('seq').limit(excess).primaryKeys(),
      )
    }
  })
}

/** Efface toute la discussion. */
export async function clearChat(database: CaliTrackDB = defaultDb): Promise<void> {
  await database.coachMessages.clear()
}
