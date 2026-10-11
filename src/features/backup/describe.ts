import { summarizeBackup, type BackupFile } from '@/db/backup'
import type { AppSettings } from '@/db/types'
import { diffDays, formatDay, formatTimeOf, localDateOf, type ISODate } from '@/lib/dates'
import { frenchSpacing, NBSP } from '@/lib/typography'

/** « 12 séances » : le nombre reste avec son nom en fin de ligne. */
function count(value: number, word: string, complement = ''): string {
  return `${String(value)}${NBSP}${word}${value > 1 ? 's' : ''}${complement}`
}

/**
 * Ce que contient une sauvegarde : « 12 séances, 4 séances d’escalade, 3 objectifs », puis les aliments
 * notés dans le journal des repas s'il y en a.
 */
export function describeContents(backup: BackupFile): string {
  const summary = summarizeBackup(backup)
  const foods = summary.foodEntries
  return [
    count(summary.workouts, 'séance'),
    count(summary.climbingSessions, 'séance', ' d’escalade'),
    count(summary.goals, 'objectif'),
    ...(foods > 0 ? [count(foods, 'aliment', foods > 1 ? ' notés' : ' noté')] : []),
  ].join(', ')
}

/** Ce que contient une sauvegarde, en une phrase. */
export function describeBackup(backup: BackupFile): string {
  const day = formatDay(localDateOf(backup.exportedAt), 'd MMMM yyyy')
  return frenchSpacing(`Sauvegarde du ${day} : ${describeContents(backup)}.`)
}

/** Quand a eu lieu la dernière sauvegarde : « Jamais », « Aujourd’hui à 18:42 », « Le 3 octobre, il y a 8 jours ». */
export function lastBackupLine(lastBackupAt: string | null, today: ISODate): string {
  if (lastBackupAt === null) return 'Jamais'
  const day = localDateOf(lastBackupAt)
  const ago = diffDays(today, day)
  const time = formatTimeOf(lastBackupAt)
  if (ago === 0) return `Aujourd’hui à ${time}`
  if (ago === 1) return `Hier à ${time}`
  const date = formatDay(day, day.slice(0, 4) === today.slice(0, 4) ? 'd MMMM' : 'd MMMM yyyy')
  // Date à venir : l'horloge de l'iPhone a été reculée depuis.
  return ago < 0 ? `Le ${date}` : `Le ${date}, il y a ${String(ago)} jours`
}

export interface BackupReminder {
  /** Jours depuis la dernière sauvegarde (null : jamais faite). */
  daysSince: number | null
}

/**
 * Rappel de sauvegarde sur l'accueil : quand il y a des données à garder et que la dernière
 * sauvegarde (ou le premier lancement, s'il n'y en a jamais eu) date d'au moins le délai choisi.
 */
export function backupReminder(
  settings: Pick<AppSettings, 'lastBackupAt' | 'backupReminderDays' | 'createdAt'>,
  today: ISODate,
  hasData: boolean,
): BackupReminder | null {
  if (settings.backupReminderDays <= 0 || !hasData) return null
  const since = localDateOf(settings.lastBackupAt ?? settings.createdAt)
  const days = diffDays(today, since)
  if (days < settings.backupReminderDays) return null
  return { daysSince: settings.lastBackupAt === null ? null : days }
}
