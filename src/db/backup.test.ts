import { resetDb } from '@/test/db'
import { v1Settings } from '@/test/fixtures'
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
  stampBackup,
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

  it('date la sauvegarde, aussi dans ses réglages', async () => {
    const backup = stampBackup(await collectBackup(), '2026-10-21T08:00:00.000Z')
    expect(backup.exportedAt).toBe('2026-10-21T08:00:00.000Z')
    expect(backup.tables.settings.map((row) => row.lastBackupAt)).toEqual(['2026-10-21T08:00:00.000Z'])
    // Une fois restaurée, l'appli sait de quand date la sauvegarde.
    await restoreBackup(backup)
    expect((await db.settings.get('app'))?.lastBackupAt).toBe('2026-10-21T08:00:00.000Z')
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

  it('restaure une sauvegarde de la version 1, faite avant la nutrition', async () => {
    const file = JSON.parse(serializeBackup(await collectBackup())) as {
      format: number
      dbVersion: number
      tables: Record<string, unknown[]>
    }
    file.format = 1
    file.dbVersion = 1
    file.tables.settings = [v1Settings({ accent: '#2563eb' })]
    // Ni aliments, ni repas, ni objectifs caloriques, ni données Oura en version 1.
    const { foods, foodEntries, nutritionGoals, ouraDays, ...v1Tables } = file.tables
    expect([foods, foodEntries, nutritionGoals, ouraDays].every(Array.isArray)).toBe(true)
    file.tables = v1Tables
    file.tables.bodyMetrics = [metric('ancien', 81)]

    const parsed = parseBackup(JSON.stringify(file))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.backup.format).toBe(BACKUP_FORMAT)
    await restoreBackup(parsed.backup)

    expect(await db.settings.get('app')).toMatchObject({
      accent: '#2563eb',
      aiModel: 'claude-opus-5-5',
      tabs: ['today', 'training', 'nutrition', 'climbing'],
    })
    expect(await db.nutritionGoals.get('me')).toMatchObject({ phase: 'maintain', kcal: null })
    expect(await db.bodyMetrics.get('ancien')).toBeDefined()
  })

  it('garde la clé d’IA et le jeton Oura hors des sauvegardes', async () => {
    await db.secrets.put({ id: 'anthropic', value: 'sk-ant-test', expiresAt: null, updatedAt: 'x' })
    const text = serializeBackup(await collectBackup())
    expect(text).not.toContain('sk-ant-test')

    // Restaurer une sauvegarde ne retire pas la clé de l'iPhone ; tout effacer, si.
    const parsed = parseBackup(text)
    if (!parsed.ok) throw new Error(parsed.error)
    await restoreBackup(parsed.backup)
    expect(await db.secrets.get('anthropic')).toBeDefined()
    await resetAllData()
    expect(await db.secrets.count()).toBe(0)
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
