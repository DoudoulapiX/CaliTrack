import { resetDb } from '@/test/db'
import { frenchSpacing } from '@/lib/typography'
import {
  BACKUP_FORMAT,
  MAX_SNAPSHOTS,
  collectBackup,
  createSnapshot,
  parseBackup,
  resetAllData,
  restoreBackup,
  restoreSnapshot,
  serializeBackup,
  summarizeBackup,
} from './backup'
import { db } from './db'
import { ensureSeeded } from './seed'
import type { BodyMetric } from './types'

const metric = (id: string, weightKg: number): BodyMetric => ({
  id,
  date: '2026-10-10',
  weightKg,
  bodyFatPct: null,
  waistCm: null,
  note: '',
  createdAt: '2026-10-10T08:00:00.000Z',
})

describe('sauvegardes', () => {
  beforeEach(async () => {
    await resetDb()
    await ensureSeeded()
  })

  it('exporte puis réimporte toutes les données à l’identique', async () => {
    await db.bodyMetrics.put(metric('m1', 72.4))
    await db.settings.update('app', { accent: '#2563eb' })
    const text = serializeBackup(await collectBackup())

    await db.bodyMetrics.clear()
    await db.settings.update('app', { accent: '#ff6a2b' })

    const parsed = parseBackup(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(summarizeBackup(parsed.backup).bodyMetrics).toBe(1)
    await restoreBackup(parsed.backup)

    expect(await db.bodyMetrics.get('m1')).toEqual(metric('m1', 72.4))
    expect((await db.settings.get('app'))?.accent).toBe('#2563eb')
    expect(await db.gradeScales.count()).toBe(2)
  })

  it('garde une copie de sécurité avant d’importer et sait la restaurer', async () => {
    await db.bodyMetrics.put(metric('avant', 80))
    const other = parseBackup(serializeBackup(await collectBackup()))
    if (!other.ok) throw new Error(other.error)
    other.backup.tables.bodyMetrics = [metric('après', 75)]

    await restoreBackup(other.backup)
    expect(await db.bodyMetrics.get('avant')).toBeUndefined()

    const [snapshot] = await db.snapshots.toArray()
    expect(snapshot?.reason).toBe('before-import')
    await restoreSnapshot(snapshot!.id)
    expect(await db.bodyMetrics.get('avant')).toBeDefined()
    expect(await db.bodyMetrics.get('après')).toBeUndefined()
  })

  it('ne conserve que les dernières copies de sécurité', async () => {
    for (let i = 0; i < MAX_SNAPSHOTS + 2; i++) await createSnapshot('manual')
    expect(await db.snapshots.count()).toBe(MAX_SNAPSHOTS)
  })

  it('refuse un fichier illisible ou étranger', () => {
    const unreadable = parseBackup('pas du json')
    expect(unreadable.ok).toBe(false)
    if (!unreadable.ok) expect(unreadable.error).toContain('illisible')
    expect(parseBackup('{"app":"Autre"}').ok).toBe(false)
  })

  it('refuse une sauvegarde plus récente que l’appli', async () => {
    const backup = await collectBackup()
    const text = serializeBackup({ ...backup, format: BACKUP_FORMAT + 1 })
    const parsed = parseBackup(text)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toContain('plus récente')
  })

  it('signale précisément une donnée abîmée sans rien modifier', async () => {
    const backup = await collectBackup()
    const broken = JSON.parse(serializeBackup(backup)) as { tables: Record<string, unknown[]> }
    broken.tables.bodyMetrics = [{ ...metric('x', 70), weightKg: 'lourd' }]
    const parsed = parseBackup(JSON.stringify(broken))
    expect(parsed).toEqual({
      ok: false,
      error: frenchSpacing('Sauvegarde abîmée (mesures, élément 1, champ « weightKg »).'),
    })
  })

  it('accepte une sauvegarde où une table manque (elle est alors vide)', async () => {
    const backup = await collectBackup()
    const partial = JSON.parse(serializeBackup(backup)) as { tables: Record<string, unknown[]> }
    delete partial.tables.goals
    const parsed = parseBackup(JSON.stringify(partial))
    expect(parsed.ok).toBe(true)
  })

  it('remet l’appli à zéro avec les réglages par défaut', async () => {
    await db.bodyMetrics.put(metric('m', 70))
    await db.settings.update('app', { onboardingDone: true })
    await resetAllData()
    expect(await db.bodyMetrics.count()).toBe(0)
    expect((await db.settings.get('app'))?.onboardingDone).toBe(false)
    expect(await db.profile.get('me')).toBeDefined()
  })
})
