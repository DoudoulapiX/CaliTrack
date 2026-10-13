import { act, screen, waitFor, within } from '@testing-library/react'
import { canRetry, needsAiSettings, problemText } from '@/features/ai/ai-view'
import { ZERO_NUTRIENTS } from '@/content/nutrition/nutrients'
import { db } from '@/db/db'
import { addEntries, quickEntry } from '@/db/nutrition'
import { saveSecret } from '@/db/secrets'
import { updateProfile } from '@/db/settings'
import { AI_ERROR_CASES, fakeAnthropicFetch, IDEAS, streamResponse } from '@/test/anthropic'
import { pantryItem } from '@/test/fixtures'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'

const PAGE = '/nutrition/kitchen/ideas'
const KEY = 'sk-ant-api03-test-0123456789abcdefghij'

/** Homme, 30 ans, 1,80 m, 80 kg, en maintien : 2 760 kcal, 145 g de protéines, 375 g de glucides, 75 g de lipides. */
const charles = () => updateProfile({ sex: 'male', birthYear: 1996, heightCm: 180, weightKg: 80 })

/** Des œufs et une courgette au frigo, du riz aux placards. */
const stocked = () =>
  db.pantryItems.bulkPut([
    pantryItem({ id: 'p1', place: 'cupboard', name: 'Riz', quantity: '1 kg' }),
    pantryItem({ id: 'p2', name: 'Œufs', quantity: '6' }),
    pantryItem({ id: 'p3', name: 'Courgette', quantity: '1' }),
  ])

/** Un petit-déjeuner de 650 kcal noté ce jour-là. */
const breakfast = (day: string) =>
  addEntries([
    quickEntry(
      'Petit-déjeuner',
      { ...ZERO_NUTRIENTS, kcal: 650, protein: 45, carbs: 70, fat: 18 },
      day,
      'breakfast',
    ),
  ])

const withEverything =
  (day = '2026-10-21') =>
  async () => {
    await saveSecret('anthropic', KEY)
    await charles()
    await stocked()
    await breakfast(day)
  }

function stubFetch(...answers: (Response | Error)[]) {
  const fake = fakeAnthropicFetch(...answers)
  vi.stubGlobal('fetch', fake.fetchImpl)
  return fake
}

/** Les cases d'une carte de valeurs (« Calories 2 110 kcal »). */
function tiles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('dl > div'), (tile) =>
    [tile.querySelector('dt')?.textContent, tile.querySelector('dd')?.textContent]
      .join(' ')
      .replace(/\s/g, ' '),
  )
}

function section(title: string | RegExp): HTMLElement {
  const found = screen.getByRole('heading', { name: title, level: 2 }).closest('section')
  if (!found) throw new Error(`Section ${String(title)} introuvable`)
  return found
}

describe('idées de repas', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('n’appelle jamais Claude sans un geste', async () => {
    const fake = stubFetch()
    await renderApp(PAGE, { setup: withEverything() })
    expect(await screen.findByRole('heading', { name: 'Idées de repas', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Proposer des idées' })).toBeEnabled()
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(fake.requests).toHaveLength(0)
  })

  it('demande d’abord une clé Claude', async () => {
    await renderApp(PAGE)
    expect(await screen.findByText('Ajoute ta clé Claude pour utiliser le coach.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ajouter ma clé' })).toHaveAttribute('href', '/more/ai')
  })

  it('montre ce qui reste, et bloque le mode « ce que j’ai » quand le frigo est vide', async () => {
    const { user } = await renderApp(PAGE, {
      setup: async () => {
        await saveSecret('anthropic', KEY)
        await charles()
        await breakfast('2026-10-21')
      },
    })
    await screen.findByRole('heading', { name: 'Reste pour aujourd’hui', level: 2 })
    expect(tiles(section('Reste pour aujourd’hui'))).toEqual([
      'Calories 2 110 kcal',
      'Protéines 100 g',
      'Glucides 305 g',
      'Lipides 57 g',
    ])
    // À 11 h, le prochain repas est le déjeuner.
    expect(screen.getByRole('radio', { name: 'Déjeuner' })).toHaveAttribute('aria-checked', 'true')
    const strict = screen.getByRole('switch', { name: 'Seulement avec ce que j’ai' })
    expect(strict).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Aucun aliment noté')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ajoute d’abord ce que tu as dans ton frigo.' })).toHaveAttribute(
      'href',
      '/nutrition/kitchen',
    )
    expect(screen.getByRole('button', { name: 'Proposer des idées' })).toBeDisabled()
    expect(screen.getByText('Environ 9 centimes avec Opus 5.5')).toBeInTheDocument()
    expectFrenchSpacing()

    await user.click(strict)
    expect(screen.getByRole('button', { name: 'Proposer des idées' })).toBeEnabled()
    expect(screen.queryByRole('link', { name: /^Ajoute d’abord/ })).not.toBeInTheDocument()
  })

  it('propose des idées, puis ajoute celle choisie, corrigée, au bon repas du bon jour', async () => {
    const { requests } = stubFetch(streamResponse(IDEAS))
    const { user, router } = await renderApp(`${PAGE}?day=2026-10-20&meal=dinner`, {
      setup: withEverything('2026-10-20'),
    })
    expect(
      await screen.findByRole('heading', { name: 'Reste pour le 20 octobre', level: 2 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Dîner' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('3 aliments notés')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Une envie ? (facultatif)'), 'Quelque chose de chaud')
    await user.click(screen.getByRole('button', { name: 'Proposer des idées' }))

    await screen.findByRole('heading', { name: 'Idées du coach', level: 2 })
    const ideas = section('Idées du coach')
    expect(
      await within(ideas).findByRole('heading', { name: 'Omelette aux courgettes', level: 3 }),
    ).toBeInTheDocument()
    expect(
      within(ideas)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Omelette aux courgettes', 'Poulet, riz et tomates'])
    expect(
      within(ideas).getByText('Il te restera ensuite 1 819 kcal et 75 g de protéines.'),
    ).toBeInTheDocument()
    expect(within(ideas).getByText('15 min')).toBeInTheDocument()
    expect(within(ideas).getAllByText('à acheter')).toHaveLength(1)
    expect(within(ideas).getByText('Fais cuire le riz.')).toBeInTheDocument()
    expectFrenchSpacing()

    // La demande : le frigo et l'envie entre balises, ce qui reste, le repas, sans espace insécable.
    expect(requests).toHaveLength(1)
    const body = requests[0]?.body as { model: string; messages: { content: { text: string }[] }[] }
    expect(body.model).toBe('claude-opus-5-5')
    const text = body.messages[0]?.content[0]?.text ?? ''
    expect(text).toContain('Repas : dîner')
    expect(text).toContain(
      'Reste à manger pour la journée : 2110 kcal, 100 g de protéines, 305 g de glucides, 57 g de lipides',
    )
    expect(text).toContain("seulement ceux de l'inventaire")
    expect(text).toContain(
      '<inventaire>\n- Frigo : Œufs (6)\n- Frigo : Courgette (1)\n- Placards : Riz (1 kg)\n</inventaire>',
    )
    expect(text).toContain('<demande>\nQuelque chose de chaud\n</demande>')
    expect(JSON.stringify(body)).not.toMatch(/[\u00a0\u202f]/)

    await user.click(within(ideas).getByRole('button', { name: 'Choisir Poulet, riz et tomates' }))
    const list = await screen.findByRole('list', { name: 'Ingrédients' })
    expect(screen.getByRole('heading', { name: 'Poulet, riz et tomates', level: 2 })).toBeInTheDocument()
    expect(
      within(list)
        .getAllByRole('button')
        .map((row) => row.textContent.replace(/\s/g, ' ')),
    ).toEqual([
      'Blanc de poulet150 g · 248 kcal',
      'Riz blanc cuit180 g · 234 kcalà acheter',
      'Tomates150 g · 27 kcal',
    ])
    expect(within(list).getByText('à acheter')).toBeInTheDocument()

    // Pas de tomates, et moitié moins de riz.
    await user.click(screen.getByRole('checkbox', { name: 'Garder Tomates' }))
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
    expect(tiles(section('Total'))).toEqual([
      'Calories 365 kcal',
      'Protéines 49 g',
      'Glucides 26 g',
      'Lipides 5,7 g',
    ])
    expectFrenchSpacing()

    await user.click(screen.getByRole('button', { name: 'Ajouter 2 aliments au dîner' }))
    expect(await screen.findByText('2 aliments ajoutés au dîner')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Nutrition', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/nutrition')
    expect(router.state.location.search).toBe('?day=2026-10-20')
    const added = (await db.foodEntries.toArray()).filter((entry) => entry.source === 'ai')
    expect(added.map(({ name, grams, source, meal, date }) => ({ name, grams, source, meal, date }))).toEqual(
      expect.arrayContaining([
        { name: 'Blanc de poulet', grams: 150, source: 'ai', meal: 'dinner', date: '2026-10-20' },
        { name: 'Riz blanc cuit', grams: 90, source: 'ai', meal: 'dinner', date: '2026-10-20' },
      ]),
    )
    expect(added).toHaveLength(2)
    expect(await db.aiUsage.get('2026-10')).toMatchObject({ calls: 1 })
  })

  it('revient aux idées sans redemander, et change de repas', async () => {
    const { requests } = stubFetch(streamResponse(IDEAS))
    const { user } = await renderApp(PAGE, { setup: withEverything() })
    await user.click(await screen.findByRole('button', { name: 'Proposer des idées' }))
    await user.click(await screen.findByRole('button', { name: 'Choisir Omelette aux courgettes' }))
    await user.click(await screen.findByRole('radio', { name: 'Collation' }))
    expect(screen.getByRole('button', { name: 'Ajouter 2 aliments à la collation' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Revenir aux idées' }))
    expect(await screen.findByRole('button', { name: 'Choisir Poulet, riz et tomates' })).toBeInTheDocument()
    expect(requests).toHaveLength(1)
  })

  it('montre l’idée choisie depuis le haut, puis ramène à sa carte', async () => {
    stubFetch(streamResponse(IDEAS))
    const scrollTo = vi.spyOn(window, 'scrollTo')
    const scrolled: Element[] = []
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      scrolled.push(this)
    })
    const { user } = await renderApp(PAGE, { setup: withEverything() })
    await user.click(await screen.findByRole('button', { name: 'Proposer des idées' }))
    await user.click(await screen.findByRole('button', { name: 'Choisir Poulet, riz et tomates' }))
    // L'idée choisie remplace la liste, plus longue : elle se montre depuis le haut.
    expect(
      await screen.findByRole('heading', { name: 'Poulet, riz et tomates', level: 2 }),
    ).toBeInTheDocument()
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0)
    expect(scrolled).toEqual([])

    // De retour sur la carte de l'idée regardée, plus bas que le formulaire.
    await user.click(screen.getByRole('button', { name: 'Revenir aux idées' }))
    expect(await screen.findByRole('button', { name: 'Choisir Omelette aux courgettes' })).toBeInTheDocument()
    expect(scrolled).toHaveLength(1)
    expect(scrolled[0]).toHaveTextContent(/^Poulet, riz et tomates/)
  })

  it('reste sur l’idée choisie quand l’ajout au journal échoue', async () => {
    stubFetch(streamResponse(IDEAS))
    const { user, router } = await renderApp(`${PAGE}?day=2026-10-21&meal=lunch`, {
      setup: withEverything(),
    })
    await user.click(await screen.findByRole('button', { name: 'Proposer des idées' }))
    await user.click(await screen.findByRole('button', { name: 'Choisir Omelette aux courgettes' }))
    vi.spyOn(db.foodEntries, 'bulkPut').mockRejectedValueOnce(new Error('Disque plein.'))
    await user.click(await screen.findByRole('button', { name: 'Ajouter 2 aliments au déjeuner' }))

    expect(await screen.findByText('Disque plein.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter 2 aliments au déjeuner' })).toBeEnabled()
    expect(screen.getByRole('list', { name: 'Ingrédients' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(PAGE)
    expect((await db.foodEntries.toArray()).filter((entry) => entry.source === 'ai')).toEqual([])
  })

  it('travaille sans objectifs définis, courses permises', async () => {
    const { requests } = stubFetch(streamResponse(IDEAS))
    const { user } = await renderApp(PAGE, { setup: () => saveSecret('anthropic', KEY) })
    expect(await screen.findByText('Objectifs non définis')).toBeInTheDocument()
    expect(screen.getByText(/^Ajoute ton âge/)).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Seulement avec ce que j’ai' }))
    await user.click(screen.getByRole('button', { name: 'Proposer des idées' }))
    expect(
      await screen.findByRole('heading', { name: 'Omelette aux courgettes', level: 3 }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^Il te restera/)).not.toBeInTheDocument()
    const text = JSON.stringify(requests[0]?.body)
    expect(text).toContain('objectifs non définis')
    expect(text).toContain('quelques courses si besoin')
    expectFrenchSpacing()
  })

  it('annule une demande en cours', async () => {
    const pending = vi.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Annulé', 'AbortError'))
          })
        }),
    )
    vi.stubGlobal('fetch', pending)
    const { user } = await renderApp(PAGE, { setup: withEverything() })
    await user.click(await screen.findByRole('button', { name: 'Proposer des idées' }))
    expect(await screen.findByText('Le coach cherche des idées…')).toBeInTheDocument()
    await waitFor(() => {
      expect(pending).toHaveBeenCalledTimes(1)
    })
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(await screen.findByRole('button', { name: 'Proposer des idées' })).toBeEnabled()
    // La demande est vraiment coupée : sa réponse ne remplacera pas le formulaire.
    expect(pending.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    expect(screen.queryByText('Le coach cherche des idées…')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each(AI_ERROR_CASES)('dit ce qui ne va pas : $name', async ({ answers, problem }) => {
    stubFetch(...answers())
    const { user } = await renderApp(PAGE, { setup: withEverything() })
    await user.click(await screen.findByRole('button', { name: 'Proposer des idées' }))
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 })
    expect(alert).toHaveTextContent(problemText(problem, 'ideas').replace(/\s/g, ' '))
    expect(screen.queryByRole('button', { name: 'Réessayer' }) !== null).toBe(canRetry(problem))
    expect(screen.queryByRole('link', { name: 'Réglages de l’IA' }) !== null).toBe(needsAiSettings(problem))
    expect(screen.queryByRole('heading', { name: 'Idées du coach' })).not.toBeInTheDocument()
    expectFrenchSpacing()
  })

  it('réessaie après un problème passager', async () => {
    const { requests } = stubFetch(streamResponse({ ideas: [] }), streamResponse(IDEAS))
    const { user } = await renderApp(PAGE, { setup: withEverything() })
    await user.click(await screen.findByRole('button', { name: 'Proposer des idées' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le coach n’a pas pu proposer d’idées. Réessaie.',
    )
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(
      await screen.findByRole('heading', { name: 'Poulet, riz et tomates', level: 3 }),
    ).toBeInTheDocument()
    expect(requests).toHaveLength(2)
    await waitFor(async () => {
      expect(await db.aiUsage.get('2026-10')).toMatchObject({ calls: 2 })
    })
  })
})
