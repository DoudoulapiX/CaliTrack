import { act, screen, within } from '@testing-library/react'
import { db } from '@/db/db'
import { errorResponse, fakeOpenAiFetch, modelsResponse } from '@/test/openai'
import { aiUsageRow } from '@/test/fixtures'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'

const KEY = 'sk-proj-test-0123456789abcdefghij'

const modelsOk = modelsResponse

function stubFetch(...answers: (Response | Error)[]) {
  const fake = fakeOpenAiFetch(...answers)
  vi.stubGlobal('fetch', fake.fetchImpl)
  return fake
}

describe('réglages de l’IA', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
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
    const { requests } = stubFetch(errorResponse(401, 'invalid_api_key'), modelsOk(), modelsOk())
    const { user } = await renderApp('/more/ai')
    const field = await screen.findByLabelText('Clé API OpenAI')
    expect(field).toHaveAttribute('type', 'password')

    await user.type(field, 'ma clé')
    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ce n’est pas une clé OpenAI : elle commence par « sk-proj- » ou « sk- ».',
    )
    // Une clé Claude collée par habitude : on le dit, sans l'envoyer nulle part.
    await user.clear(field)
    await user.type(field, 'sk-ant-api03-test-0123456789abcdefghij')
    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'C’est une clé Claude : colle ici une clé OpenAI, qui commence par « sk-proj- ».',
    )
    expect(requests).toHaveLength(0)

    await user.clear(field)
    await user.type(field, KEY)
    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/^OpenAI refuse cette clé/)
    expect(await db.secrets.count()).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    expect(await screen.findByText('Clé enregistrée', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('sk-proj-…ghij')).toBeInTheDocument()
    expect(screen.queryByText(KEY)).not.toBeInTheDocument()
    expect(await db.secrets.get('openai')).toMatchObject({ value: KEY })
    expect(requests.map((request) => request.headers.get('authorization'))).toEqual([
      `Bearer ${KEY}`,
      `Bearer ${KEY}`,
    ])
    expect(requests.map((request) => request.url)).toEqual([
      'https://api.openai.com/v1/models',
      'https://api.openai.com/v1/models',
    ])

    await user.click(screen.getByRole('button', { name: 'Vérifier la clé' }))
    expect(await screen.findByText('Ta clé fonctionne')).toBeInTheDocument()
  })

  it('gardent une clé sans connexion, et la suppriment sur demande', async () => {
    stubFetch(new TypeError('Load failed'), new TypeError('Load failed'))
    const { user } = await renderApp('/more/ai')
    await user.type(await screen.findByLabelText('Clé API OpenAI'), KEY)
    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    expect(
      await screen.findByText('Clé enregistrée, pas encore vérifiée', {}, { timeout: 5000 }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Supprimer la clé' }))
    const confirm = await screen.findByRole('dialog', { name: /^Supprimer la clé\s\?$/ })
    expect(
      within(confirm).getByText(
        'Le coach et l’analyse des photos ne marcheront plus tant que tu n’en colles pas une autre.',
      ),
    ).toBeInTheDocument()
    expectFrenchSpacing()
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByLabelText('Clé API OpenAI')).toHaveValue('')
    expect(await db.secrets.count()).toBe(0)
  })

  it('changent de modèle', async () => {
    const { user } = await renderApp('/more/ai')
    expect(await screen.findByText('Bon compromis entre précision et prix.')).toBeInTheDocument()
    expect(screen.getByText(/^Crée ta clé sur platform\.openai\.com/)).toHaveTextContent(
      'L’abonnement ChatGPT ne compte pas',
    )
    await user.click(screen.getByRole('radio', { name: 'GPT-6 Luna' }))
    expect(await screen.findByText('Le moins cher, un peu moins précis.')).toBeInTheDocument()
    expect((await db.settings.get('app'))?.aiModel).toBe('gpt-6-luna')
  })

  it('estiment le coût d’un mois avec chaque modèle et comptent les demandes du mois', async () => {
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
    const { user } = await renderApp('/more/ai', {
      // Le mois dernier ne compte pas.
      setup: () => db.aiUsage.put(aiUsageRow({ month: '2026-09', calls: 12, costUsd: 0.9 })),
    })
    expect(await screen.findByText('Aucune demande ce mois-ci.')).toBeInTheDocument()
    expect(
      screen.getByText(/^Chaque demande au coach et chaque analyse de photo est facturée/),
    ).toHaveTextContent(/CaliTrack ne garde pas les photos\.$/)
    expect(screen.getByText('GPT-6.2 Astra : environ 13,44 $')).toBeInTheDocument()
    expect(screen.getByText('GPT-6.2 Sol : environ 3,36 $ (choisi)')).toBeInTheDocument()
    expect(screen.getByText('GPT-6 Luna : environ 0,17 $')).toBeInTheDocument()
    expect(
      screen.getByText('Estimation calculée sur cet iPhone ; ta facture OpenAI fait foi.'),
    ).toBeInTheDocument()
    expectFrenchSpacing()

    await act(async () => {
      await db.aiUsage.put(aiUsageRow({ month: '2026-10', calls: 37, costUsd: 0.42 }))
    })
    expect(await screen.findByText('Ce mois-ci sur cet iPhone : 0,42 $ pour 37 demandes')).toBeInTheDocument()
    expect(screen.queryByText('Aucune demande ce mois-ci.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'GPT-6 Luna' }))
    expect(await screen.findByText('GPT-6 Luna : environ 0,17 $ (choisi)')).toBeInTheDocument()
    expect(screen.getByText('GPT-6.2 Sol : environ 3,36 $')).toBeInTheDocument()
    expectFrenchSpacing()
  })
})
