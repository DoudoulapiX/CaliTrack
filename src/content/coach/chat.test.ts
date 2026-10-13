import { CHAT_MAX_STORED } from '@/db/coach'
import type { CoachMessage } from '@/db/types'
import { coachData } from '@/test/anthropic'
import { coachMessage } from '@/test/fixtures'
import { CHAT_DRAFT_MAX, CHAT_RULES, CHAT_WINDOW, chatSystem, chatWindow, plainChatText } from './chat'
import { ALL_SECTIONS, buildCoachContext } from './context'
import { COACH_RULES } from './prompt'

/** Une discussion de `count` messages (question, réponse, question…), seq 0 à count - 1. */
function thread(count: number, text?: (seq: number) => string): CoachMessage[] {
  return Array.from({ length: count }, (_, seq) =>
    coachMessage(seq, undefined, text ? { text: text(seq) } : {}),
  )
}

const seqs = (history: readonly CoachMessage[], draft: string) =>
  chatWindow(history, draft).map((turn) => turn.content)

describe('fenêtre de la discussion', () => {
  it('envoie la question seule quand la discussion est vide', () => {
    expect(chatWindow([], '  Bonjour  ')).toEqual([{ role: 'user', content: 'Bonjour' }])
  })

  it('relit le texte enregistré, dans l’ordre de seq, puis la question', () => {
    const history = [
      coachMessage(1, 'assistant', { text: 'Salut !', createdAt: '2026-10-21T08:00:00.000Z' }),
      coachMessage(0, 'user', { text: 'Bonjour', createdAt: '2026-10-21T09:00:00.000Z' }),
      coachMessage(3, 'assistant', { text: 'Trois séances.', createdAt: '2026-10-20T08:00:00.000Z' }),
      coachMessage(2, 'user', { text: 'Combien de séances ?', createdAt: '2026-10-21T10:00:00.000Z' }),
    ]
    expect(chatWindow(history, 'Et le repos ?')).toEqual([
      { role: 'user', content: 'Bonjour' },
      { role: 'assistant', content: 'Salut !' },
      { role: 'user', content: 'Combien de séances ?' },
      { role: 'assistant', content: 'Trois séances.' },
      { role: 'user', content: 'Et le repos ?' },
    ])
  })

  it('garde au plus 20 messages, en commençant par une question', () => {
    const window = chatWindow(thread(40), 'Nouvelle question')
    expect(window).toHaveLength(19)
    expect(window[0]).toEqual({ role: 'user', content: 'Question 22' })
    expect(window.at(-2)).toEqual({ role: 'assistant', content: 'Réponse 39' })
    expect(window.at(-1)).toEqual({ role: 'user', content: 'Nouvelle question' })
    expect(window.length).toBeLessThanOrEqual(CHAT_WINDOW.messages)

    // Une discussion qui finit par une question (écrite ailleurs) : 19 messages relus, puis la nouvelle.
    const odd = chatWindow(thread(39), 'Nouvelle question')
    expect(odd).toHaveLength(CHAT_WINDOW.messages)
    expect(odd[0]).toEqual({ role: 'user', content: 'Question 20' })

    expect(chatWindow(thread(CHAT_MAX_STORED), 'Encore une').length).toBeLessThanOrEqual(CHAT_WINDOW.messages)
  })

  it('garde au plus 16 000 caractères, la question comprise', () => {
    const history = thread(10, (seq) => String(seq).repeat(3000))
    const draft = 'q'.repeat(1000)
    // 4 messages de 3000 + la question : 13 000 ; le 5e (une réponse, 16 000 pile) est retiré en tête.
    expect(seqs(history, draft)).toEqual([
      '6'.repeat(3000),
      '7'.repeat(3000),
      '8'.repeat(3000),
      '9'.repeat(3000),
      draft,
    ])
    const total = chatWindow(history, draft).reduce((sum, turn) => sum + turn.content.length, 0)
    expect(total).toBeLessThanOrEqual(CHAT_WINDOW.chars)

    // Une seule réponse trop longue : la question part seule.
    const long = [coachMessage(0), coachMessage(1, 'assistant', { text: 'a'.repeat(15_500) })]
    expect(chatWindow(long, 'q'.repeat(600))).toEqual([{ role: 'user', content: 'q'.repeat(600) }])
  })

  it('ne coupe pas au milieu : un message qui dépasse arrête la relecture', () => {
    const history = [
      coachMessage(0, 'user', { text: 'court' }),
      coachMessage(1, 'assistant', { text: 'x'.repeat(15_990) }),
      coachMessage(2, 'user', { text: 'court' }),
      coachMessage(3, 'assistant', { text: 'ok' }),
    ]
    expect(chatWindow(history, 'Et après ?')).toEqual([
      { role: 'user', content: 'court' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'Et après ?' },
    ])
  })

  it('n’envoie aucune espace insécable', () => {
    const history = [coachMessage(0, 'user', { text: 'Tractions\u00a0: combien ?' }), coachMessage(1)]
    const window = chatWindow(history, 'Et les dips\u00a0?\u202f')
    expect(JSON.stringify(window)).not.toMatch(/[\u00a0\u202f]/)
    expect(window[0]?.content).toBe('Tractions : combien ?')
    expect(window.at(-1)?.content).toBe('Et les dips ?')
  })

  it('limite la question à 2000 caractères', () => {
    expect(CHAT_DRAFT_MAX).toBe(2000)
  })
})

describe('message système de la discussion', () => {
  it('pose les règles, puis les données du coach en cache', () => {
    const data = coachData()
    const system = chatSystem(data)
    expect(system).toEqual([
      { type: 'text', text: `${COACH_RULES}\n\n${CHAT_RULES}` },
      { type: 'text', text: buildCoachContext(data, ALL_SECTIONS), cache_control: { type: 'ephemeral' } },
    ])
    expect(system[0]).not.toHaveProperty('cache_control')
    expect(system[1]?.text).toContain('<donnees>')
    expect(system[1]?.text).toContain('Œufs')
  })

  it('donne exactement le même texte pour les mêmes données, sans espace insécable', () => {
    expect(JSON.stringify(chatSystem(coachData()))).toBe(JSON.stringify(chatSystem(coachData())))
    expect(JSON.stringify(chatSystem(coachData()))).not.toMatch(/[\u00a0\u202f]/)
    expect(CHAT_RULES).not.toMatch(/[\u00a0\u202f]/)
    expect(CHAT_RULES).toContain('<donnees>')
  })
})

describe('réponse du coach en texte simple', () => {
  it('retire titres, gras, code et séparateurs', () => {
    expect(
      plainChatText(
        '## Ton plan\r\n\r\n**Lundi** : tractions, __lentes__.\n\n---\n\nTape `5 × 5`.\n```\ncode\n```\n\n\n\nFin.',
      ),
    ).toBe('Ton plan\n\nLundi : tractions, lentes.\n\nTape 5 × 5.\ncode\n\nFin.')
  })

  it('change les puces en « • », garde les listes numérotées', () => {
    expect(plainChatText('- échauffement\n* tractions\n  + gainage\n1. Repos\n2. Étirements')).toBe(
      '• échauffement\n• tractions\n• gainage\n1. Repos\n2. Étirements',
    )
  })

  it('retire l’italique sans toucher aux calculs', () => {
    expect(plainChatText('Fais *trois* séries, *pas plus*. Compte 5 * 3 = 15.')).toBe(
      'Fais trois séries, pas plus. Compte 5 * 3 = 15.',
    )
  })

  it('écrit les liens et retire les citations', () => {
    expect(plainChatText('> Bois de l’eau.\nVoir [Ciqual](https://ciqual.anses.fr).')).toBe(
      'Bois de l’eau.\nVoir Ciqual (https://ciqual.anses.fr).',
    )
  })

  it('laisse un texte simple tel quel', () => {
    expect(plainChatText('  Garde trois séances par semaine.  ')).toBe('Garde trois séances par semaine.')
  })
})
