import { screen, within } from '@testing-library/react'
import { db } from '@/db/db'
import { errorResponse, fakeAnthropicFetch } from '@/test/anthropic'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'

const KEY = 'sk-ant-api03-test-0123456789abcdefghij'

const modelsOk = () =>
  new Response(JSON.stringify({ data: [], has_more: false, first_id: null, last_id: null }), {
    headers: { 'content-type': 'application/json' },
  })

function stubFetch(...answers: (Response | Error)[]) {
  const fake = fakeAnthropicFetch(...answers)
  vi.stubGlobal('fetch', fake.fetchImpl)
  return fake
}

describe('réglages de l’IA', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('s’ouvrent depuis « Plus »', async () => {
    const { user } = await renderApp('/more')
    await user.click(await screen.findByRole('link', { name: /^Intelligence artificielle/ }))
    expect(
      await screen.findByRole('heading', { name: 'Intelligence artificielle', level: 1 }),
    ).toBeInTheDocument()
    expectFrenchSpacing()
  })

  it('vérifient la clé avant de la garder, puis la masquent', async () => {
    const { requests } = stubFetch(errorResponse(401, 'authentication_error'), modelsOk(), modelsOk())
    const { user } = await renderApp('/more/ai')
    const field = await screen.findByLabelText('Clé API Claude')
    expect(field).toHaveAttribute('type', 'password')

    await user.type(field, 'ma clé')
    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ce n’est pas une clé Claude : elle commence par « sk-ant- ».',
    )
    expect(requests).toHaveLength(0)

    await user.clear(field)
    await user.type(field, KEY)
    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Anthropic refuse cette clé/)
    expect(await db.secrets.count()).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    expect(await screen.findByText('Clé enregistrée', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('sk-ant-…ghij')).toBeInTheDocument()
    expect(screen.queryByText(KEY)).not.toBeInTheDocument()
    expect(await db.secrets.get('anthropic')).toMatchObject({ value: KEY })
    expect(requests.map((request) => request.headers.get('x-api-key'))).toEqual([KEY, KEY])

    await user.click(screen.getByRole('button', { name: 'Vérifier la clé' }))
    expect(await screen.findByText('Ta clé fonctionne')).toBeInTheDocument()
  })

  it('gardent une clé sans connexion, et la suppriment sur demande', async () => {
    stubFetch(new TypeError('Load failed'), new TypeError('Load failed'))
    const { user } = await renderApp('/more/ai')
    await user.type(await screen.findByLabelText('Clé API Claude'), KEY)
    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    expect(
      await screen.findByText('Clé enregistrée, pas encore vérifiée', {}, { timeout: 5000 }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Supprimer la clé' }))
    const confirm = await screen.findByRole('dialog', { name: /^Supprimer la clé\s\?$/ })
    expectFrenchSpacing()
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByLabelText('Clé API Claude')).toHaveValue('')
    expect(await db.secrets.count()).toBe(0)
  })

  it('changent de modèle', async () => {
    const { user } = await renderApp('/more/ai')
    expect(await screen.findByText('Le plus précis, le plus cher.')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Haiku 5.5' }))
    expect(await screen.findByText('Le moins cher, un peu moins précis.')).toBeInTheDocument()
    expect((await db.settings.get('app'))?.aiModel).toBe('claude-haiku-5-5')
  })
})
