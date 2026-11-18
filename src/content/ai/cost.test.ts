import { AI_MODEL_OPTIONS } from './models'
import { actionCost, AI_PRICES, costOf, monthlyEstimate, priceOf, TYPICAL_USAGE } from './cost'

const MILLION = { inputTokens: 1e6, outputTokens: 1e6, cacheReadTokens: 1e6, cacheWriteTokens: 1e6 }

describe('coût des demandes à ChatGPT', () => {
  it('a un prix pour chaque modèle proposé, écriture du cache à 1,25 fois l’entrée', () => {
    for (const option of AI_MODEL_OPTIONS) {
      const price = AI_PRICES[option.id]
      expect(price.cacheWrite).toBeCloseTo(price.input * 1.25, 10)
      expect(price.cacheRead).toBeLessThan(price.input)
    }
  })

  it('compte chaque sorte de jetons à son prix', () => {
    expect(costOf(MILLION, 'gpt-6.2-astra')).toBeCloseTo(8 + 40 + 0.4 + 10, 10)
    expect(costOf(MILLION, 'gpt-6.2-sol')).toBeCloseTo(2 + 10 + 0.1 + 2.5, 10)
    expect(costOf(MILLION, 'gpt-6-luna')).toBeCloseTo(0.1 + 0.5 + 0.01 + 0.125, 10)
    // Une photo de repas ordinaire avec Sol : 1 850 jetons d'entrée, 420 de sortie.
    const photo = { inputTokens: 1850, outputTokens: 420, cacheReadTokens: 0, cacheWriteTokens: 0 }
    expect(costOf(photo, 'gpt-6.2-sol')).toBeCloseTo((1850 * 2 + 420 * 10) / 1e6, 12)
  })

  it('compte un modèle inconnu (ou un ancien modèle Claude) au prix d’Astra, le plus cher', () => {
    expect(priceOf('gpt-futur-9')).toEqual(AI_PRICES['gpt-6.2-astra'])
    expect(priceOf('claude-opus-5-5')).toEqual(AI_PRICES['gpt-6.2-astra'])
    expect(priceOf('toString')).toEqual(AI_PRICES['gpt-6.2-astra'])
    expect(costOf(MILLION, 'gpt-futur-9')).toBe(costOf(MILLION, 'gpt-6.2-astra'))
  })

  it('estime une demande ordinaire et un mois d’usage', () => {
    expect(actionCost('chat', 'gpt-6.2-sol')).toBeCloseTo(0.01625, 10)
    expect(actionCost('daily', 'gpt-6.2-sol')).toBeCloseTo(0.037, 10)
    expect(Object.keys(TYPICAL_USAGE).sort()).toEqual([
      'body',
      'chat',
      'daily',
      'fridge',
      'ideas',
      'mealPhoto',
    ])

    const astra = monthlyEstimate('gpt-6.2-astra')
    const sol = monthlyEstimate('gpt-6.2-sol')
    const luna = monthlyEstimate('gpt-6-luna')
    expect(astra).toBeGreaterThanOrEqual(13)
    expect(astra).toBeLessThanOrEqual(14)
    expect(sol).toBeGreaterThanOrEqual(3.2)
    expect(sol).toBeLessThanOrEqual(3.6)
    expect(luna).toBeLessThan(0.3)
  })
})
