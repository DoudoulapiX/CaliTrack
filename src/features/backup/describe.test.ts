import { collectBackup } from '@/db/backup'
import { ensureSeeded } from '@/db/seed'
import { climbSession, doneWorkout } from '@/test/fixtures'
import { resetDb } from '@/test/db'
import { backupReminder, describeContents, lastBackupLine } from './describe'

describe('lastBackupLine', () => {
  it('dit quand a eu lieu la dernière sauvegarde, à l’heure de l’iPhone', () => {
    expect(lastBackupLine(null, '2026-10-11')).toBe('Jamais')
    expect(lastBackupLine('2026-10-11T16:42:00.000Z', '2026-10-11')).toBe('Aujourd’hui à 18:42')
    expect(lastBackupLine('2026-10-10T06:05:00.000Z', '2026-10-11')).toBe('Hier à 08:05')
    expect(lastBackupLine('2026-10-03T10:00:00.000Z', '2026-10-11')).toBe('Le 3 octobre, il y a 8 jours')
    expect(lastBackupLine('2025-12-30T10:00:00.000Z', '2026-01-02')).toBe(
      'Le 30 décembre 2025, il y a 3 jours',
    )
  })

  it('compte les jours à l’heure locale, pas en temps universel', () => {
    // 23 h 30 à Paris le 10 octobre : c'était hier, pas aujourd'hui.
    expect(lastBackupLine('2026-10-10T21:30:00.000Z', '2026-10-11')).toBe('Hier à 23:30')
  })

  it('ne parle pas de « il y a » pour une date à venir (horloge reculée)', () => {
    expect(lastBackupLine('2026-10-15T10:00:00.000Z', '2026-10-11')).toBe('Le 15 octobre')
  })
})

describe('backupReminder', () => {
  const settings = {
    lastBackupAt: null,
    backupReminderDays: 7,
    createdAt: '2026-10-01T08:00:00.000Z',
  }

  it('attend le délai choisi depuis le premier lancement quand rien n’a été sauvegardé', () => {
    expect(backupReminder(settings, '2026-10-07', true)).toBeNull()
    expect(backupReminder(settings, '2026-10-08', true)).toEqual({ daysSince: null })
  })

  it('compte depuis la dernière sauvegarde', () => {
    const saved = { ...settings, lastBackupAt: '2026-10-05T08:00:00.000Z' }
    expect(backupReminder(saved, '2026-10-11', true)).toBeNull()
    expect(backupReminder(saved, '2026-10-12', true)).toEqual({ daysSince: 7 })
    expect(backupReminder(saved, '2026-10-20', true)).toEqual({ daysSince: 15 })
  })

  it('se tait sans données à garder ou quand le rappel est coupé', () => {
    expect(backupReminder(settings, '2026-12-01', false)).toBeNull()
    expect(backupReminder({ ...settings, backupReminderDays: 0 }, '2026-12-01', true)).toBeNull()
  })
})

describe('describeContents', () => {
  beforeEach(async () => {
    await resetDb()
    await ensureSeeded()
  })

  it('compte séances, séances d’escalade et objectifs', async () => {
    const empty = await collectBackup()
    // Chaque nombre reste avec son nom.
    expect(describeContents(empty)).toBe('0\u00a0séance, 0\u00a0séance d’escalade, 0\u00a0objectif')

    const backup = {
      ...empty,
      tables: {
        ...empty.tables,
        workouts: [doneWorkout('w1', '2026-10-09'), doneWorkout('w2', '2026-10-10')],
        climbingSessions: [climbSession('c1', '2026-10-10')],
      },
    }
    expect(describeContents(backup)).toBe('2\u00a0séances, 1\u00a0séance d’escalade, 0\u00a0objectif')
  })
})
