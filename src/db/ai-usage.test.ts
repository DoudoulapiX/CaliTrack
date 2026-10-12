import { resetDb } from '@/test/db'
import { aiUsageRow } from '@/test/fixtures'
import { recordAiUsage, usageOfMonth } from './ai-usage'
import { db } from './db'
import type { AiUsage } from './types'

const call = (patch: Partial<AiUsage> = {}): AiUsage => ({
  inputTokens: 1850,
  outputTokens: 420,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  ...patch,
})

describe('compteur des demandes à Claude', () => {
  beforeEach(resetDb)

  it('ne connaît pas un mois sans demande', async () => {
    expect(await usageOfMonth('2026-10')).toBeUndefined()
  })

  it('additionne les demandes d’un même mois', async () => {
    await recordAiUsage(call(), 0.0158, '2026-10')
    await recordAiUsage(
      call({ inputTokens: 2000, cacheReadTokens: 5000, cacheWriteTokens: 1500 }),
      0.0255,
      '2026-10',
    )
    const row = await usageOfMonth('2026-10')
    expect(row).toMatchObject({
      month: '2026-10',
      calls: 2,
      inputTokens: 3850,
      outputTokens: 840,
      cacheReadTokens: 5000,
      cacheWriteTokens: 1500,
    })
    expect(row?.costUsd).toBeCloseTo(0.0413, 10)
  })

  it('ouvre une nouvelle ligne pour un nouveau mois', async () => {
    await db.aiUsage.put(aiUsageRow())
    await recordAiUsage(call(), 0.01, '2026-11')
    expect(await usageOfMonth('2026-10')).toEqual(aiUsageRow())
    expect(await usageOfMonth('2026-11')).toMatchObject({ calls: 1, inputTokens: 1850, costUsd: 0.01 })
  })

  it('compte une demande sans coût (jetons à zéro)', async () => {
    await recordAiUsage(call({ inputTokens: 0, outputTokens: 0 }), 0, '2026-10')
    expect(await usageOfMonth('2026-10')).toMatchObject({ calls: 1, inputTokens: 0, costUsd: 0 })
  })

  it.each<[string, AiUsage, number, string]>([
    ['des jetons négatifs', call({ outputTokens: -10 }), 0.01, '2026-10'],
    ['des jetons non entiers', call({ inputTokens: 1.5 }), 0.01, '2026-10'],
    ['un coût négatif', call(), -0.5, '2026-10'],
    ['un coût illisible', call(), Number.NaN, '2026-10'],
    ['un mois invalide', call(), 0.01, '2026-13'],
    ['un mois incomplet', call(), 0.01, '2026-1'],
  ])('refuse %s sans rien écrire', async (_, usage, cost, month) => {
    await db.aiUsage.put(aiUsageRow())
    await expect(recordAiUsage(usage, cost, month)).rejects.toThrow()
    expect(await db.aiUsage.toArray()).toEqual([aiUsageRow()])
  })
})
