import { nowISO } from '@/lib/dates'
import { db as defaultDb, type CaliTrackDB } from './db'
import type { Secret } from './types'

/** Enregistre une clé ou un jeton sur cet appareil (jamais dans les sauvegardes). */
export async function saveSecret(
  id: Secret['id'],
  value: string,
  expiresAt: string | null = null,
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  await database.secrets.put({ id, value: value.trim(), expiresAt, updatedAt: nowISO() })
}

export async function deleteSecret(id: Secret['id'], database: CaliTrackDB = defaultDb): Promise<void> {
  await database.secrets.delete(id)
}

/** La valeur d'un secret encore valable, sinon null (absent, vide ou expiré). */
export function validSecret(secret: Secret | undefined, now: Date = new Date()): string | null {
  if (!secret || secret.value === '') return null
  if (secret.expiresAt !== null && new Date(secret.expiresAt).getTime() <= now.getTime()) return null
  return secret.value
}
