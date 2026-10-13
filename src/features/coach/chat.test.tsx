import { act, screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { actionCost } from '@/content/ai/cost'
import { db } from '@/db/db'
import { saveSecret } from '@/db/secrets'
import { updateSettings } from '@/db/settings'
import { costHintText, problemText } from '@/features/ai/ai-view'
import {
  AI_ERROR_CASES,
  CHAT_ANSWER,
  fakeAnthropicFetch,
  streamController,
  streamErrorResponse,
  streamResponse,
  type Answer,
  type RecordedRequest,
} from '@/test/anthropic'
import { coachMessage } from '@/test/fixtures'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'
import { CHAT_PRIVACY_TEXT, CHAT_SUGGESTIONS } from './chat-view'

const CHAT = '/more/coach'
const KEY = 'sk-ant-api03-test-0123456789abcdefghij'
const MODEL = 'claude-sonnet-5-5'

interface ChatBody {
  model: string
  system: { type: string; text: string; cache_control?: unknown }[]
  messages: { role: string; content: unknown }[]
  cache_control?: unknown
  stream?: boolean
}

const bodyOf = (request: RecordedRequest | undefined) => request?.body as ChatBody

const withKey = async () => {
  await saveSecret('anthropic', KEY)
  await updateSettings({ aiModel: MODEL })
}

function stubFetch(...answers: (Response | Error | Answer)[]) {
  const fake = fakeAnthropicFetch(...answers)
  vi.stubGlobal('fetch', fake.fetchImpl)
  return fake
}

/** Ouvre la discussion avec une clé enregistrée (et la base préparée par `setup`). */
async function openChat(setup?: () => Promise<unknown>) {
  const app = await renderApp(CHAT, {
    setup: async () => {
      await withKey()
      await setup?.()
    },
  })
  expect(
    await screen.findByRole('heading', { name: 'Discussion avec le coach', level: 1 }),
  ).toBeInTheDocument()
  await screen.findByLabelText('Ton message')
  return app
}

const input = () => screen.getByLabelText<HTMLTextAreaElement>('Ton message')

async function ask(user: UserEvent, question: string) {
  await user.type(input(), question)
  await user.click(screen.getByRole('button', { name: 'Envoyer' }))
}

/** Les bulles affichées : qui parle, puis le texte (espaces insécables comprises). */
const bubbles = () =>
  screen
    .queryAllByRole('listitem')
    .filter((item) => item.parentElement?.tagName === 'OL')
    .map((item) => item.textContent.replace(/\s/g, ' '))

/** Le texte du problème affiché, espaces insécables comprises. */
async function alertText() {
  return (await screen.findByRole('alert')).textContent
}

const storedCount = () => db.coachMessages.count()

/** Attend que la réponse en cours soit finie (enregistrée ou abandonnée). */
async function answered() {
  expect(await screen.findByRole('button', { name: 'Envoyer' })).toBeInTheDocument()
  expect(screen.queryByText('Le coach écrit…')).not.toBeInTheDocument()
}

/** Laisse passer les effets et lectures de la base de l'écran. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}

describe('discussion avec le coach', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('n’appelle jamais Claude sans geste de l’utilisateur', async () => {
    const fake = stubFetch()
    await openChat(() =>
      db.coachMessages.bulkPut([
        coachMessage(0, 'user', { text: 'Que faire hier ?', createdAt: '2026-10-20T07:00:00.000Z' }),
        coachMessage(1, 'assistant', {
          text: '## Plan\n\n**Lundi** : tractions.\n- gainage',
          createdAt: '2026-10-20T07:00:00.000Z',
        }),
        coachMessage(2, 'user', { text: 'Et aujourd’hui ?' }),
        coachMessage(3, 'assistant', { text: 'Repos.' }),
      ]),
    )
    expect(await screen.findByRole('heading', { name: 'Hier', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Aujourd’hui', level: 2 })).toBeInTheDocument()
    expect(bubbles()).toEqual([
      'Toi : Que faire hier ?',
      'Le coach : PlanLundi : tractions. • gainage',
      'Toi : Et aujourd’hui ?',
      'Le coach : Repos.',
    ])
    // Écran plein : pas de barre d'onglets, pas de prix (la discussion a déjà commencé).
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).not.toBeInTheDocument()
    expect(screen.queryByText(/centimes? avec/)).not.toBeInTheDocument()
    expectFrenchSpacing()
    await settle()
    expect(fake.requests).toHaveLength(0)
  })

  it('demande une clé Claude, sans cacher la discussion déjà faite', async () => {
    const fake = stubFetch()
    const { user, router } = await renderApp(CHAT, {
      setup: () => db.coachMessages.bulkPut([coachMessage(0), coachMessage(1)]),
    })
    expect(await screen.findByText('Ajoute ta clé Claude pour utiliser le coach.')).toBeInTheDocument()
    expect(bubbles()).toEqual(['Toi : Question 0', 'Le coach : Réponse 1'])
    expect(screen.queryByLabelText('Ton message')).not.toBeInTheDocument()
    expectFrenchSpacing()
    await user.click(screen.getByRole('link', { name: 'Ajouter ma clé' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/more/ai')
    })
    expect(fake.requests).toHaveLength(0)
  })

  it('propose des questions qui remplissent le message sans l’envoyer', async () => {
    const fake = stubFetch()
    const { user } = await openChat()
    expect(screen.getByText('Pose ta question au coach')).toBeInTheDocument()
    // Testing Library lit les espaces insécables comme des espaces simples.
    expect(screen.getByText(CHAT_PRIVACY_TEXT.replace(/\s/g, ' '))).toBeInTheDocument()
    const price = costHintText(actionCost('chat', MODEL), 'Sonnet 5.5').replace(/\s/g, ' ')
    expect(screen.getByText(price)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /^Que manger avant l’escalade\s\?$/ }))
    expect(input()).toHaveValue(CHAT_SUGGESTIONS[1])
    expect(input()).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /^Comment progresser sur les tractions\s\?$/ }))
    expect(input()).toHaveValue(CHAT_SUGGESTIONS[0])
    expectFrenchSpacing()
    await settle()
    expect(fake.requests).toHaveLength(0)
    expect(await storedCount()).toBe(0)
  })

  it('montre la réponse au fil de l’eau, puis enregistre l’échange', async () => {
    const stream = streamController()
    const fake = stubFetch(stream.answer)
    const { user } = await openChat()
    await ask(user, 'Comment progresser ?')

    expect(input()).toHaveValue('')
    expect(screen.getByText('Le coach écrit…')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: 'Arrêter' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Envoyer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Effacer la discussion' })).not.toBeInTheDocument()
    expect(screen.queryByText('Pose ta question au coach')).not.toBeInTheDocument()

    stream.push('Garde ')
    expect(await screen.findByText('Garde')).toBeInTheDocument()
    stream.push('trois **séances**')
    const growing = await screen.findByText('Garde trois séances')
    // Le texte qui s'écrit n'est pas annoncé morceau par morceau ; l'attente l'est une seule fois.
    expect(growing.closest('[role="status"], [role="log"], [role="alert"], [aria-live]')).toBeNull()
    expect(screen.getAllByText('Le coach écrit…')).toHaveLength(1)
    expect(bubbles()).toEqual(['Toi : Comment progresser ?', 'Le coach : Garde trois séances'])
    expect(await storedCount()).toBe(0)

    stream.push(' par semaine.')
    stream.finish()
    await answered()
    await waitFor(async () => {
      expect(await storedCount()).toBe(2)
    })
    const rows = await db.coachMessages.orderBy('seq').toArray()
    expect(rows.map(({ seq, role, text, model }) => ({ seq, role, text, model }))).toEqual([
      { seq: 0, role: 'user', text: 'Comment progresser ?', model: null },
      { seq: 1, role: 'assistant', text: 'Garde trois **séances** par semaine.', model: MODEL },
    ])
    expect(bubbles()).toEqual(['Toi : Comment progresser ?', 'Le coach : Garde trois séances par semaine.'])
    expect(screen.getByRole('heading', { name: 'Aujourd’hui', level: 2 })).toBeInTheDocument()
    expect(await db.aiUsage.get('2026-10')).toMatchObject({ calls: 1, inputTokens: 1850, outputTokens: 420 })
    expect(fake.requests).toHaveLength(1)
    expectFrenchSpacing()
  })

  it('rejoue la discussion à l’identique d’une question à l’autre', async () => {
    const fake = stubFetch(streamResponse('A'), streamResponse('B'))
    const { user } = await openChat()
    await ask(user, 'Première question')
    await answered()
    await waitFor(async () => {
      expect(await storedCount()).toBe(2)
    })
    await ask(user, 'Deuxième question')
    await answered()
    await waitFor(async () => {
      expect(await storedCount()).toBe(4)
    })

    const [first, second] = fake.requests.map(bodyOf)
    expect(first?.messages).toEqual([{ role: 'user', content: 'Première question' }])
    expect(second?.messages).toEqual([
      { role: 'user', content: 'Première question' },
      { role: 'assistant', content: 'A' },
      { role: 'user', content: 'Deuxième question' },
    ])
    // Même message système, octet pour octet : l'API relit le début de la discussion dans son cache.
    expect(JSON.stringify(second?.system)).toBe(JSON.stringify(first?.system))
    expect(second).toMatchObject({ model: MODEL, stream: true, cache_control: { type: 'ephemeral' } })
    expect(second?.system).toHaveLength(2)
    expect(second?.system[1]).toMatchObject({ cache_control: { type: 'ephemeral' } })
    expect(second?.system[1]?.text).toMatch(/^<donnees>/)
    expect(JSON.stringify(second)).not.toMatch(/[\u00a0\u202f]/)
    expect(bubbles()).toEqual([
      'Toi : Première question',
      'Le coach : A',
      'Toi : Deuxième question',
      'Le coach : B',
    ])
  })

  it('relit la discussion enregistrée au moment d’envoyer', async () => {
    const fake = stubFetch(streamResponse('A'), streamResponse('B'))
    const { user } = await openChat()
    await ask(user, 'Première question')
    await answered()
    await waitFor(async () => {
      expect(await storedCount()).toBe(2)
    })

    await user.type(input(), 'Deuxième question')
    // Un échange écrit ailleurs (un autre onglet), juste avant d'envoyer.
    await db.coachMessages.bulkPut([
      coachMessage(2, 'user', { text: 'Question d’un autre onglet' }),
      coachMessage(3, 'assistant', { text: 'Réponse d’un autre onglet' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))
    await answered()
    await waitFor(async () => {
      expect(await storedCount()).toBe(6)
    })
    expect(bodyOf(fake.requests[1]).messages).toEqual([
      { role: 'user', content: 'Première question' },
      { role: 'assistant', content: 'A' },
      { role: 'user', content: 'Question d’un autre onglet' },
      { role: 'assistant', content: 'Réponse d’un autre onglet' },
      { role: 'user', content: 'Deuxième question' },
    ])
    const rows = await db.coachMessages.orderBy('seq').toArray()
    expect(rows.slice(-2).map(({ seq, text }) => ({ seq, text }))).toEqual([
      { seq: 4, text: 'Deuxième question' },
      { seq: 5, text: 'B' },
    ])
  })

  it('s’arrête au milieu de la réponse sans rien garder', async () => {
    const stream = streamController()
    stubFetch(stream.answer)
    const { user } = await openChat()
    await ask(user, 'Combien de séries ?')
    stream.push('Je ')
    expect(await screen.findByText('Je')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Arrêter' }))

    await waitFor(() => {
      expect(input()).toHaveValue('Combien de séries ?')
    })
    await answered()
    expect(screen.queryByText('Je')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(bubbles()).toEqual([])
    expect(screen.getByText('Pose ta question au coach')).toBeInTheDocument()
    expect(await storedCount()).toBe(0)
    expect(await db.aiUsage.count()).toBe(0)
  })

  it('propose de réessayer quand Claude s’interrompt, avec la question remise', async () => {
    const fake = stubFetch(streamErrorResponse('overloaded_error'), streamResponse(CHAT_ANSWER))
    const { user } = await openChat()
    await ask(user, 'Comment progresser ?')

    expect(await alertText()).toBe(problemText('busy', 'chat'))
    await answered()
    expect(input()).toHaveValue('Comment progresser ?')
    expect(screen.queryByText('Je')).not.toBeInTheDocument()
    expect(bubbles()).toEqual([])
    expect(await storedCount()).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText(CHAT_ANSWER)).toBeInTheDocument()
    await answered()
    await waitFor(async () => {
      expect(await storedCount()).toBe(2)
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(input()).toHaveValue('')
    expect(bodyOf(fake.requests[1]).messages).toEqual([{ role: 'user', content: 'Comment progresser ?' }])
    expectFrenchSpacing()
  })

  it('ne garde jamais une réponse vide', async () => {
    stubFetch(streamResponse('  \n '))
    const { user } = await openChat()
    await ask(user, 'Tu es là')
    expect(await alertText()).toBe(problemText('failed', 'chat'))
    await answered()
    expect(input()).toHaveValue('Tu es là')
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
    expect(await storedCount()).toBe(0)
    // La réponse vide est facturée : elle compte dans le coût du mois.
    expect(await db.aiUsage.get('2026-10')).toMatchObject({ calls: 1 })
  })

  it('dit ce qui empêche le coach de répondre', async () => {
    const cases = AI_ERROR_CASES.filter((errorCase) => errorCase.structuredOnly !== true)
    const fake = stubFetch(...cases.flatMap((errorCase) => errorCase.answers()))
    const { user } = await openChat()
    await user.type(input(), 'Bonjour')
    for (const errorCase of cases) {
      await user.click(screen.getByRole('button', { name: 'Envoyer' }))
      expect(await alertText(), errorCase.name).toBe(problemText(errorCase.problem, 'chat'))
      await answered()
      expect(input(), errorCase.name).toHaveValue('Bonjour')
    }
    expect(fake.requests).toHaveLength(cases.flatMap((errorCase) => errorCase.answers()).length)
    expect(await storedCount()).toBe(0)
  }, 30_000)

  it('mène aux réglages de l’IA quand la clé est refusée', async () => {
    stubFetch(...AI_ERROR_CASES.find((errorCase) => errorCase.problem === 'invalidKey')!.answers())
    const { user, router } = await openChat()
    await ask(user, 'Bonjour')
    expect(await alertText()).toBe(problemText('invalidKey', 'chat'))
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Réglages de l’IA' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/more/ai')
    })
  })

  it('efface la discussion après confirmation', async () => {
    const fake = stubFetch()
    const { user } = await openChat(() =>
      db.coachMessages.bulkPut([coachMessage(0), coachMessage(1), coachMessage(2), coachMessage(3)]),
    )
    expect(bubbles()).toHaveLength(4)

    await user.click(screen.getByRole('button', { name: 'Effacer la discussion' }))
    let dialog = await screen.findByRole('dialog', { name: /^Effacer la discussion\s\?$/ })
    expectFrenchSpacing()
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }))
    expect(bubbles()).toHaveLength(4)
    expect(await storedCount()).toBe(4)

    await user.click(screen.getByRole('button', { name: 'Effacer la discussion' }))
    dialog = await screen.findByRole('dialog', { name: /^Effacer la discussion\s\?$/ })
    await user.click(within(dialog).getByRole('button', { name: 'Effacer' }))
    expect(await screen.findByText('Discussion effacée')).toBeInTheDocument()
    expect(await screen.findByText('Pose ta question au coach')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Effacer la discussion' })).not.toBeInTheDocument()
    expect(await storedCount()).toBe(0)
    expect(fake.requests).toHaveLength(0)
  })
})
