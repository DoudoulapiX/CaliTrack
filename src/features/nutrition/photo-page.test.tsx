import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { db } from '@/db/db'
import { saveSecret } from '@/db/secrets'
import { updateSettings } from '@/db/settings'
import { errorResponse, fakeAnthropicFetch, messageResponse, PLATE_ESTIMATE } from '@/test/anthropic'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'
import { preparePhoto, UnreadablePhotoError } from './photo'

// jsdom ne dessine pas d'image : la photo « réduite » est remplacée par un texte fixe.
vi.mock('./photo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./photo')>()),
  preparePhoto: vi.fn(),
}))

const PHOTO_PAGE = '/nutrition/photo?day=2026-10-21&meal=lunch'
const KEY = 'sk-ant-api03-test-0123456789abcdefghij'

const withKey = async () => {
  await saveSecret('anthropic', KEY)
  await updateSettings({ aiModel: 'claude-haiku-5-5' })
}

function stubFetch(...answers: (Response | Error)[]) {
  const fake = fakeAnthropicFetch(...answers)
  vi.stubGlobal('fetch', fake.fetchImpl)
  return fake
}

async function choosePhoto(user: UserEvent) {
  const photo = new File(['photo'], 'assiette.jpg', { type: 'image/jpeg' })
  await user.upload(await screen.findByLabelText(/^(Prendre ou choisir une photo|Changer de photo)$/), photo)
}

describe('photo du repas', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 9, 21, 12, 30))
    vi.mocked(preparePhoto).mockResolvedValue('SU1BR0U=')
    URL.createObjectURL = vi.fn(() => 'blob:photo')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('demande d’abord une clé Claude', async () => {
    const { user, router } = await renderApp(PHOTO_PAGE)
    expect(await screen.findByText('Ajoute ta clé Claude')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Ajouter ma clé' }))
    expect(
      await screen.findByRole('heading', { name: 'Intelligence artificielle', level: 1 }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/more/ai')
  })

  it('analyse la photo, laisse corriger, puis ajoute les aliments gardés', async () => {
    const { requests } = stubFetch(messageResponse(PLATE_ESTIMATE))
    const { user, router } = await renderApp(PHOTO_PAGE, { setup: withKey })
    expect(await screen.findByRole('heading', { name: 'Photo du repas', level: 1 })).toBeInTheDocument()
    expectFrenchSpacing()
    await choosePhoto(user)
    expect(screen.getByRole('img', { name: 'Ta photo' })).toHaveAttribute('src', 'blob:photo')
    await user.type(screen.getByLabelText('Précisions (facultatif)'), 'Riz au beurre')
    await user.click(screen.getByRole('button', { name: 'Analyser la photo' }))

    const list = await screen.findByRole('list', { name: 'Aliments reconnus' })
    expect(
      within(list)
        .getAllByRole('button')
        .map((row) => row.textContent.replace(/\s/g, ' ')),
    ).toEqual([
      'Blanc de poulet grillé150 g · 248 kcal',
      'Riz blanc cuit180 g · 234 kcal',
      'Haricots verts100 g · 31 kcal',
    ])
    expect(requests[0]?.body).toMatchObject({ model: 'claude-haiku-5-5' })
    expect(JSON.stringify(requests[0]?.body)).toContain('Précisions : Riz au beurre')
    expect(screen.getByRole('button', { name: 'Ajouter 3 aliments au déjeuner' })).toBeEnabled()
    expectFrenchSpacing()

    // Pas de haricots, et moitié moins de riz.
    await user.click(screen.getByRole('checkbox', { name: 'Garder Haricots verts' }))
    await user.click(within(list).getByRole('button', { name: /^Riz blanc cuit/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Corriger l’aliment' })
    await user.clear(within(sheet).getByLabelText('Quantité'))
    await user.type(within(sheet).getByLabelText('Quantité'), '90')
    await user.tab()
    expect(within(sheet).getByLabelText('Calories')).toHaveValue('117')
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer' }))
    expect(
      await within(list).findByRole('button', { name: /^Riz blanc cuit\s*90\sg · 117\skcal/ }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ajouter 2 aliments au déjeuner' }))
    expect(await screen.findByText('2 aliments ajoutés au déjeuner')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Nutrition', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/nutrition')
    const entries = await db.foodEntries.toArray()
    expect(
      entries.map(({ name, grams, source, meal, date }) => ({ name, grams, source, meal, date })),
    ).toEqual(
      expect.arrayContaining([
        { name: 'Blanc de poulet grillé', grams: 150, source: 'ai', meal: 'lunch', date: '2026-10-21' },
        { name: 'Riz blanc cuit', grams: 90, source: 'ai', meal: 'lunch', date: '2026-10-21' },
      ]),
    )
    expect(entries).toHaveLength(2)
  })

  it('renvoie aux réglages quand la clé est refusée', async () => {
    stubFetch(errorResponse(401, 'authentication_error'))
    const { user } = await renderApp(PHOTO_PAGE, { setup: withKey })
    await choosePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Analyser la photo' }))
    expect(await screen.findByRole('heading', { name: 'Analyse impossible', level: 2 })).toBeInTheDocument()
    expect(screen.getByText(/^Ta clé Claude est refusée/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Réglages de l’IA' })).toHaveAttribute('href', '/more/ai')
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
    expectFrenchSpacing()
  })

  it('compte chaque analyse facturée dans le coût du mois', async () => {
    stubFetch(errorResponse(429, 'rate_limit_error'), messageResponse(PLATE_ESTIMATE))
    const { user } = await renderApp(PHOTO_PAGE, { setup: withKey })
    await choosePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Analyser la photo' }))
    expect(await screen.findByText(/^Claude est très demandé/)).toBeInTheDocument()
    // Une erreur de l'API n'est pas facturée.
    expect(await db.aiUsage.count()).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('list', { name: 'Aliments reconnus' })).toBeInTheDocument()
    const row = await db.aiUsage.get('2026-10')
    expect(row).toMatchObject({ calls: 1, inputTokens: 1850, outputTokens: 420 })
    expect(row?.costUsd).toBeCloseTo((1850 * 0.1 + 420 * 0.5) / 1e6, 12)
  })

  it('propose de réessayer sans connexion', async () => {
    stubFetch(new TypeError('Load failed'), new TypeError('Load failed'), messageResponse(PLATE_ESTIMATE))
    const { user } = await renderApp(PHOTO_PAGE, { setup: withKey })
    await choosePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Analyser la photo' }))
    expect(await screen.findByText(/^Pas de connexion/, {}, { timeout: 5000 })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('list', { name: 'Aliments reconnus' })).toBeInTheDocument()
  })

  it('dit quand la photo ne montre pas de repas, ou ne s’ouvre pas', async () => {
    stubFetch(
      messageResponse({
        isMeal: false,
        problem: 'La photo montre un clavier : pas de nourriture.',
        items: [],
      }),
    )
    const { user } = await renderApp(PHOTO_PAGE, { setup: withKey })
    await choosePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Analyser la photo' }))
    expect(await screen.findByRole('heading', { name: 'Aucun repas reconnu', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('La photo montre un clavier : pas de nourriture.')).toBeInTheDocument()
    expectFrenchSpacing()

    vi.mocked(preparePhoto).mockRejectedValue(new UnreadablePhotoError())
    await choosePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Analyser la photo' }))
    expect(await screen.findByRole('heading', { name: 'Photo illisible', level: 2 })).toBeInTheDocument()
  })

  it('annule une analyse en cours', async () => {
    const pending = vi.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Annulé', 'AbortError'))
          })
        }),
    )
    vi.stubGlobal('fetch', pending)
    const { user } = await renderApp(PHOTO_PAGE, { setup: withKey })
    await choosePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Analyser la photo' }))
    expect(await screen.findByText('Claude regarde ton assiette…')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(await screen.findByRole('button', { name: 'Analyser la photo' })).toBeInTheDocument()
    expect(screen.queryByText('Claude regarde ton assiette…')).not.toBeInTheDocument()
  })
})
