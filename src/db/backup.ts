import { z } from 'zod'
import { formatDay, formatTimeOf, localDateOf, nowISO, today } from '@/lib/dates'
import { newId } from '@/lib/ids'
import { frenchSpacing } from '@/lib/typography'
import { DATA_TABLES, DB_VERSION, db as defaultDb, type CaliTrackDB, type DataTableName } from './db'
import { TABLE_SCHEMAS } from './schema'
import { ensureSeeded } from './seed'
import type { Snapshot } from './types'

export const BACKUP_APP = 'CaliTrack'
/** Version du format de fichier. À augmenter (avec une conversion) si le format change. */
export const BACKUP_FORMAT = 1
/** Nombre de copies de sécurité internes conservées. */
export const MAX_SNAPSHOTS = 3

export type BackupTables = { [K in DataTableName]: z.infer<(typeof TABLE_SCHEMAS)[K]>[] }

export interface BackupFile {
  app: typeof BACKUP_APP
  format: number
  exportedAt: string
  dbVersion: number
  tables: BackupTables
}

export const TABLE_LABEL: Record<DataTableName, string> = {
  settings: 'réglages',
  profile: 'profil',
  locations: 'lieux',
  equipment: 'matériel',
  customExercises: 'exercices perso',
  exerciseMeta: 'notes d’exercices',
  programs: 'programmes',
  events: 'calendrier',
  eventSeries: 'séances récurrentes',
  workouts: 'séances',
  climbingSessions: 'escalade',
  gradeScales: 'cotations',
  goals: 'objectifs',
  bodyMetrics: 'mesures',
}

export interface BackupSummary {
  exportedAt: string
  workouts: number
  climbingSessions: number
  programs: number
  goals: number
  events: number
  bodyMetrics: number
}

function dataTables(database: CaliTrackDB) {
  return DATA_TABLES.map((name) => database.table(name))
}

/** Lit toutes les données de l'utilisateur. */
export async function collectBackup(database: CaliTrackDB = defaultDb): Promise<BackupFile> {
  const tables: Partial<Record<DataTableName, unknown[]>> = {}
  await database.transaction('r', dataTables(database), async () => {
    for (const name of DATA_TABLES) tables[name] = await database.table(name).toArray()
  })
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exportedAt: nowISO(),
    dbVersion: DB_VERSION,
    tables: tables as BackupTables,
  }
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup)
}

export function backupFileName(date: string = today()): string {
  return `calitrack-sauvegarde-${date}.json`
}

export function summarizeBackup(backup: BackupFile): BackupSummary {
  return {
    exportedAt: backup.exportedAt,
    workouts: backup.tables.workouts.length,
    climbingSessions: backup.tables.climbingSessions.length,
    programs: backup.tables.programs.length,
    goals: backup.tables.goals.length,
    events: backup.tables.events.length,
    bodyMetrics: backup.tables.bodyMetrics.length,
  }
}

const headerSchema = z.object({
  app: z.literal(BACKUP_APP),
  format: z.number().int().min(1),
  exportedAt: z.string(),
  dbVersion: z.number().int().min(1),
  tables: z.record(z.string(), z.unknown()),
})

export type ParseBackupResult = { ok: true; backup: BackupFile } | { ok: false; error: string }

function describePath(path: readonly PropertyKey[]): string {
  const [index, ...rest] = path
  const field = rest.filter((p) => typeof p === 'string').join('.')
  const position = typeof index === 'number' ? `élément ${index + 1}` : 'contenu'
  return field ? frenchSpacing(`${position}, champ « ${field} »`) : position
}

/** Vérifie entièrement un fichier de sauvegarde avant de l'importer. */
export function parseBackup(text: string): ParseBackupResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Ce fichier n’est pas une sauvegarde CaliTrack (contenu illisible).' }
  }
  const header = headerSchema.safeParse(raw)
  if (!header.success) {
    return { ok: false, error: 'Ce fichier n’est pas une sauvegarde CaliTrack.' }
  }
  if (header.data.format > BACKUP_FORMAT || header.data.dbVersion > DB_VERSION) {
    return {
      ok: false,
      error:
        'Cette sauvegarde vient d’une version plus récente de CaliTrack. Mets l’appli à jour puis réessaie.',
    }
  }
  const tables: Partial<Record<DataTableName, unknown[]>> = {}
  for (const name of DATA_TABLES) {
    const rows = header.data.tables[name] ?? []
    const parsed = z.array(TABLE_SCHEMAS[name]).safeParse(rows)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = issue ? describePath(issue.path) : 'contenu'
      return { ok: false, error: `Sauvegarde abîmée (${TABLE_LABEL[name]}, ${where}).` }
    }
    tables[name] = parsed.data
  }
  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      format: header.data.format,
      exportedAt: header.data.exportedAt,
      dbVersion: header.data.dbVersion,
      tables: tables as BackupTables,
    },
  }
}

async function replaceAll(backup: BackupFile, database: CaliTrackDB): Promise<void> {
  await database.transaction('rw', dataTables(database), async () => {
    for (const name of DATA_TABLES) {
      const table = database.table(name)
      await table.clear()
      await table.bulkPut(backup.tables[name])
    }
  })
  await ensureSeeded(database)
}

/** Garde une copie de l'état actuel dans l'appli (les plus anciennes sont supprimées). */
export async function createSnapshot(
  reason: Snapshot['reason'],
  database: CaliTrackDB = defaultDb,
): Promise<Snapshot> {
  const data = serializeBackup(await collectBackup(database))
  const snapshot: Snapshot = {
    id: newId(),
    createdAt: nowISO(),
    reason,
    sizeBytes: new TextEncoder().encode(data).length,
    data,
  }
  await database.snapshots.put(snapshot)
  const all = await database.snapshots.orderBy('createdAt').toArray()
  const excess = all.length - MAX_SNAPSHOTS
  if (excess > 0) await database.snapshots.bulkDelete(all.slice(0, excess).map((s) => s.id))
  return snapshot
}

/** Remplace toutes les données par celles de la sauvegarde, après une copie de sécurité. */
export async function restoreBackup(backup: BackupFile, database: CaliTrackDB = defaultDb): Promise<void> {
  await createSnapshot('before-import', database)
  await replaceAll(backup, database)
}

export async function restoreSnapshot(id: string, database: CaliTrackDB = defaultDb): Promise<void> {
  const snapshot = await database.snapshots.get(id)
  if (!snapshot) throw new Error('Copie de sécurité introuvable.')
  const parsed = parseBackup(snapshot.data)
  if (!parsed.ok) throw new Error(parsed.error)
  await createSnapshot('before-import', database)
  await replaceAll(parsed.backup, database)
}

/** Efface toutes les données (les copies de sécurité internes comprises) et repart de zéro. */
export async function resetAllData(database: CaliTrackDB = defaultDb): Promise<void> {
  await database.transaction('rw', [...dataTables(database), database.snapshots], async () => {
    for (const table of [...dataTables(database), database.snapshots]) await table.clear()
  })
  await ensureSeeded(database)
}

export function describeSnapshot(snapshot: Snapshot): string {
  const reason = snapshot.reason === 'before-import' ? 'Avant restauration' : 'Copie manuelle'
  return `${reason} · ${formatDay(localDateOf(snapshot.createdAt), 'd MMM yyyy')} à ${formatTimeOf(snapshot.createdAt)}`
}
