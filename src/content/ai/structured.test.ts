import { z } from 'zod'
import {
  AI_ERROR_CASES,
  fakeAnthropicFetch,
  messageResponse,
  streamController,
  streamResponse,
} from '@/test/anthropic'
import { askStructured, choice, jsonSchemaOf, MAX_TOKENS, type StructuredRequest } from './structured'

const KEY = 'sk-ant-api03-test-0123456789abcdefghij'
const USAGE = { inputTokens: 1850, outputTokens: 420, cacheReadTokens: 0, cacheWriteTokens: 0 }

const schema = z.object({ answer: z.string(), score: z.number(), tags: z.array(z.string()) })
const ANSWER = { answer: 'Repos', score: 3, tags: ['sommeil'] }

function request(
  fetchImpl: typeof fetch,
  patch: Partial<StructuredRequest<typeof schema>> = {},
): StructuredRequest<typeof schema> {
  return {
    apiKey: KEY,
    model: 'claude-opus-5-5',
    system: 'Tu es le coach.',
    content: [{ type: 'text', text: 'Que faire aujourd’hui ?' }],
    schema,
    effort: 'medium',
    fetchImpl,
    ...patch,
  }
}

describe('réponses structurées de Claude', () => {
  it('lit la réponse après le bloc de réflexion, avec les jetons facturés', async () => {
    const { fetchImpl } = fakeAnthropicFetch(streamResponse(ANSWER))
    expect(await askStructured(request(fetchImpl))).toEqual({ ok: true, value: ANSWER, usage: USAGE })
  })

  it('demande un flux avec un schéma JSON simple, sans lecture automatique', async () => {
    const { fetchImpl, requests } = fakeAnthropicFetch(streamResponse(ANSWER), streamResponse(ANSWER))
    await askStructured(request(fetchImpl))
    await askStructured(request(fetchImpl, { effort: 'low', model: 'claude-haiku-5-5' }))

    const [medium, low] = requests
    expect(medium?.url).toBe('https://api.anthropic.com/v1/messages')
    expect(medium?.headers.get('x-api-key')).toBe(KEY)
    expect(medium?.body).toEqual({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      system: 'Tu es le coach.',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Que faire aujourd’hui ?' }] }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: jsonSchemaOf(schema) } },
      stream: true,
    })
    expect(low?.body).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 8000,
      output_config: { effort: 'low' },
      stream: true,
    })
    expect(MAX_TOKENS).toEqual({ low: 8000, medium: 16000 })
  })

  it('reconnaît chaque problème, et rend les jetons quand une réponse est revenue', async () => {
    for (const errorCase of AI_ERROR_CASES) {
      const { fetchImpl } = fakeAnthropicFetch(...errorCase.answers())
      const billed = errorCase.problem === 'refused' || errorCase.structuredOnly === true
      expect(await askStructured(request(fetchImpl)), errorCase.name).toEqual({
        ok: false,
        problem: errorCase.problem,
        usage: billed ? USAGE : null,
      })
    }
  })

  it('distingue un refus d’un échec', async () => {
    const { fetchImpl } = fakeAnthropicFetch(messageResponse(null, 'refusal'), streamResponse('', 'end_turn'))
    expect(await askStructured(request(fetchImpl))).toMatchObject({ ok: false, problem: 'refused' })
    expect(await askStructured(request(fetchImpl))).toMatchObject({ ok: false, problem: 'failed' })
  })

  it('s’arrête quand on annule pendant la réponse', async () => {
    const stream = streamController()
    const controller = new AbortController()
    const { fetchImpl, requests } = fakeAnthropicFetch(stream.answer)
    stream.push('{"answer": "Re')
    const pending = askStructured(request(fetchImpl, { signal: controller.signal }))
    await vi.waitFor(() => {
      expect(requests).toHaveLength(1)
    })
    controller.abort()
    expect(await pending).toEqual({ ok: false, problem: 'cancelled', usage: null })
  })

  it('donne un schéma JSON fermé', () => {
    expect(jsonSchemaOf(schema)).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['answer', 'score', 'tags'],
    })
    expect(jsonSchemaOf(schema)).not.toHaveProperty('parse')
  })

  it('ramène une valeur libre à un choix permis', () => {
    const decisions = ['asPlanned', 'lighter', 'rest'] as const
    expect(choice('lighter', decisions, 'asPlanned')).toBe('lighter')
    expect(choice('Lighter', decisions, 'asPlanned')).toBe('asPlanned')
    expect(choice('', decisions, 'rest')).toBe('rest')
  })
})
