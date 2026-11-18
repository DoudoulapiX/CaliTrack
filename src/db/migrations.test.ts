import Dexie from 'dexie'
import { createDb, DB_VERSION, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3 } from './db'
import { v1Settings } from '@/test/fixtures'
import { DEFAULT_AI_MODEL, DEFAULT_DASHBOARD_CARDS, DEFAULT_TABS, defaultSettings } from './defaults'
import { settingsV1toV2, settingsV3toV4, V2_DEFAULT_AI_MODEL } from './migrations'
import { settingsSchema } from './schema'

describe('réglages de la version 1 vers la version 2', () => {
  it('donne les onglets et cartes de la version 2 à qui n’y avait pas touché', () => {
    const row = settingsV1toV2(v1Settings())
    expect(row.tabs).toEqual(DEFAULT_TABS)
    expect(row.dashboardCards).toEqual(DEFAULT_DASHBOARD_CARDS)
    // Le modèle de la version 2 (Claude), converti ensuite pour OpenAI (version 4).
    expect(row).toMatchObject({ aiModel: 'claude-opus-5-5', ouraClientId: '', ouraRelayUrl: '' })
    expect(V2_DEFAULT_AI_MODEL).toBe('claude-opus-5-5')
    expect(settingsSchema.safeParse(settingsV3toV4(row)).success).toBe(true)
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

describe('réglages de la version 3 vers la version 4 (Claude vers OpenAI)', () => {
  it('donne à chaque modèle Claude son remplaçant chez OpenAI', () => {
    const model = (aiModel: unknown) => settingsV3toV4({ id: 'app', aiModel }).aiModel
    expect(model('claude-opus-5-5')).toBe('gpt-6.2-sol')
    expect(model('claude-sonnet-5-5')).toBe('gpt-6.2-sol')
    expect(model('claude-haiku-5-5')).toBe('gpt-6-luna')
    expect(DEFAULT_AI_MODEL).toBe('gpt-6.2-sol')
  })

  it('ne touche à rien d’autre, ni à un modèle déjà d’OpenAI', () => {
    const settings = { ...defaultSettings('2026-11-18T08:00:00.000Z'), aiModel: 'gpt-6.2-astra' }
    expect(settingsV3toV4(settings)).toEqual(settings)
    const row = { id: 'app', accent: '#16a34a', aiModel: 'claude-sonnet-5-5' }
    expect(settingsV3toV4(row)).toEqual({ id: 'app', accent: '#16a34a', aiModel: 'gpt-6.2-sol' })
    // Une valeur inconnue reste telle quelle : la vérification de la sauvegarde la refusera.
    expect(settingsV3toV4({ id: 'app', aiModel: 'toString' }).aiModel).toBe('toString')
    expect(settingsV3toV4({ id: 'app' })).toEqual({ id: 'app', aiModel: undefined })
  })
})

describe('mise à jour de la base dans l’iPhone', () => {
  const name = 'calitrack-migration-test'

  afterEach(async () => {
    await Dexie.delete(name)
  })

  it('en est à la version 4 (IA chez OpenAI)', () => {
    expect(DB_VERSION).toBe(4)
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
    expect(settings).toMatchObject({ accent: '#16a34a', tabs: DEFAULT_TABS, aiModel: 'gpt-6.2-sol' })
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

  it('passe de la version 2 à la version 4 sans rien perdre, sauf l’ancienne clé Claude', async () => {
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
    const ouraToken = {
      id: 'oura',
      value: 'jeton-oura',
      expiresAt: '2026-11-11T08:00:00.000Z',
      updatedAt: '2026-10-12T08:00:00.000Z',
    }

    const old = new Dexie(name)
    old.version(1).stores(SCHEMA_V1)
    old.version(2).stores(SCHEMA_V2)
    await old.open()
    await old.table('settings').put(settings)
    await old.table('foodEntries').put(entry)
    await old.table('ouraDays').put(oura)
    await old.table('secrets').bulkPut([secret, ouraToken])
    old.close()

    const db = createDb(name)
    await db.open()
    expect(db.verno).toBe(4)
    // Seul le modèle change (pas de seconde conversion depuis la version 1 : onglets et cartes gardés).
    expect(await db.settings.get('app')).toEqual({ ...settings, aiModel: 'gpt-6.2-sol' })
    expect(settingsSchema.safeParse(await db.settings.get('app')).success).toBe(true)
    expect(await db.foodEntries.get('e1')).toEqual(entry)
    expect(await db.ouraDays.get('2026-10-20')).toEqual(oura)
    // La clé Claude ne sert plus à rien chez OpenAI : elle quitte l'iPhone ; le jeton Oura reste.
    expect(await db.secrets.toArray()).toEqual([ouraToken])
    expect(await db.coachDays.count()).toBe(0)
    expect(await db.bodyReviews.count()).toBe(0)
    expect(await db.pantryItems.count()).toBe(0)
    expect(await db.coachMessages.count()).toBe(0)
    expect(await db.aiUsage.count()).toBe(0)
    db.close()
  })

  it('passe de la version 3 à la version 4 : modèle remplacé, clé Claude effacée, le reste gardé', async () => {
    const settings = { ...defaultSettings('2026-10-13T08:00:00.000Z'), aiModel: 'claude-haiku-5-5' }
    const message = {
      id: 'c1',
      seq: 1,
      role: 'assistant',
      text: 'Garde trois séances par semaine.',
      model: 'claude-opus-5-5',
      createdAt: '2026-10-20T18:00:00.000Z',
    }
    const usage = {
      month: '2026-10',
      calls: 3,
      inputTokens: 6000,
      outputTokens: 1500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0.054,
      updatedAt: '2026-10-20T18:00:00.000Z',
    }
    const old = new Dexie(name)
    old.version(1).stores(SCHEMA_V1)
    old.version(2).stores(SCHEMA_V2)
    old.version(3).stores(SCHEMA_V3)
    await old.open()
    await old.table('settings').put(settings)
    await old.table('coachMessages').put(message)
    await old.table('aiUsage').put(usage)
    await old.table('secrets').put({ id: 'anthropic', value: 'sk-ant-x', expiresAt: null, updatedAt: 'x' })
    old.close()

    const db = createDb(name)
    await db.open()
    expect(db.verno).toBe(4)
    expect(await db.settings.get('app')).toEqual({ ...settings, aiModel: 'gpt-6-luna' })
    // L'historique garde le nom du modèle Claude qui a répondu, et le compteur du mois reste.
    expect(await db.coachMessages.get('c1')).toEqual(message)
    expect(await db.aiUsage.get('2026-10')).toEqual(usage)
    expect(await db.secrets.count()).toBe(0)
    db.close()
  })
})
