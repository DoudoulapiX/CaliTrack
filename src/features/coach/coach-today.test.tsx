import { screen, waitFor, within } from '@testing-library/react'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages'
import { db } from '@/db/db'
import { saveProgram } from '@/db/programs'
import { saveSecret } from '@/db/secrets'
import { updateProfile, updateSettings } from '@/db/settings'
import type { ProgramSession, ProgramSlot } from '@/db/types'
import {
  AI_ERROR_CASES,
  DAILY_LIGHTER,
  DAILY_REST,
  DAILY_TIPS,
  fakeAnthropicFetch,
  streamController,
  streamResponse,
  type Answer,
  type RecordedRequest,
} from '@/test/anthropic'
import { coachChange, coachDay, programSession, testProgram } from '@/test/fixtures'
import { ouraDay } from '@/test/oura'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'
import { problemText } from '@/features/ai/ai-view'

// Les horloges de la séance en direct ne tournent pas pendant les tests.
vi.mock('@/features/workout/useNow', () => ({ useNow: () => Date.now() }))

const COACH_PAGE = '/training/coach'
const DATE = '2026-10-21'
const KEY = 'sk-ant-api03-test-0123456789abcdefghij'
const NBSP = /[\u00a0\u202f]/

function slot(id: string, exerciseId: string, patch: Partial<ProgramSlot> = {}): ProgramSlot {
  return {
    id,
    ladderId: null,
    exerciseId,
    sets: 3,
    target: { kind: 'reps', min: 8, max: 12 },
    loadKg: null,
    restSec: 120,
    note: '',
    successStreak: 0,
    failStreak: 0,
    ...patch,
  }
}

/** La séance B du mercredi : 4 séries de tractions, 3 de pompes. */
const SESSION_B: ProgramSession = {
  id: 'B',
  name: 'Séance B',
  emphasis: 'full',
  weekdays: [3],
  blocks: [
    {
      id: 'b1',
      kind: 'strength',
      title: 'Renforcement',
      slots: [
        slot('slot-1', 'pullup', { ladderId: 'pullV', sets: 4, target: { kind: 'reps', min: 5, max: 8 } }),
        slot('slot-2', 'pushup', { ladderId: 'pushH' }),
      ],
    },
  ],
}

/** Clé Claude, prénom, et le programme avec la séance B prévue aujourd'hui. */
async function withProgram() {
  await saveSecret('anthropic', KEY)
  await updateSettings({ aiModel: 'claude-haiku-5-5' })
  await updateProfile({ firstName: 'Charles' })
  await saveProgram(testProgram({ sessions: [programSession('A', [1, 4]), SESSION_B] }))
}

/** La bague a noté la nuit d'aujourd'hui, et la journée complète d'hier. */
async function withOura() {
  await db.ouraDays.bulkPut([ouraDay('2026-10-20', { totalKcal: 2650 }), ouraDay(DATE)])
}

function stubFetch(...answers: (Response | Error | Answer)[]) {
  const fake = fakeAnthropicFetch(...answers)
  vi.stubGlobal('fetch', fake.fetchImpl)
  return fake
}

/** Le texte envoyé à Claude (un seul bloc de texte). */
function promptOf(request: RecordedRequest | undefined): string {
  const body = request?.body as { messages: { content: TextBlockParam[] }[] } | undefined
  return body?.messages[0]?.content[0]?.text ?? ''
}

const askButton = () => screen.findByRole('button', { name: 'Demander au coach' })
const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ')

describe('coach du jour', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('n’appelle jamais Claude à l’ouverture', async () => {
    const { requests } = stubFetch()
    await renderApp(COACH_PAGE, {
      setup: async () => {
        await withProgram()
        await withOura()
      },
    })
    expect(await screen.findByRole('heading', { name: 'Coach du jour', level: 1 })).toBeInTheDocument()
    await askButton()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(requests).toHaveLength(0)
  })

  it('demande d’abord une clé Claude, sans rien appeler', async () => {
    const { requests } = stubFetch()
    const { user, router } = await renderApp(COACH_PAGE)
    expect(await screen.findByText('Ajoute ta clé Claude pour utiliser le coach.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Demander au coach' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Ajouter ma clé' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/more/ai')
    })
    expect(requests).toHaveLength(0)
  })

  it('ne demande pas le sommeil quand la bague a noté la nuit d’aujourd’hui', async () => {
    stubFetch()
    await renderApp(COACH_PAGE, {
      setup: async () => {
        await withProgram()
        await withOura()
      },
    })
    await askButton()
    expect(screen.getByText('Sommeil 7 h 32 · score 84')).toBeInTheDocument()
    expect(screen.getByText('Récupération 86')).toBeInTheDocument()
    expect(screen.getByText('Hier : 2 650 kcal dépensées')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Sommeil' })).not.toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Énergie' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/cette\s+nuit/i)
    expectFrenchSpacing()
  })

  it('demande le sommeil quand la bague n’a que la journée d’hier', async () => {
    stubFetch()
    await renderApp(COACH_PAGE, {
      setup: async () => {
        await withProgram()
        await db.ouraDays.put(ouraDay('2026-10-20'))
      },
    })
    await askButton()
    expect(screen.getByText('Pas de données Oura aujourd’hui.')).toBeInTheDocument()
    expect(screen.getByText('Hier : 2 230 kcal dépensées')).toBeInTheDocument()
    const sleep = screen.getByRole('radiogroup', { name: 'Sommeil' })
    expect(
      within(sleep)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['Mauvais', 'Moyen', 'Bon'])
    // Les zones n'apparaissent qu'avec des courbatures.
    expect(screen.queryByRole('group', { name: 'Zones courbaturées' })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/cette\s+nuit/i)
    expectFrenchSpacing()
  })

  it('envoie le ressenti, garde le conseil et montre ce qui change', async () => {
    const { requests } = stubFetch(streamResponse(DAILY_LIGHTER))
    const { user, router } = await renderApp(COACH_PAGE, {
      setup: async () => {
        await withProgram()
        await withOura()
      },
    })
    await askButton()
    expect(screen.getByText('Séance B')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Basse' }))
    await user.click(screen.getByRole('radio', { name: 'Légères' }))
    const zones = screen.getByRole('group', { name: 'Zones courbaturées' })
    await user.click(within(zones).getByRole('button', { name: 'Jambes' }))
    await user.click(within(zones).getByRole('button', { name: 'Dos' }))
    await user.type(screen.getByLabelText(/^Autre chose à dire au coach\s\?/), 'Genou sensible')
    await user.click(screen.getByRole('button', { name: 'Demander au coach' }))

    expect(await screen.findByText('Séance allégée', { selector: 'span' })).toBeInTheDocument()
    expect(requests).toHaveLength(1)
    const request = requests[0]
    expect(request?.body).toMatchObject({ model: 'claude-haiku-5-5', stream: true })
    const sent = JSON.stringify(request?.body)
    expect(sent).not.toContain('Charles')
    expect(sent).not.toMatch(NBSP)
    const text = promptOf(request)
    expect(text).toContain('Ma note pour le coach :\n<note>\nGenou sensible\n</note>')
    expect(text).toContain('- courbatures : légères (dos, jambes)')
    expect(text).not.toContain('- sommeil :')
    expect(text).toContain('slot-1 | renforcement | Tractions [pullup] | 4 | 5 à 8 rép.')

    const list = screen.getByRole('list', { name: 'Exercices changés' })
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => plain(item.textContent)),
    ).toEqual(['Tractions · 4 × 5 à 8 rép. → 3 × 5 à 8 rép.Nuit courte : une série de moins.'])
    expect(
      screen.getByText('Ta nuit a été courte : garde la séance, avec un peu moins de volume.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pour ta journée', level: 3 })).toBeInTheDocument()
    expect(screen.getByText('Couche-toi tôt ce soir.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/cette\s+nuit/i)
    expectFrenchSpacing()

    const saved = await db.coachDays.get(DATE)
    expect(saved).toMatchObject({
      date: DATE,
      model: 'claude-haiku-5-5',
      checkIn: {
        sleep: null,
        energy: 'low',
        soreness: 'light',
        zones: ['back', 'legs'],
        note: 'Genou sensible',
      },
      basis: { readinessScore: 86, sleepScore: 84, sleepMin: 452, yesterdayKcal: 2650 },
      programId: 'p1',
      programSessionId: 'B',
      decision: 'lighter',
      headline: 'Séance allégée',
      ignored: false,
    })
    expect(saved?.changes).toEqual([
      coachChange({ plannedExerciseId: 'pullup', exerciseId: 'pullup', sets: 3 }),
    ])
    // La demande est comptée (facturée) avant que le conseil s'affiche.
    expect(await db.aiUsage.get('2026-10')).toMatchObject({ calls: 1, inputTokens: 1850, outputTokens: 420 })

    // Une seule façon de commencer : la séance allégée.
    expect(screen.getAllByRole('button', { name: /Commencer/ })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Commencer la séance allégée' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/workout\/.+/)
    })
    const pullups = await screen.findByRole('article', { name: 'Tractions' })
    expect(within(pullups).getAllByRole('button', { name: /série \d faite$/ })).toHaveLength(3)
    expect(
      within(pullups).getByText(
        'Coach : Nuit courte : une série de moins. Ne compte pas pour la progression.',
      ),
    ).toBeInTheDocument()
    const pushups = screen.getByRole('article', { name: 'Pompes' })
    expect(within(pushups).getAllByRole('button', { name: /série \d faite$/ })).toHaveLength(3)
    expect(requests).toHaveLength(1)
  })

  it('redemander repart du dernier ressenti, et ne rappelle Claude qu’au toucher', async () => {
    const { requests } = stubFetch()
    const { user } = await renderApp(COACH_PAGE, {
      setup: async () => {
        await withProgram()
        await withOura()
        await db.coachDays.put(
          coachDay({
            checkIn: {
              sleep: null,
              energy: 'high',
              soreness: 'strong',
              zones: ['arms'],
              note: 'Bonne forme',
            },
          }),
        )
      },
    })
    expect(await screen.findByText('Séance prévue validée')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Commencer la séance' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Redemander au coach' }))
    expect(await askButton()).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Haute' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Fortes' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Bras' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/^Autre chose à dire au coach\s\?/)).toHaveValue('Bonne forme')
    await user.click(screen.getByRole('button', { name: 'Garder le conseil actuel' }))
    expect(await screen.findByText('Séance prévue validée')).toBeInTheDocument()
    expect(requests).toHaveLength(0)
  })

  it('repos conseillé : le prendre, puis l’annuler', async () => {
    stubFetch(streamResponse(DAILY_REST))
    const { user } = await renderApp(COACH_PAGE, {
      setup: async () => {
        await withProgram()
        await withOura()
      },
    })
    await user.click(await askButton())
    expect(await screen.findByText('Repos conseillé', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getAllByText('Repos conseillé')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Commencer/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Exercices changés' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Prendre ma journée de repos' }))
    expect(await screen.findByText('Journée de repos notée')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Annuler le repos' })).toBeInTheDocument()
    expect(screen.getByText('Journée de repos prise')).toBeInTheDocument()
    expect(await db.events.where('date').equals(DATE).count()).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Annuler le repos' }))
    expect(await screen.findByText('Séance remise au programme')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Prendre ma journée de repos' })).toBeInTheDocument()
    expect(await db.events.where('date').equals(DATE).count()).toBe(0)
    expect(await db.coachDays.get(DATE)).toMatchObject({ decision: 'rest', ignored: false })
  })

  it('repos pris puis conseil redemandé : le repos s’annule toujours d’ici', async () => {
    const { requests } = stubFetch(streamResponse(DAILY_REST), streamResponse(DAILY_TIPS))
    const { user } = await renderApp(COACH_PAGE, {
      setup: async () => {
        await withProgram()
        await withOura()
      },
    })
    await user.click(await askButton())
    await user.click(await screen.findByRole('button', { name: 'Prendre ma journée de repos' }))
    expect(await screen.findByRole('button', { name: 'Annuler le repos' })).toBeInTheDocument()

    // La séance passée, le coach ne voit plus de séance prévue : il donne des conseils pour la journée.
    await user.click(screen.getByRole('button', { name: 'Redemander au coach' }))
    await user.click(await askButton())
    expect(await screen.findByText('Conseils du jour', { selector: 'span' })).toBeInTheDocument()
    expect(promptOf(requests[1])).toContain('Séance prévue aujourd’hui : aucune.')
    expect(screen.getByText('Journée de repos prise')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Prendre ma journée de repos' })).not.toBeInTheDocument()
    expect(await db.coachDays.get(DATE)).toMatchObject({ decision: null, programSessionId: null })

    await user.click(screen.getByRole('button', { name: 'Annuler le repos' }))
    expect(await screen.findByText('Séance remise au programme')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Annuler le repos' })).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Journée de repos prise')).not.toBeInTheDocument()
    expect(await db.events.where('date').equals(DATE).count()).toBe(0)
    expect(requests).toHaveLength(2)
  })

  it('« Revenir à la séance prévue » met le conseil de côté, et le reprend', async () => {
    stubFetch()
    const { user } = await renderApp(COACH_PAGE, {
      setup: async () => {
        await withProgram()
        await db.coachDays.put(
          coachDay({
            decision: 'lighter',
            headline: 'Séance allégée',
            changes: [coachChange({ plannedExerciseId: 'pullup', exerciseId: 'pullup' })],
          }),
        )
      },
    })
    await user.click(await screen.findByRole('button', { name: 'Revenir à la séance prévue' }))
    expect(await screen.findByRole('button', { name: 'Reprendre le conseil du coach' })).toBeInTheDocument()
    expect(screen.getByText('Conseil mis de côté')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Commencer la séance' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Commencer/ })).toHaveLength(1)
    expect((await db.coachDays.get(DATE))?.ignored).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Reprendre le conseil du coach' }))
    expect(await screen.findByRole('button', { name: 'Commencer la séance allégée' })).toBeInTheDocument()
    expect((await db.coachDays.get(DATE))?.ignored).toBe(false)
  })

  it('annuler la demande : pas d’erreur, rien de gardé', async () => {
    const stream = streamController()
    // Le signal que le client donne à fetch : « Annuler » doit vraiment couper la demande.
    let sentSignal: AbortSignal | null | undefined
    const { requests } = stubFetch((request, init) => {
      sentSignal = init?.signal
      return stream.answer(request, init)
    })
    const { user } = await renderApp(COACH_PAGE, { setup: withProgram })
    await user.click(await askButton())
    expect(await screen.findByText('Le coach regarde ta journée…')).toHaveAttribute('role', 'status')
    await waitFor(() => {
      expect(requests).toHaveLength(1)
    })
    stream.push('{"decision": "li')
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(await askButton()).toBeInTheDocument()
    expect(sentSignal?.aborted).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Demander au coach' })).toBeInTheDocument()
    expect(await db.coachDays.count()).toBe(0)
  })

  it('sans séance prévue : des conseils pour la journée', async () => {
    const { requests } = stubFetch(streamResponse(DAILY_TIPS))
    const { user } = await renderApp(COACH_PAGE, {
      setup: async () => {
        await saveSecret('anthropic', KEY)
      },
    })
    await askButton()
    expect(
      screen.getByText('Pas de séance prévue aujourd’hui : le coach te donne des conseils pour la journée.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Demander au coach' }))
    expect(await screen.findByText('Conseils du jour', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Vise tes protéines du jour.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Commencer/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /repos/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redemander au coach' })).toBeInTheDocument()
    expect(promptOf(requests[0])).toContain('Séance prévue aujourd’hui : aucune.')
    expect(await db.coachDays.get(DATE)).toMatchObject({
      decision: null,
      programId: null,
      programSessionId: null,
      changes: [],
    })
    expectFrenchSpacing()
  })

  it.each(AI_ERROR_CASES)('$name : le dit, sans rien garder', async ({ answers, problem }) => {
    stubFetch(...answers())
    const { user } = await renderApp(COACH_PAGE, { setup: withProgram })
    await user.click(await askButton())
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 })
    expect(plain(alert.textContent)).toBe(plain(problemText(problem, 'daily')))
    expect(await db.coachDays.count()).toBe(0)
    const retry = screen.queryByRole('button', { name: 'Réessayer' })
    const ask = screen.queryByRole('button', { name: 'Demander au coach' })
    // Un seul bouton pour relancer la demande.
    expect(retry === null).toBe(ask !== null)
    expectFrenchSpacing()
  })
})
