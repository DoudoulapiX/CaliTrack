import { screen, waitFor, within } from '@testing-library/react'
import { db } from '@/db/db'
import { RELAY_ID } from '@/content/oura/relay'
import { saveOuraDays } from '@/db/oura'
import { saveSecret } from '@/db/secrets'
import { updateSettings } from '@/db/settings'
import { leaveApp } from '@/lib/leave-app'
import { fakeOuraRelay, ouraDay, unauthorized } from '@/test/oura'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'
import { storedOuraState, storeOuraState } from './oura-state'
import { resetOuraAutoSync } from './useOura'

vi.mock('@/lib/leave-app', () => ({ leaveApp: vi.fn() }))

const RELAY = 'https://calitrack-oura.charles.workers.dev'
const REDIRECT = `${window.location.origin}${import.meta.env.BASE_URL}oura/callback`
const RETURN = 'access_token=jeton-abc&token_type=bearer&expires_in=2592000&scope=daily&state=etat-1'

function stubRelay(override?: Parameters<typeof fakeOuraRelay>[0]) {
  const relay = fakeOuraRelay(override)
  vi.stubGlobal('fetch', relay.fetchImpl)
  return relay
}

const configured = () => updateSettings({ ouraRelayUrl: RELAY, ouraClientId: 'client-123' })

async function connected() {
  await configured()
  await saveSecret('oura', 'jeton', '2026-11-20T08:00:00.000Z')
  // Synchronisée il y a dix minutes : pas de nouvelle lecture à l'ouverture.
  await saveOuraDays([ouraDay('2026-10-21', { syncedAt: '2026-10-21T08:50:00.000Z' })])
}

describe('réglages Oura', () => {
  beforeEach(() => {
    // Le mercredi 21 octobre 2026, en fin de matinée.
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
    resetOuraAutoSync()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.mocked(leaveApp).mockClear()
  })

  it('s’ouvrent depuis « Plus » et attendent les deux étapes', async () => {
    const { user } = await renderApp('/more')
    await user.click(await screen.findByRole('link', { name: /^Bague Oura/ }))
    expect(await screen.findByRole('heading', { name: 'Bague Oura', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('Fais d’abord les deux étapes ci-dessous.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connecter ma bague' })).toBeDisabled()
    expect(screen.queryByLabelText('Lien de retour')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'dash.cloudflare.com' })).toHaveAttribute(
      'href',
      'https://dash.cloudflare.com/',
    )
    expectFrenchSpacing()
  })

  it('donnent le code du relais et les adresses à recopier', async () => {
    const { user } = await renderApp('/more/oura')
    await user.click(await screen.findByRole('button', { name: 'Copier le code du relais' }))
    expect(await screen.findByText('Code du relais copié')).toBeInTheDocument()
    const code = await navigator.clipboard.readText()
    expect(code).toContain(`const APP_ORIGIN = ${JSON.stringify(window.location.origin)}`)
    expect(code).toContain("const OURA_API = 'https://api.ouraring.com'")

    expect(screen.getByText(REDIRECT)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copier l’adresse de retour' }))
    expect(await navigator.clipboard.readText()).toBe(REDIRECT)
    await user.click(screen.getByRole('button', { name: 'Copier l’adresse de l’appli' }))
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}${import.meta.env.BASE_URL}`)
  })

  it('enregistrent et testent le relais, puis partent chez Oura avec le Client ID', async () => {
    let reachable = true
    const relay = stubRelay((url) =>
      url.pathname === '/ping'
        ? reachable
          ? new Response(RELAY_ID)
          : new TypeError('Load failed')
        : undefined,
    )
    const { user } = await renderApp('/more/oura')
    const field = await screen.findByLabelText('Adresse du relais')

    await user.type(field, 'pas une adresse')
    await user.click(screen.getByRole('button', { name: 'Enregistrer et tester' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/^Ce n’est pas une adresse de relais/)

    await user.clear(field)
    await user.type(field, `${RELAY}/`)
    await user.click(screen.getByRole('button', { name: 'Enregistrer et tester' }))
    expect(await screen.findByText('Le relais fonctionne')).toBeInTheDocument()
    expect((await db.settings.get('app'))?.ouraRelayUrl).toBe(RELAY)
    expect(relay.urls[0]?.href).toBe(`${RELAY}/ping`)
    expect(field).toHaveValue(RELAY)

    reachable = false
    await user.click(screen.getByRole('button', { name: 'Tester le relais' }))
    expect(await screen.findByText(/^Relais injoignable/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Client ID'), ' client-123 ')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le Client ID' }))
    expect(await screen.findByText('Client ID enregistré')).toBeInTheDocument()
    expect((await db.settings.get('app'))?.ouraClientId).toBe('client-123')

    expect(await screen.findByText('Tout est prêt : connecte ta bague.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Connecter ma bague' }))
    expect(leaveApp).toHaveBeenCalledTimes(1)
    const url = new URL(vi.mocked(leaveApp).mock.calls[0]?.[0] ?? '')
    expect(url.origin + url.pathname).toBe('https://cloud.ouraring.com/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('client-123')
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT)
    expect(url.searchParams.get('state')).toBe(storedOuraState())
    expectFrenchSpacing()
  })

  it('acceptent le lien de retour collé à la main, puis lisent les données', async () => {
    const relay = stubRelay()
    storeOuraState('etat-1')
    const { user } = await renderApp('/more/oura', { setup: configured })
    const field = await screen.findByLabelText('Lien de retour')

    await user.type(field, `${REDIRECT}#${RETURN.replace('etat-1', 'etat-0')}`)
    await user.click(screen.getByRole('button', { name: 'Valider le lien' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/^Ce lien vient d’une ancienne demande/)
    expect(await db.secrets.count()).toBe(0)

    await user.clear(field)
    await user.type(field, `${REDIRECT}#${RETURN}`)
    await user.click(screen.getByRole('button', { name: 'Valider le lien' }))
    expect(await screen.findByText('Bague Oura connectée')).toBeInTheDocument()
    expect(await db.secrets.get('oura')).toMatchObject({
      value: 'jeton-abc',
      expiresAt: '2026-11-20T09:00:00.000Z',
    })
    expect(storedOuraState()).toBeNull()

    // Connectée et jamais lue : la synchronisation part toute seule.
    expect(await screen.findByText('Synchronisée aujourd’hui à 11:00')).toBeInTheDocument()
    expect(screen.getByText('Accès valable jusqu’au 20 novembre')).toBeInTheDocument()
    expect(relay.headers[0]?.get('Authorization')).toBe('Bearer jeton-abc')
    expect(await db.ouraDays.count()).toBe(2)
  })

  it('synchronisent à la demande et proposent de reconnecter quand Oura refuse l’accès', async () => {
    let refused = false
    stubRelay(() => (refused ? unauthorized() : undefined))
    const { user } = await renderApp('/more/oura', { setup: connected })
    expect(await screen.findByText('Bague connectée')).toBeInTheDocument()
    expect(screen.getByText('Synchronisée aujourd’hui à 10:50')).toBeInTheDocument()
    expect(screen.queryByLabelText('Lien de retour')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Synchroniser maintenant' }))
    expect(await screen.findByText('Données Oura à jour')).toBeInTheDocument()
    expect(await screen.findByText('Synchronisée aujourd’hui à 11:00')).toBeInTheDocument()

    refused = true
    await user.click(screen.getByRole('button', { name: 'Synchroniser maintenant' }))
    // Le message s'affiche en bas de l'écran, et la carte propose de reconnecter la bague.
    expect(
      await within(screen.getByRole('status')).findByText(/^L’accès à Oura a expiré/),
    ).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Reconnecter ma bague' })).toBeEnabled()
    expect(screen.getByLabelText('Lien de retour')).toBeInTheDocument()
  })

  it('déconnectent la bague en gardant les données', async () => {
    const { user } = await renderApp('/more/oura', { setup: connected })
    await user.click(await screen.findByRole('button', { name: 'Déconnecter la bague' }))
    const confirm = await screen.findByRole('dialog', { name: /^Déconnecter la bague\s\?$/ })
    await user.click(within(confirm).getByRole('button', { name: 'Déconnecter' }))
    expect(await screen.findByText('Tout est prêt : connecte ta bague.')).toBeInTheDocument()
    expect(await db.secrets.count()).toBe(0)
    expect(await db.ouraDays.count()).toBe(1)
  })
})

describe('retour d’Oura', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
    resetOuraAutoSync()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('garde l’accès quand la demande vient de l’appli, puis revient aux réglages', async () => {
    stubRelay()
    storeOuraState('etat-1')
    const { router } = await renderApp(`/oura/callback#${RETURN}`, { setup: configured })
    expect(await screen.findByText('Bague Oura connectée')).toBeInTheDocument()
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/more/oura')
    })
    expect(router.state.location.hash).toBe('')
    expect(await db.secrets.get('oura')).toMatchObject({ value: 'jeton-abc' })
    expect(storedOuraState()).toBeNull()
    expect(await screen.findByText('Bague connectée')).toBeInTheDocument()
  })

  it('propose de copier le lien quand la page s’ouvre hors de l’appli', async () => {
    const { user } = await renderApp(`/oura/callback#${RETURN}`, { setup: configured })
    expect(await screen.findByRole('heading', { name: 'Dernière étape', level: 2 })).toBeInTheDocument()
    expect(screen.getByLabelText('Lien de retour')).toHaveValue(`${REDIRECT}#${RETURN}`)
    await user.click(screen.getByRole('button', { name: 'Copier le lien' }))
    expect(await screen.findByText('Lien copié')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(`${REDIRECT}#${RETURN}`)
    expect(await db.secrets.count()).toBe(0)
    expectFrenchSpacing()
  })

  it('explique un refus ou un lien incomplet', async () => {
    const { user, router } = await renderApp('/oura/callback#error=access_denied&state=etat-1')
    expect(await screen.findByRole('heading', { name: 'Accès refusé', level: 2 })).toBeInTheDocument()
    expect(screen.getByText(/^Tu as refusé l’accès dans Oura/)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Revenir aux réglages Oura' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/more/oura')
    })

    await router.navigate('/oura/callback#token_type=bearer')
    expect(await screen.findByRole('heading', { name: 'Lien incomplet', level: 2 })).toBeInTheDocument()
  })
})
