import { screen, waitFor, within } from '@testing-library/react'
import { db } from '@/db/db'
import { saveOuraDays } from '@/db/oura'
import { saveProgram } from '@/db/programs'
import { saveSecret } from '@/db/secrets'
import { updateSettings } from '@/db/settings'
import type { CoachDay, ProgramSession, ProgramSlot } from '@/db/types'
import { fakeAnthropicFetch } from '@/test/anthropic'
import { coachChange, coachDay, programSession, testProgram } from '@/test/fixtures'
import { ouraDay } from '@/test/oura'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'
import { resetOuraAutoSync } from '@/features/oura/useOura'

// Les horloges de la séance en direct ne tournent pas pendant les tests.
vi.mock('@/features/workout/useNow', () => ({ useNow: () => Date.now() }))

const DATE = '2026-10-21'
const KEY = 'sk-ant-api03-test-0123456789abcdefghij'

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

const LIGHTER = coachDay({
  decision: 'lighter',
  headline: 'Séance allégée : nuit courte',
  changes: [coachChange({ plannedExerciseId: 'pullup', exerciseId: 'pullup' })],
})
const REST = coachDay({ decision: 'rest', headline: 'Repos conseillé' })

/**
 * Le programme commencé aujourd'hui (rien à rattraper) avec la séance B prévue, la clé Claude et le
 * conseil du jour, s'il y en a.
 */
function setup({ key = true, advice = null }: { key?: boolean; advice?: CoachDay | null } = {}) {
  return async () => {
    if (key) await saveSecret('anthropic', KEY)
    if (advice) await db.coachDays.put(advice)
    await saveProgram(testProgram({ startDate: DATE, sessions: [programSession('A', [1, 4]), SESSION_B] }))
  }
}

/** Les boutons qui commencent la séance du jour, sur tout l'écran (« Commencer une séance » est libre). */
const sessionStarts = () => screen.queryAllByRole('button', { name: /^Commencer la séance/ })

/** La carte « Au programme » de l'accueil. */
async function programCard(): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: 'Au programme', level: 2 })
  const section = heading.closest('section')
  if (!section) throw new Error('Carte Au programme introuvable')
  await within(section).findByText('Séance B')
  return section
}

const startButtons = (card: HTMLElement) => within(card).queryAllByRole('button', { name: /Commencer/ })

describe('séance du jour et coach', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
    resetOuraAutoSync()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('sans clé : la carte de toujours, même avec un conseil gardé', async () => {
    await renderApp('/', { setup: setup({ key: false, advice: REST }) })
    const card = await programCard()
    expect(startButtons(card).map((button) => button.textContent)).toEqual(['Commencer la séance'])
    expect(within(card).queryByRole('link', { name: 'Ajuster avec le coach' })).not.toBeInTheDocument()
    expect(within(card).queryByText('Repos conseillé')).not.toBeInTheDocument()
    expect(
      within(card).queryByRole('button', { name: 'Prendre ma journée de repos' }),
    ).not.toBeInTheDocument()
  })

  it('avec une clé et sans conseil : un lien discret vers le coach', async () => {
    const { user, router } = await renderApp('/', { setup: setup() })
    const card = await programCard()
    const link = await within(card).findByRole('link', { name: 'Ajuster avec le coach' })
    expect(link).toHaveAttribute('href', '/training/coach')
    expect(startButtons(card).map((button) => button.textContent)).toEqual(['Commencer la séance'])
    await user.click(link)
    expect(await screen.findByRole('heading', { name: 'Coach du jour', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/training/coach')
  })

  it('séance validée : une ligne du coach, la séance de toujours', async () => {
    await renderApp('/', { setup: setup({ advice: coachDay() }) })
    const card = await programCard()
    expect(await within(card).findByText('Le coach valide la séance prévue.')).toBeInTheDocument()
    expect(startButtons(card).map((button) => button.textContent)).toEqual(['Commencer la séance'])
    expect(within(card).queryByRole('link', { name: 'Ajuster avec le coach' })).not.toBeInTheDocument()
  })

  it('séance allégée : un seul bouton, qui commence la séance allégée', async () => {
    const { user, router } = await renderApp('/', { setup: setup({ advice: LIGHTER }) })
    const card = await programCard()
    expect(await within(card).findByText('Allégée par le coach')).toBeInTheDocument()
    expect(within(card).getByText('Séance allégée : nuit courte')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Voir le détail' })).toHaveAttribute(
      'href',
      '/training/coach',
    )
    expect(startButtons(card).map((button) => button.textContent)).toEqual(['Commencer la séance allégée'])
    expect(sessionStarts()).toHaveLength(1)
    expect(card.textContent).not.toMatch(/cette\s+nuit/i)
    expectFrenchSpacing()

    await user.click(within(card).getByRole('button', { name: 'Commencer la séance allégée' }))
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
    const [workout] = await db.workouts.toArray()
    expect(workout?.exercises.map((e) => [e.exerciseId, e.slotId, e.sets.length])).toEqual([
      ['pullup', null, 3],
      ['pushup', 'slot-2', 3],
    ])
    expect(workout).toMatchObject({ programSessionId: 'B', plannedFor: DATE, deload: false })
  })

  it('repos conseillé : le prendre, ou faire la séance quand même', async () => {
    const { user } = await renderApp('/', { setup: setup({ advice: REST }) })
    const card = await programCard()
    expect(await within(card).findByText('Repos conseillé', { selector: 'span' })).toBeInTheDocument()
    // Le titre du conseil répète le badge : il n'est pas affiché deux fois.
    expect(within(card).getAllByText('Repos conseillé')).toHaveLength(1)
    expect(within(card).getByRole('button', { name: 'Faire la séance quand même' })).toBeInTheDocument()
    expect(startButtons(card)).toHaveLength(0)
    expect(within(card).getByRole('link', { name: 'Voir le détail' })).toHaveAttribute(
      'href',
      '/training/coach',
    )

    await user.click(within(card).getByRole('button', { name: 'Prendre ma journée de repos' }))
    expect(await screen.findByText('Journée de repos notée')).toBeInTheDocument()
    expect(await within(card).findByText('Séance passée aujourd’hui')).toBeInTheDocument()
    expect(
      within(card).queryByRole('button', { name: 'Prendre ma journée de repos' }),
    ).not.toBeInTheDocument()
  })

  it('repos conseillé, séance faite quand même : celle du programme', async () => {
    const { user, router } = await renderApp('/', { setup: setup({ advice: REST }) })
    const card = await programCard()
    await user.click(await within(card).findByRole('button', { name: 'Faire la séance quand même' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/workout\/.+/)
    })
    const pullups = await screen.findByRole('article', { name: 'Tractions' })
    expect(within(pullups).getAllByRole('button', { name: /série \d faite$/ })).toHaveLength(4)
    const [workout] = await db.workouts.toArray()
    expect(workout?.exercises.map((e) => e.slotId)).toEqual(['slot-1', 'slot-2'])
  })

  it('aussi dans Entraînement', async () => {
    await renderApp('/training', { setup: setup({ advice: LIGHTER }) })
    expect(await screen.findByRole('button', { name: 'Commencer la séance allégée' })).toBeInTheDocument()
    expect(sessionStarts()).toHaveLength(1)
  })

  it('l’accueil n’appelle jamais Claude, et « Cette nuit » reste à la carte Récupération', async () => {
    const fake = fakeAnthropicFetch()
    vi.stubGlobal('fetch', fake.fetchImpl)
    await renderApp('/', {
      setup: async () => {
        await setup({ advice: LIGHTER })()
        await updateSettings({ ouraRelayUrl: 'https://relais.example.dev', ouraClientId: 'client-123' })
        await saveSecret('oura', 'jeton', '2026-11-20T08:00:00.000Z')
        await saveOuraDays([ouraDay(DATE, { syncedAt: '2026-10-21T08:30:00.000Z' })])
      },
    })
    const card = await programCard()
    expect(await within(card).findByText('Allégée par le coach')).toBeInTheDocument()
    expect(await screen.findByText('Cette nuit')).toBeInTheDocument()
    expect(screen.getAllByText(/cette\s+nuit/i)).toHaveLength(1)
    expect(card.textContent).not.toMatch(/cette\s+nuit/i)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fake.requests).toHaveLength(0)
  })
})
