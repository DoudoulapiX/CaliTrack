import type { AiProblem } from '@/content/ai/client'
import { AI_PROBLEM_TEXT, canRetry, maskKey, needsAiSettings } from './ai-view'

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

describe('textes de l’IA', () => {
  it('expliquent chaque problème, avec la typographie française', () => {
    for (const problem of PROBLEMS) {
      expect(AI_PROBLEM_TEXT[problem]).not.toMatch(/ [:;!?]/)
    }
    expect(AI_PROBLEM_TEXT.noCredit).toContain('console.anthropic.com')
  })

  it('disent quoi faire ensuite', () => {
    expect(PROBLEMS.filter(canRetry)).toEqual(['offline', 'busy', 'failed'])
    expect(PROBLEMS.filter(needsAiSettings)).toEqual(['invalidKey', 'model'])
  })

  it('masquent la clé', () => {
    expect(maskKey('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')).toBe('sk-ant-…wxyz')
    expect(maskKey('court')).toBe('••••')
  })
})
