import type { AiProblem } from '@/content/ai/client'
import { MONTHLY_PLAN } from '@/content/ai/cost'
import { aiUsageRow } from '@/test/fixtures'
import { NBSP } from '@/lib/typography'
import {
  AI_PROBLEM_TEXT,
  canRetry,
  COST_PRIVACY_TEXT,
  costHintText,
  DELETE_KEY_TEXT,
  ESTIMATE_NOTE,
  maskKey,
  MONTHLY_PLAN_TEXT,
  monthlyEstimateLines,
  monthUsageText,
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
    expect(AI_PROBLEM_TEXT.noCredit).toContain('platform.openai.com')
  })

  it('disent quoi faire ensuite', () => {
    expect(PROBLEMS.filter(canRetry)).toEqual(['offline', 'busy', 'failed'])
    expect(PROBLEMS.filter(needsAiSettings)).toEqual(['invalidKey', 'model'])
  })

  it('masquent la clé', () => {
    expect(maskKey('sk-proj-abcdefghijklmnopqrstuvwxyz')).toBe('sk-proj-…wxyz')
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
      'ChatGPT n’analyse pas ces photos. Essaie avec d’autres, en tenue de sport.',
    )
    expect(problemText('failed', 'chat')).toBe('Le coach n’a pas pu répondre. Réessaie.')
    const refusals = new Set(TASKS.map((task) => problemText('refused', task)))
    const failures = new Set(TASKS.map((task) => problemText('failed', task)))
    expect(refusals.size).toBe(TASKS.length)
    expect(failures.size).toBe(TASKS.length)
  })

  it('annoncent le prix d’une demande, arrondi au centime supérieur', () => {
    expect(costHintText(0.074, 'GPT-6.2 Sol')).toBe(`Environ 8${NBSP}centimes avec GPT-6.2${NBSP}Sol`)
    expect(costHintText(0.07, 'GPT-6.2 Sol')).toBe(`Environ 7${NBSP}centimes avec GPT-6.2${NBSP}Sol`)
    expect(costHintText(0.0101, 'GPT-6.2 Astra')).toBe(`Environ 2${NBSP}centimes avec GPT-6.2${NBSP}Astra`)
    expect(costHintText(0.01, 'GPT-6.2 Astra')).toBe(`Environ 1${NBSP}centime avec GPT-6.2${NBSP}Astra`)
    expect(costHintText(0.00185, 'GPT-6 Luna')).toBe(`Moins d’un centime avec GPT-6${NBSP}Luna`)
  })

  it('disent ce qui est facturé et ce qui part vers OpenAI, avec la typographie française', () => {
    for (const text of [COST_PRIVACY_TEXT, MONTHLY_PLAN_TEXT, ESTIMATE_NOTE, DELETE_KEY_TEXT]) {
      expect(text).not.toMatch(/ [:;!?%»]/)
    }
    expect(COST_PRIVACY_TEXT).toContain('CaliTrack ne garde pas les photos.')
    expect(MONTHLY_PLAN_TEXT).toMatch(/\u00a0:$/)
    expect(ESTIMATE_NOTE).toBe(`Estimation calculée sur cet iPhone${NBSP}; ta facture OpenAI fait foi.`)
  })

  it('estiment un mois d’usage avec chaque modèle, le modèle choisi marqué', () => {
    const lines = monthlyEstimateLines('gpt-6.2-astra')
    expect(lines.map((line) => line.text)).toEqual([
      `GPT-6.2${NBSP}Astra${NBSP}: environ 13,44${NBSP}$ (choisi)`,
      `GPT-6.2${NBSP}Sol${NBSP}: environ 3,36${NBSP}$`,
      `GPT-6${NBSP}Luna${NBSP}: environ 0,17${NBSP}$`,
    ])
    expect(lines.filter((line) => line.chosen).map((line) => line.model)).toEqual(['gpt-6.2-astra'])
    expect(monthlyEstimateLines('gpt-6.2-sol')[1]?.text).toMatch(/\(choisi\)$/)
    // MONTHLY_PLAN_TEXT décrit ce mois-là en mots : à réécrire si le plan change.
    expect(MONTHLY_PLAN).toEqual({ daily: 30, mealPhoto: 30, chat: 60, ideas: 12, fridge: 8, body: 4 })
  })

  it('comptent les demandes du mois sur cet iPhone', () => {
    expect(monthUsageText(null)).toBe('Aucune demande ce mois-ci.')
    expect(monthUsageText(aiUsageRow({ calls: 0, costUsd: 0 }))).toBe('Aucune demande ce mois-ci.')
    expect(monthUsageText(aiUsageRow({ calls: 37, costUsd: 0.4249 }))).toBe(
      `Ce mois-ci sur cet iPhone${NBSP}: 0,42${NBSP}$ pour 37${NBSP}demandes`,
    )
    expect(monthUsageText(aiUsageRow({ calls: 1, costUsd: 0.074 }))).toBe(
      `Ce mois-ci sur cet iPhone${NBSP}: 0,07${NBSP}$ pour 1${NBSP}demande`,
    )
    // Quelques demandes à Haiku : jamais « 0,00 $ ».
    expect(monthUsageText(aiUsageRow({ calls: 2, costUsd: 0.0037 }))).toBe(
      `Ce mois-ci sur cet iPhone${NBSP}: moins d’un centime pour 2${NBSP}demandes`,
    )
  })
})
