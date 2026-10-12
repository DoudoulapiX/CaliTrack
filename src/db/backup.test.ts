import { resetDb } from '@/test/db'
import {
  aiUsageRow,
  bodyReview,
  coachChange,
  coachDay,
  coachMessage,
  pantryItem,
  v1Settings,
} from '@/test/fixtures'
import { frenchSpacing } from '@/lib/typography'
import {
  BACKUP_FORMAT,
  MAX_SNAPSHOTS,
  TABLE_LABEL,
  collectBackup,
  createSnapshot,
  parseBackup,
  resetAllData,
  restoreBackup,
  restoreSnapshot,
  serializeBackup,
  stampBackup,
  summarizeBackup,
  upgradeTables,
} from './backup'
import { DATA_TABLES, DB_VERSION, DEVICE_TABLES, createDb, db } from './db'
import { defaultSettings } from './defaults'
import { V1_DEFAULT_TABS, settingsV1toV2 } from './migrations'
import { TABLE_SCHEMAS } from './schema'
import { ensureSeeded } from './seed'
import type { BodyMetric } from './types'

/** Un fichier de sauvegarde tel qu'il est enregistré, à modifier pour le test. */
interface BackupJson {
  format: number
  dbVersion: number
  tables: Record<string, unknown[]>
}

const COACH_TABLES = ['coachDays', 'bodyReviews', 'pantryItems', 'coachMessages'] as const

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

  it('écrit le format 3, avec les tables du coach', async () => {
    const file = JSON.parse(serializeBackup(await collectBackup())) as BackupJson
    expect(BACKUP_FORMAT).toBe(3)
    expect(file).toMatchObject({ format: 3, dbVersion: 3 })
    expect(Object.keys(file.tables)).toEqual([...DATA_TABLES])
    for (const name of COACH_TABLES) expect(file.tables[name]).toEqual([])
  })

  it.each([
    ['du format 4', { format: 4 }],
    ['d’une base en version 4', { dbVersion: 4 }],
  ])('refuse une sauvegarde %s', async (_, patch) => {
    const file = { ...(JSON.parse(serializeBackup(await collectBackup())) as BackupJson), ...patch }
    const parsed = parseBackup(JSON.stringify(file))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toContain('plus récente')
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
    // Ni aliments, ni repas, ni objectifs caloriques, ni données Oura, ni coach en version 1.
    const {
      foods,
      foodEntries,
      nutritionGoals,
      ouraDays,
      coachDays,
      bodyReviews,
      pantryItems,
      coachMessages,
      ...v1Tables
    } = file.tables
    expect(
      [
        foods,
        foodEntries,
        nutritionGoals,
        ouraDays,
        coachDays,
        bodyReviews,
        pantryItems,
        coachMessages,
      ].every(Array.isArray),
    ).toBe(true)
    file.tables = v1Tables
    file.tables.bodyMetrics = [metric('ancien', 81)]
    await db.pantryItems.put(pantryItem())

    const parsed = parseBackup(JSON.stringify(file))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.backup.format).toBe(BACKUP_FORMAT)
    for (const name of COACH_TABLES) expect(parsed.backup.tables[name]).toEqual([])
    await restoreBackup(parsed.backup)
    expect(await db.pantryItems.count()).toBe(0)

    expect(await db.settings.get('app')).toMatchObject({
      accent: '#2563eb',
      aiModel: 'claude-opus-5-5',
      tabs: ['today', 'training', 'nutrition', 'climbing'],
    })
    expect(await db.nutritionGoals.get('me')).toMatchObject({ phase: 'maintain', kcal: null })
    expect(await db.bodyMetrics.get('ancien')).toBeDefined()
  })

  it('restaure une sauvegarde de la version 2, faite avant le coach', async () => {
    // Des réglages de la version 2, déjà convertis : ils ne doivent pas l'être une seconde fois.
    const settings = {
      ...defaultSettings('2026-10-12T08:00:00.000Z'),
      aiModel: 'claude-sonnet-5-5',
      tabs: [...V1_DEFAULT_TABS],
      dashboardCards: ['weight', 'todaySession'],
    }
    await db.coachMessages.bulkPut([coachMessage(0), coachMessage(1)])
    const file = JSON.parse(serializeBackup(await collectBackup())) as BackupJson
    file.format = 2
    file.dbVersion = 2
    file.tables.settings = [settings]
    const { coachDays, bodyReviews, pantryItems, coachMessages, ...v2Tables } = file.tables
    expect(coachMessages).toHaveLength(2)
    expect([coachDays, bodyReviews, pantryItems].every(Array.isArray)).toBe(true)
    file.tables = v2Tables

    const parsed = parseBackup(JSON.stringify(file))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.backup).toMatchObject({ format: BACKUP_FORMAT, dbVersion: DB_VERSION })
    expect(parsed.backup.tables.settings).toEqual([settings])
    for (const name of COACH_TABLES) expect(parsed.backup.tables[name]).toEqual([])
    await restoreBackup(parsed.backup)

    expect(await db.settings.get('app')).toEqual(settings)
    expect(await db.coachMessages.count()).toBe(0)
  })

  it('met les tables des anciens formats au format actuel, étape par étape', () => {
    const tables = { settings: [v1Settings()], goals: [] }
    expect(upgradeTables(3, tables)).toBe(tables)
    expect(upgradeTables(2, tables)).toBe(tables)
    const fromV1 = upgradeTables(1, tables)
    expect(fromV1.settings).toEqual([settingsV1toV2(v1Settings())])
    expect(fromV1.goals).toBe(tables.goals)
    // Le fichier lu n'est pas modifié.
    expect(tables.settings).toEqual([v1Settings()])
  })

  it('exporte puis réimporte les données du coach à l’identique', async () => {
    const days = [
      coachDay({ decision: 'lighter', changes: [coachChange()] }),
      coachDay({ date: '2026-10-20' }),
    ]
    const reviews = [bodyReview()]
    const items = [
      pantryItem(),
      pantryItem({ id: 'pantry-2', place: 'cupboard', name: 'Riz', source: 'photo' }),
    ]
    const chat = [coachMessage(0), coachMessage(1)]
    await db.coachDays.bulkPut(days)
    await db.bodyReviews.bulkPut(reviews)
    await db.pantryItems.bulkPut(items)
    await db.coachMessages.bulkPut(chat)
    const text = serializeBackup(await collectBackup())

    for (const name of COACH_TABLES) await db.table(name).clear()
    const parsed = parseBackup(text)
    if (!parsed.ok) throw new Error(parsed.error)
    await restoreBackup(parsed.backup)

    expect(await db.coachDays.orderBy('date').toArray()).toEqual([days[1], days[0]])
    expect(await db.bodyReviews.toArray()).toEqual(reviews)
    expect(await db.pantryItems.orderBy('id').toArray()).toEqual(items)
    expect(await db.coachMessages.orderBy('seq').toArray()).toEqual(chat)
  })

  it('signale précisément un message abîmé de la discussion', async () => {
    const broken = JSON.parse(serializeBackup(await collectBackup())) as BackupJson
    broken.tables.coachMessages = [{ ...coachMessage(0), role: 'bot' }]
    expect(parseBackup(JSON.stringify(broken))).toEqual({
      ok: false,
      error: frenchSpacing('Sauvegarde abîmée (discussion avec le coach, élément 1, champ « role »).'),
    })
  })

  it('garde la clé d’IA et le compteur des demandes sur l’iPhone, hors des sauvegardes', async () => {
    await db.secrets.put({ id: 'anthropic', value: 'sk-ant-test', expiresAt: null, updatedAt: 'x' })
    await db.aiUsage.put(aiUsageRow())
    const snapshot = await createSnapshot('manual')
    const text = serializeBackup(await collectBackup())
    for (const saved of [text, snapshot.data]) {
      expect(saved).not.toContain('sk-ant-test')
      expect(saved).not.toContain('aiUsage')
    }

    // Une restauration garde les tables de l'appareil ; « Tout effacer » les vide toutes.
    const parsed = parseBackup(text)
    if (!parsed.ok) throw new Error(parsed.error)
    await restoreBackup(parsed.backup)
    expect(await db.secrets.get('anthropic')).toBeDefined()
    expect(await db.aiUsage.toArray()).toEqual([aiUsageRow()])
    expect(await db.snapshots.count()).toBe(2)
    await resetAllData()
    expect(await db.secrets.count()).toBe(0)
    expect(await db.aiUsage.count()).toBe(0)
    expect(await db.snapshots.count()).toBe(0)
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
    await db.coachDays.put(coachDay())
    await db.coachMessages.put(coachMessage(0))
    await db.settings.update('app', { onboardingDone: true })
    await resetAllData()
    expect(await db.bodyMetrics.count()).toBe(0)
    expect(await db.coachDays.count()).toBe(0)
    expect(await db.coachMessages.count()).toBe(0)
    expect((await db.settings.get('app'))?.onboardingDone).toBe(false)
    expect(await db.profile.get('me')).toBeDefined()
  })
})

describe('tables de la base', () => {
  it('chaque table sauvegardée a un schéma et un nom', () => {
    const tables = [...DATA_TABLES].sort()
    expect(Object.keys(TABLE_SCHEMAS).sort()).toEqual(tables)
    expect(Object.keys(TABLE_LABEL).sort()).toEqual(tables)
  })

  it('chaque table est soit sauvegardée, soit propre à l’appareil', () => {
    const data: readonly string[] = DATA_TABLES
    const device: readonly string[] = DEVICE_TABLES
    const names = createDb('calitrack-tables-test').tables.map((table) => table.name)
    for (const name of names) {
      // Le nombre de listes où la table figure : exactement une.
      const lists = Number(data.includes(name)) + Number(device.includes(name))
      expect({ table: name, lists }).toEqual({ table: name, lists: 1 })
    }
    expect([...data, ...device].sort()).toEqual([...names].sort())
  })
})
