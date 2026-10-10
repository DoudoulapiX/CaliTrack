import { db } from '@/db/db'

/** Vide toutes les tables entre deux tests. */
export async function resetDb(): Promise<void> {
  if (!db.isOpen()) await db.open()
  await Promise.all(db.tables.map((table) => table.clear()))
}
