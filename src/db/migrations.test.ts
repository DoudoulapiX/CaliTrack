import Dexie from 'dexie'
import { createDb, SCHEMA_V1 } from './db'
import { v1Settings } from '@/test/fixtures'
import { DEFAULT_DASHBOARD_CARDS, DEFAULT_TABS } from './defaults'
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

  it('passe de la version 1 à la version 2 sans rien perdre', async () => {
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
    expect(db.verno).toBe(2)
    db.close()
  })
})
