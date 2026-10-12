import type { AiProblem } from '@/content/ai/client'
import { NBSP } from '@/lib/typography'
import {
  AI_PROBLEM_TEXT,
  canRetry,
  costHintText,
  maskKey,
  needsAiSettings,
  problemText,
  type AiTask,
} from './ai-view'

const PROBLEMS: AiProblem[] = [
  'offline',
  'invalidKey',
  'noCredit',
  'busy',
  'model',
  'refused',
  'cancelled',
  'failed',
]

const TASKS: AiTask[] = ['photo', 'daily', 'body', 'fridge', 'ideas', 'chat']

describe('textes de l’IA', () => {
  it('expliquent chaque problème, avec la typographie française', () => {
    for (const problem of PROBLEMS) {
      expect(AI_PROBLEM_TEXT[problem]).not.toMatch(/ [:;!?]/)
    }
    expect(AI_PROBLEM_TEXT.noCredit).toContain('platform.claude.com')
  })

  it('disent quoi faire ensuite', () => {
    expect(PROBLEMS.filter(canRetry)).toEqual(['offline', 'busy', 'failed'])
    expect(PROBLEMS.filter(needsAiSettings)).toEqual(['invalidKey', 'model'])
  })

  it('masquent la clé', () => {
    expect(maskKey('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')).toBe('sk-ant-…wxyz')
    expect(maskKey('court')).toBe('••••')
  })

  it('expliquent chaque problème de chaque demande, avec la typographie française', () => {
    for (const task of TASKS) {
      for (const problem of PROBLEMS) {
        const text = problemText(problem, task)
        expect(text, `${task} ${problem}`).not.toMatch(/ [:;!?%»]/)
        expect(text, `${task} ${problem}`).toMatch(/\.$/)
      }
    }
    // La photo de repas garde ses textes ; les problèmes communs se disent pareil partout.
    for (const problem of PROBLEMS) expect(problemText(problem, 'photo')).toBe(AI_PROBLEM_TEXT[problem])
    expect(problemText('offline', 'chat')).toBe(AI_PROBLEM_TEXT.offline)
    expect(problemText('busy', 'daily')).toBe(AI_PROBLEM_TEXT.busy)
    // Refus et échecs parlent de la demande faite.
    expect(problemText('refused', 'body')).toBe(
      'Claude n’analyse pas ces photos. Essaie avec d’autres, en tenue de sport.',
    )
    expect(problemText('failed', 'chat')).toBe('Le coach n’a pas pu répondre. Réessaie.')
    const refusals = new Set(TASKS.map((task) => problemText('refused', task)))
    const failures = new Set(TASKS.map((task) => problemText('failed', task)))
    expect(refusals.size).toBe(TASKS.length)
    expect(failures.size).toBe(TASKS.length)
  })

  it('annoncent le prix d’une demande, arrondi au centime supérieur', () => {
    expect(costHintText(0.074, 'Opus 5.5')).toBe(`Environ 8${NBSP}centimes avec Opus${NBSP}5.5`)
    expect(costHintText(0.07, 'Opus 5.5')).toBe(`Environ 7${NBSP}centimes avec Opus${NBSP}5.5`)
    expect(costHintText(0.0101, 'Sonnet 5.5')).toBe(`Environ 2${NBSP}centimes avec Sonnet${NBSP}5.5`)
    expect(costHintText(0.01, 'Sonnet 5.5')).toBe(`Environ 1${NBSP}centime avec Sonnet${NBSP}5.5`)
    expect(costHintText(0.00185, 'Haiku 5.5')).toBe(`Moins d’un centime avec Haiku${NBSP}5.5`)
  })
})
