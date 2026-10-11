import { screen, within } from '@testing-library/react'
import { saveOuraDays } from '@/db/oura'
import { saveSecret } from '@/db/secrets'
import { updateSettings } from '@/db/settings'
import { resetOuraAutoSync } from '@/features/oura/useOura'
import { fakeOuraRelay, ouraDay } from '@/test/oura'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'

const RELAY = 'https://calitrack-oura.charles.workers.dev'

/** La carte Récupération de l'accueil. */
async function recoveryCard(): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: 'Récupération', level: 2 })
  const section = heading.closest('section')
  if (!section) throw new Error('Carte Récupération introuvable')
  return section
}

async function connect(expiresAt = '2026-11-20T08:00:00.000Z') {
  await updateSettings({ ouraRelayUrl: RELAY, ouraClientId: 'client-123', dashboardCards: ['recovery'] })
  await saveSecret('oura', 'jeton', expiresAt)
}

describe('carte Récupération', () => {
  beforeEach(() => {
    // Le mercredi 21 octobre 2026, en fin de matinée.
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
    resetOuraAutoSync()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('invite à connecter la bague', async () => {
    await renderApp('/', { setup: () => updateSettings({ dashboardCards: ['recovery'] }) })
    const card = await recoveryCard()
    expect(card).toHaveTextContent(/Connecte ta bague Oura/)
    expect(within(card).getByRole('link', { name: 'Connecter ma bague Oura' })).toHaveAttribute(
      'href',
      '/more/oura',
    )
    expectFrenchSpacing()
  })

  it('montre la récupération de la nuit, sans relire Oura si les données sont fraîches', async () => {
    const relay = fakeOuraRelay()
    vi.stubGlobal('fetch', relay.fetchImpl)
    await renderApp('/', {
      setup: async () => {
        await connect()
        await saveOuraDays([ouraDay('2026-10-21', { syncedAt: '2026-10-21T08:30:00.000Z' })])
      },
    })
    const card = await recoveryCard()
    expect(await within(card).findByText('86')).toBeInTheDocument()
    expect(within(card).getByText('Optimale')).toBeInTheDocument()
    expect(within(card).getByText('Cette nuit')).toBeInTheDocument()
    expect(within(card).getByRole('progressbar', { name: 'Score de récupération' })).toHaveAttribute(
      'aria-valuenow',
      '86',
    )
    expect(card).toHaveTextContent('Récupération optimale : bonne journée pour une séance intense.')
    expect(card).toHaveTextContent('Sommeil7 h 32')
    expect(card).toHaveTextContent('VFC62 ms')
    expect(card).toHaveTextContent('Synchronisée aujourd’hui à 10:30')
    expect(within(card).getByRole('link', { name: 'Réglages Oura' })).toHaveAttribute('href', '/more/oura')
    expect(relay.urls).toHaveLength(0)
    expectFrenchSpacing()
  })

  it('relit Oura quand les données datent', async () => {
    const relay = fakeOuraRelay()
    vi.stubGlobal('fetch', relay.fetchImpl)
    await renderApp('/', {
      setup: async () => {
        await connect()
        await saveOuraDays([ouraDay('2026-10-19', { readinessScore: 58 })])
      },
    })
    const card = await recoveryCard()
    expect(await within(card).findByText('Synchronisée aujourd’hui à 11:00')).toBeInTheDocument()
    expect(within(card).getByText('86')).toBeInTheDocument()
    expect(relay.urls[0]?.searchParams.get('start_date')).toBe('2026-10-17')
  })

  it('montre les dernières données quand la nuit n’est pas encore arrivée', async () => {
    vi.stubGlobal('fetch', fakeOuraRelay(() => new TypeError('Load failed')).fetchImpl)
    await renderApp('/', {
      setup: async () => {
        await connect()
        await saveOuraDays([ouraDay('2026-10-20', { readinessScore: 64, hrvMs: null })])
      },
    })
    const card = await recoveryCard()
    expect(await within(card).findByText('Correcte')).toBeInTheDocument()
    expect(card).toHaveTextContent('Dernières données : hier')
    expect(card).not.toHaveTextContent(/séance/)
    expect(card).not.toHaveTextContent('VFC')
    expect(await within(card).findByText('Synchronisée hier à 10:00')).toBeInTheDocument()
  })

  it('attend les premières données', async () => {
    vi.stubGlobal('fetch', fakeOuraRelay(() => new TypeError('Load failed')).fetchImpl)
    await renderApp('/', { setup: () => connect() })
    const card = await recoveryCard()
    expect(card).toHaveTextContent(/Pas encore de données/)
    expect(await within(card).findByText('Jamais synchronisée')).toBeInTheDocument()
  })

  it('propose de reconnecter la bague quand l’accès a expiré', async () => {
    await renderApp('/', { setup: () => connect('2026-10-20T08:00:00.000Z') })
    const card = await recoveryCard()
    expect(card).toHaveTextContent(/L’accès à Oura a expiré/)
    expect(within(card).getByRole('link', { name: 'Reconnecter ma bague' })).toHaveAttribute(
      'href',
      '/more/oura',
    )
  })
})
