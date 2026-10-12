import Dexie from 'dexie'
import { createDb, DB_VERSION, SCHEMA_V1, SCHEMA_V2 } from './db'
import { v1Settings } from '@/test/fixtures'
import { DEFAULT_DASHBOARD_CARDS, DEFAULT_TABS, defaultSettings } from './defaults'
import { settingsV1toV2 } from './migrations'
import { settingsSchema } from './schema'

describe('réglages de la version 1 vers la version 2', () => {
  it('donne les onglets et cartes de la version 2 à qui n’y avait pas touché', () => {
    const row = settingsV1toV2(v1Settings())
    expect(row.tabs).toEqual(DEFAULT_TABS)
    expect(row.dashboardCards).toEqual(DEFAULT_DASHBOARD_CARDS)
    expect(row).toMatchObject({ aiModel: 'claude-opus-5-5', ouraClientId: '', ouraRelayUrl: '' })
    expect(settingsSchema.safeParse(row).success).toBe(true)
  })

  it('garde les choix de l’utilisateur et ajoute les nouvelles cartes à la fin', () => {
    const row = settingsV1toV2(
      v1Settings({ tabs: ['today', 'goals'], dashboardCards: ['weight', 'todaySession'], accent: '#2563eb' }),
    )
    expect(row.tabs).toEqual(['today', 'goals'])
    expect(row.dashboardCards).toEqual(['weight', 'todaySession', 'recovery', 'nutrition'])
    expect(row.accent).toBe('#2563eb')
  })

  it('ne remet pas une carte déjà là ni un modèle déjà choisi', () => {
    const row = settingsV1toV2(
      v1Settings({
        dashboardCards: ['nutrition'],
        aiModel: 'claude-haiku-5-5',
        ouraRelayUrl: 'https://r.dev',
      }),
    )
    expect(row.dashboardCards).toEqual(['nutrition', 'recovery'])
    expect(row).toMatchObject({ aiModel: 'claude-haiku-5-5', ouraRelayUrl: 'https://r.dev' })
  })
})

describe('mise à jour de la base dans l’iPhone', () => {
  const name = 'calitrack-migration-test'

  afterEach(async () => {
    await Dexie.delete(name)
  })

  it('en est à la version 3 (coach IA)', () => {
    expect(DB_VERSION).toBe(3)
  })

  it('passe de la version 1 à la version actuelle sans rien perdre', async () => {
    const old = new Dexie(name)
    old.version(1).stores(SCHEMA_V1)
    await old.open()
    await old.table('settings').put(v1Settings({ accent: '#16a34a' }))
    await old.table('bodyMetrics').put({
      id: 'm1',
      date: '2026-10-10',
      weightKg: 80,
      bodyFatPct: null,
      waistCm: null,
      note: '',
      createdAt: '2026-10-10T08:00:00.000Z',
    })
    old.close()

    const db = createDb(name)
    await db.open()
    const settings = await db.settings.get('app')
    expect(settingsSchema.safeParse(settings).success).toBe(true)
    expect(settings).toMatchObject({ accent: '#16a34a', tabs: DEFAULT_TABS, aiModel: 'claude-opus-5-5' })
    expect(await db.bodyMetrics.get('m1')).toMatchObject({ weightKg: 80 })
    expect(await db.foodEntries.count()).toBe(0)
    expect(await db.ouraDays.count()).toBe(0)
    expect(await db.coachDays.count()).toBe(0)
    expect(await db.bodyReviews.count()).toBe(0)
    expect(await db.pantryItems.count()).toBe(0)
    expect(await db.coachMessages.count()).toBe(0)
    expect(await db.aiUsage.count()).toBe(0)
    expect(db.verno).toBe(DB_VERSION)
    db.close()
  })

  it('passe de la version 2 à la version 3 sans rien perdre, clé d’IA comprise', async () => {
    const settings = {
      ...defaultSettings('2026-10-12T08:00:00.000Z'),
      aiModel: 'claude-sonnet-5-5',
      tabs: ['today', 'nutrition'],
      dashboardCards: ['weight', 'todaySession'],
    }
    const entry = {
      id: 'e1',
      date: '2026-10-20',
      meal: 'lunch',
      source: 'quick',
      foodId: null,
      name: 'Repas au restaurant',
      grams: null,
      per100: null,
      nutrients: {
        kcal: 850,
        protein: 40,
        carbs: 90,
        fat: 30,
        fiber: null,
        sugars: null,
        satFat: null,
        salt: null,
      },
      note: '',
      createdAt: '2026-10-20T12:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
    }
    const oura = {
      date: '2026-10-20',
      sleepScore: 78,
      readinessScore: 82,
      activityScore: 70,
      sleepMin: 430,
      sleepEfficiency: 91,
      hrvMs: 48,
      lowestHr: 52,
      temperatureDeviation: -0.1,
      activeKcal: 520,
      totalKcal: 2650,
      steps: 9000,
      syncedAt: '2026-10-20T07:00:00.000Z',
    }
    const secret = {
      id: 'anthropic',
      value: 'sk-ant-test',
      expiresAt: null,
      updatedAt: '2026-10-12T08:00:00.000Z',
    }

    const old = new Dexie(name)
    old.version(1).stores(SCHEMA_V1)
    old.version(2).stores(SCHEMA_V2)
    await old.open()
    await old.table('settings').put(settings)
    await old.table('foodEntries').put(entry)
    await old.table('ouraDays').put(oura)
    await old.table('secrets').put(secret)
    old.close()

    const db = createDb(name)
    await db.open()
    expect(db.verno).toBe(3)
    // Rien à convertir : les réglages restent tels quels (pas de seconde conversion depuis la version 1).
    expect(await db.settings.get('app')).toEqual(settings)
    expect(await db.foodEntries.get('e1')).toEqual(entry)
    expect(await db.ouraDays.get('2026-10-20')).toEqual(oura)
    expect(await db.secrets.get('anthropic')).toEqual(secret)
    expect(await db.coachDays.count()).toBe(0)
    expect(await db.bodyReviews.count()).toBe(0)
    expect(await db.pantryItems.count()).toBe(0)
    expect(await db.coachMessages.count()).toBe(0)
    expect(await db.aiUsage.count()).toBe(0)
    db.close()
  })
})
