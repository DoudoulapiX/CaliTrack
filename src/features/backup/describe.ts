import { summarizeBackup, type BackupFile } from '@/db/backup'
import { formatDay, localDateOf } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'

function count(value: number, word: string, complement = ''): string {
  return `${value} ${word}${value > 1 ? 's' : ''}${complement}`
}

/** Ce que contient une sauvegarde, en une phrase. */
export function describeBackup(backup: BackupFile): string {
  const summary = summarizeBackup(backup)
  const parts = [
    count(summary.workouts, 'séance'),
    count(summary.climbingSessions, 'séance', ' d’escalade'),
    count(summary.goals, 'objectif'),
  ]
  const day = formatDay(localDateOf(summary.exportedAt), 'd MMMM yyyy')
  return frenchSpacing(`Sauvegarde du ${day} : ${parts.join(', ')}.`)
}
