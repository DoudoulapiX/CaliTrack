import { act, screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { canRetry, needsAiSettings, problemText } from '@/features/ai/ai-view'
import { preparePhoto, UnreadablePhotoError } from '@/features/nutrition/photo'
import { db } from '@/db/db'
import { saveSecret } from '@/db/secrets'
import type { PantryPlace } from '@/db/types'
import { AI_ERROR_CASES, fakeAnthropicFetch, FRIDGE_ITEMS, streamResponse } from '@/test/anthropic'
import { pantryItem } from '@/test/fixtures'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'

// jsdom ne dessine pas d'image : la photo « réduite » est remplacée par un texte fixe.
vi.mock('@/features/nutrition/photo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/nutrition/photo')>()),
  preparePhoto: vi.fn(),
}))

const PAGE = '/nutrition/kitchen/photo'
const KEY = 'sk-ant-api03-test-0123456789abcdefghij'

const withKey = () => saveSecret('anthropic', KEY)

function stubFetch(...answers: (Response | Error)[]) {
  const fake = fakeAnthropicFetch(...answers)
  vi.stubGlobal('fetch', fake.fetchImpl)
  return fake
}

async function choosePhoto(user: UserEvent, label = /^(Prendre ou choisir une photo|Changer de photo)$/) {
  const photo = new File(['photo'], 'frigo.jpg', { type: 'image/jpeg' })
  await user.upload(await screen.findByLabelText(label), photo)
}

/** Les aliments d'un rangement, par ordre alphabétique. */
async function namesIn(place: PantryPlace): Promise<string[]> {
  const items = await db.pantryItems.where('place').equals(place).toArray()
  return items.map((item) => item.name).sort((a, b) => a.localeCompare(b, 'fr'))
}

describe('photo du frigo', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
    vi.mocked(preparePhoto).mockResolvedValue('SU1BR0U=')
    URL.createObjectURL = vi.fn(() => 'blob:photo')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('n’appelle jamais Claude sans un geste', async () => {
    const fake = stubFetch()
    const { user } = await renderApp(PAGE, { setup: withKey })
    expect(await screen.findByRole('heading', { name: 'Photo du frigo', level: 1 })).toBeInTheDocument()
    await choosePhoto(user)
    expect(screen.getByRole('button', { name: 'Analyser la photo' })).toBeInTheDocument()
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(fake.requests).toHaveLength(0)
  })

  it('demande d’abord une clé Claude', async () => {
    const { user, router } = await renderApp(PAGE)
    expect(await screen.findByText('Ajoute ta clé Claude pour utiliser le coach.')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Ajouter ma clé' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/more/ai')
    })
  })

  it('fait vérifier les aliments vus, puis les ajoute au frigo sans doublon', async () => {
    const { requests } = stubFetch(streamResponse(FRIDGE_ITEMS))
    const { user, router } = await renderApp(PAGE, {
      setup: async () => {
        await withKey()
        await db.pantryItems.bulkPut([
          pantryItem({ id: 'p1', name: 'oeufs', quantity: '2' }),
          pantryItem({ id: 'p2', name: 'Beurre' }),
          pantryItem({ id: 'p3', place: 'cupboard', name: 'Riz' }),
        ])
      },
    })
    await choosePhoto(user)
    expect(screen.getByRole('img', { name: 'Ta photo' })).toHaveAttribute('src', 'blob:photo')
    expect(screen.getByText('Environ 4 centimes avec Opus 5.5')).toBeInTheDocument()
    expectFrenchSpacing()
    await user.click(screen.getByRole('button', { name: 'Analyser la photo' }))

    const list = await screen.findByRole('list', { name: 'Aliments vus' })
    expect(
      within(list)
        .getAllByRole('group')
        .map((row) => row.getAttribute('aria-label')),
    ).toEqual(FRIDGE_ITEMS.items.map((item) => item.name))
    expect(screen.getByRole('button', { name: 'Enregistrer 7 aliments' })).toBeEnabled()
    expect(JSON.stringify(requests[0]?.body)).toContain('Voici une photo de mon frigo.')
    expectFrenchSpacing()

    // Pas de lait ; des yaourts grecs ; cinq tomates.
    await user.click(screen.getByRole('checkbox', { name: 'Garder Lait demi-écrémé' }))
    const yogurt = within(screen.getByRole('group', { name: 'Yaourts nature' })).getByRole('textbox', {
      name: 'Nom',
    })
    await user.clear(yogurt)
    expect(screen.getByRole('button', { name: 'Enregistrer 5 aliments' })).toBeEnabled()
    await user.type(yogurt, 'Yaourts grecs')
    const tomatoes = within(screen.getByRole('group', { name: 'Tomates' })).getByRole('textbox', {
      name: 'Quantité',
    })
    await user.clear(tomatoes)
    await user.type(tomatoes, '5')
    expect(screen.getByRole('radio', { name: 'Ajouter à la liste' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'Enregistrer 6 aliments' }))

    // Les œufs étaient déjà là (« oeufs ») : cinq aliments ajoutés.
    expect(await screen.findByText('5 aliments ajoutés au frigo')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Frigo et placards', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/nutrition/kitchen')
    expect(await namesIn('fridge')).toEqual([
      'Beurre',
      'Blanc de poulet',
      'Courgette',
      'Emmental râpé',
      'oeufs',
      'Tomates',
      'Yaourts grecs',
    ])
    expect(await namesIn('cupboard')).toEqual(['Riz'])
    expect(await db.pantryItems.where('place').equals('fridge').toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Tomates', quantity: '5', source: 'photo' }),
        expect.objectContaining({ name: 'oeufs', quantity: '2', source: 'manual' }),
      ]),
    )
    expect(await db.aiUsage.get('2026-10')).toMatchObject({ calls: 1, inputTokens: 1850, outputTokens: 420 })
  })

  it('remplace ce qui était noté dans les placards, et seulement là', async () => {
    const { requests } = stubFetch(streamResponse(FRIDGE_ITEMS))
    const { user } = await renderApp(PAGE, {
      setup: async () => {
        await withKey()
        await db.pantryItems.bulkPut([
          pantryItem({ id: 'p1', name: 'Beurre' }),
          pantryItem({ id: 'p2', place: 'cupboard', name: 'Riz' }),
          pantryItem({ id: 'p3', place: 'cupboard', name: 'Pâtes' }),
        ])
      },
    })
    await user.click(await screen.findByRole('radio', { name: 'Placards' }))
    await choosePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Analyser la photo' }))
    await screen.findByRole('list', { name: 'Aliments vus' })
    expect(JSON.stringify(requests[0]?.body)).toContain('Voici une photo de mes placards.')

    await user.click(screen.getByRole('radio', { name: 'Remplacer les placards' }))
    expect(
      screen.getByText('Ce qui est noté dans tes placards est effacé, puis remplacé par cette liste.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enregistrer 7 aliments' }))

    expect(await screen.findByText('7 aliments ajoutés aux placards')).toBeInTheDocument()
    expect(await namesIn('cupboard')).toEqual(
      FRIDGE_ITEMS.items.map((item) => item.name).sort((a, b) => a.localeCompare(b, 'fr')),
    )
    expect(await namesIn('fridge')).toEqual(['Beurre'])
  })

  it('garde la liste à vérifier quand l’enregistrement échoue', async () => {
    stubFetch(streamResponse(FRIDGE_ITEMS))
    const { user, router } = await renderApp(PAGE, { setup: withKey })
    await choosePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Analyser la photo' }))
    await screen.findByRole('list', { name: 'Aliments vus' })
    vi.spyOn(db.pantryItems, 'bulkPut').mockRejectedValueOnce(new Error('Disque plein.'))
    await user.click(screen.getByRole('button', { name: 'Enregistrer 7 aliments' }))

    expect(await screen.findByText('Disque plein.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer 7 aliments' })).toBeEnabled()
    expect(screen.getByRole('list', { name: 'Aliments vus' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(PAGE)
    expect(await db.pantryItems.count()).toBe(0)
  })

  it('dit quand la photo ne montre pas d’aliments, et propose d’en reprendre une', async () => {
    stubFetch(streamResponse({ readable: false, problem: 'Je ne vois qu’un mur : pas de frigo.', items: [] }))
    const { user } = await renderApp(PAGE, { setup: withKey })
    await choosePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Analyser la photo' }))
    expect(
      await screen.findByRole('heading', { name: 'Aucun aliment reconnu', level: 2 }),
    ).toBeInTheDocument()
    expect(screen.getByText('Je ne vois qu’un mur : pas de frigo.')).toBeInTheDocument()
    expectFrenchSpacing()
    // La réponse est facturée, même sans aliment.
    expect(await db.aiUsage.get('2026-10')).toMatchObject({ calls: 1 })

    await choosePhoto(user, /^Reprendre une photo$/)
    expect(await screen.findByRole('button', { name: 'Analyser la photo' })).toBeInTheDocument()
    expect(await db.pantryItems.count()).toBe(0)
  })

  it('n’envoie rien quand la photo ne s’ouvre pas', async () => {
    const fake = stubFetch()
    vi.mocked(preparePhoto).mockRejectedValue(new UnreadablePhotoError())
    const { user } = await renderApp(PAGE, { setup: withKey })
    await choosePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Analyser la photo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cette photo ne s’ouvre pas : choisis-en une autre.',
    )
    expect(fake.requests).toHaveLength(0)
    expectFrenchSpacing()
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
    const { user } = await renderApp(PAGE, { setup: withKey })
    await choosePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Analyser la photo' }))
    expect(await screen.findByText('Claude regarde ta photo…')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(await screen.findByRole('button', { name: 'Analyser la photo' })).toBeInTheDocument()
    expect(screen.queryByText('Claude regarde ta photo…')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await db.pantryItems.count()).toBe(0)
  })

  it.each(AI_ERROR_CASES)('dit ce qui ne va pas : $name', async ({ answers, problem }) => {
    stubFetch(...answers())
    const { user } = await renderApp(PAGE, { setup: withKey })
    await choosePhoto(user)
    await user.click(screen.getByRole('button', { name: 'Analyser la photo' }))
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 })
    expect(alert).toHaveTextContent(problemText(problem, 'fridge').replace(/\s/g, ' '))
    expect(screen.queryByRole('button', { name: 'Réessayer' }) !== null).toBe(canRetry(problem))
    expect(screen.queryByRole('link', { name: 'Réglages de l’IA' }) !== null).toBe(needsAiSettings(problem))
    expect(screen.getByLabelText('Changer de photo')).toBeInTheDocument()
    expectFrenchSpacing()
    expect(await db.pantryItems.count()).toBe(0)
  })
})
