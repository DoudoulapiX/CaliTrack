import { AI_MODEL_OPTIONS } from './models'
import { actionCost, AI_PRICES, costOf, monthlyEstimate, priceOf, TYPICAL_USAGE } from './cost'

const MILLION = { inputTokens: 1e6, outputTokens: 1e6, cacheReadTokens: 1e6, cacheWriteTokens: 1e6 }

describe('coût des demandes à Claude', () => {
  it('a un prix pour chaque modèle proposé, écriture du cache à 1,25 fois l’entrée', () => {
    for (const option of AI_MODEL_OPTIONS) {
      const price = AI_PRICES[option.id]
      expect(price.cacheWrite).toBeCloseTo(price.input * 1.25, 10)
      expect(price.cacheRead).toBeLessThan(price.input)
    }
  })

  it('compte chaque sorte de jetons à son prix', () => {
    expect(costOf(MILLION, 'claude-opus-5-5')).toBeCloseTo(4 + 20 + 0.2 + 5, 10)
    expect(costOf(MILLION, 'claude-sonnet-5-5')).toBeCloseTo(2 + 10 + 0.2 + 2.5, 10)
    expect(costOf(MILLION, 'claude-haiku-5-5')).toBeCloseTo(0.1 + 0.5 + 0.01 + 0.125, 10)
    // Une photo de repas ordinaire avec Opus : 1 850 jetons d'entrée, 420 de sortie.
    const photo = { inputTokens: 1850, outputTokens: 420, cacheReadTokens: 0, cacheWriteTokens: 0 }
    expect(costOf(photo, 'claude-opus-5-5')).toBeCloseTo((1850 * 4 + 420 * 20) / 1e6, 12)
  })

  it('compte un modèle inconnu au prix d’Opus', () => {
    expect(priceOf('claude-futur-9')).toEqual(AI_PRICES['claude-opus-5-5'])
    expect(costOf(MILLION, 'claude-futur-9')).toBe(costOf(MILLION, 'claude-opus-5-5'))
  })

  it('estime une demande ordinaire et un mois d’usage', () => {
    expect(actionCost('chat', 'claude-opus-5-5')).toBeCloseTo(0.0325, 10)
    expect(actionCost('daily', 'claude-opus-5-5')).toBeCloseTo(0.074, 10)
    expect(Object.keys(TYPICAL_USAGE).sort()).toEqual([
      'body',
      'chat',
      'daily',
      'fridge',
      'ideas',
      'mealPhoto',
    ])

    const opus = monthlyEstimate('claude-opus-5-5')
    const sonnet = monthlyEstimate('claude-sonnet-5-5')
    const haiku = monthlyEstimate('claude-haiku-5-5')
    expect(opus).toBeGreaterThanOrEqual(6.5)
    expect(opus).toBeLessThanOrEqual(7)
    expect(sonnet).toBeGreaterThanOrEqual(3.2)
    expect(sonnet).toBeLessThanOrEqual(3.6)
    expect(haiku).toBeLessThan(0.3)
  })
})
