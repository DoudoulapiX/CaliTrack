import { coachMessage } from '@/test/fixtures'
import {
  CHAT_SUGGESTIONS,
  COACH_TYPING,
  chatDayLabel,
  chatDays,
  messageParagraphs,
  speakerLabel,
} from './chat-view'

describe('textes de la discussion', () => {
  it('propose trois questions, en typographie française', () => {
    expect(CHAT_SUGGESTIONS).toEqual([
      'Comment progresser sur les tractions\u00a0?',
      'Que manger avant l’escalade\u00a0?',
      'Ma semaine est-elle trop chargée\u00a0?',
    ])
    expect(COACH_TYPING).toBe('Le coach écrit…')
  })

  it('nomme qui parle', () => {
    expect(speakerLabel('user')).toBe('Toi')
    expect(speakerLabel('assistant')).toBe('Le coach')
  })

  it('montre la réponse du coach sans Markdown, en paragraphes', () => {
    expect(
      messageParagraphs({
        role: 'assistant',
        text: '## Ton plan\n\n**Lundi** : tractions.\n- gainage\n- repos !\n\n  \n\nBonne séance.',
      }),
    ).toEqual(['Ton plan', 'Lundi\u00a0: tractions.\n• gainage\n• repos\u00a0!', 'Bonne séance.'])
  })

  it('montre la question telle qu’écrite, avec ses espaces insécables', () => {
    expect(messageParagraphs({ role: 'user', text: '  **Combien** de séries ?\nEt de reps ?  ' })).toEqual([
      '**Combien** de séries\u00a0?\nEt de reps\u00a0?',
    ])
    expect(messageParagraphs({ role: 'user', text: 'Un\n\nDeux' })).toEqual(['Un', 'Deux'])
  })
})

describe('jours de la discussion', () => {
  it('nomme le jour d’un message', () => {
    expect(chatDayLabel('2026-10-21', '2026-10-21')).toBe('Aujourd’hui')
    expect(chatDayLabel('2026-10-20', '2026-10-21')).toBe('Hier')
    expect(chatDayLabel('2026-10-19', '2026-10-21')).toBe('Lundi 19 octobre')
    expect(chatDayLabel('2025-10-21', '2026-10-21')).toBe('Mardi 21 octobre 2025')
  })

  it('range les messages par jour local, dans l’ordre de seq', () => {
    const messages = [
      coachMessage(3, 'assistant', { createdAt: '2026-10-20T22:30:00.000Z' }),
      coachMessage(0, 'user', { createdAt: '2026-10-19T09:00:00.000Z' }),
      coachMessage(2, 'user', { createdAt: '2026-10-20T22:30:00.000Z' }),
      coachMessage(1, 'assistant', { createdAt: '2026-10-19T09:00:00.000Z' }),
    ]
    // 22 h 30 en temps universel : 0 h 30 le 21 à Paris.
    expect(
      chatDays(messages, '2026-10-21').map(({ day, label, messages }) => ({
        day,
        label,
        seqs: messages.map((message) => message.seq),
      })),
    ).toEqual([
      { day: '2026-10-19', label: 'Lundi 19 octobre', seqs: [0, 1] },
      { day: '2026-10-21', label: 'Aujourd’hui', seqs: [2, 3] },
    ])
    expect(chatDays([], '2026-10-21')).toEqual([])
  })
})
