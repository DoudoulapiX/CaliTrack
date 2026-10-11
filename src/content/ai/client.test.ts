import { errorResponse, fakeAnthropicFetch } from '@/test/anthropic'
import { checkApiKey, looksLikeApiKey } from './client'
import { AI_MODEL_OPTIONS, aiModelOption } from './models'

const KEY = 'sk-ant-api03-test-0123456789abcdefghij'

describe('clé de l’API Claude', () => {
  it('se vérifie avec la liste des modèles, gratuite', async () => {
    const { fetchImpl, requests } = fakeAnthropicFetch(
      new Response(JSON.stringify({ data: [], has_more: false, first_id: null, last_id: null }), {
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(await checkApiKey(KEY, fetchImpl)).toBeNull()
    expect(requests[0]?.url).toBe('https://api.anthropic.com/v1/models?limit=1')
    expect(requests[0]?.headers.get('x-api-key')).toBe(KEY)
  })

  it('dit pourquoi une clé ne marche pas', async () => {
    expect(
      await checkApiKey(KEY, fakeAnthropicFetch(errorResponse(401, 'authentication_error')).fetchImpl),
    ).toBe('invalidKey')
    expect(await checkApiKey(KEY, fakeAnthropicFetch(new TypeError('x'), new TypeError('x')).fetchImpl)).toBe(
      'offline',
    )
  })

  it('repère un copier-coller raté', () => {
    expect(looksLikeApiKey(KEY)).toBe(true)
    expect(looksLikeApiKey(`  ${KEY}\n`)).toBe(true)
    expect(looksLikeApiKey('sk-ant-court')).toBe(false)
    expect(looksLikeApiKey('ma clé')).toBe(false)
  })

  it('propose trois modèles, Opus par défaut', () => {
    expect(AI_MODEL_OPTIONS.map((option) => option.id)).toEqual([
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
    ])
    expect(aiModelOption('claude-haiku-5-5').label).toBe('Haiku 5.5')
  })
})
