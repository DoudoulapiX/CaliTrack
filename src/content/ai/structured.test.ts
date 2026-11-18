import { z } from 'zod'
import {
  AI_ERROR_CASES,
  fakeOpenAiFetch,
  messageResponse,
  streamController,
  streamResponse,
} from '@/test/openai'
import {
  askStructured,
  choice,
  jsonSchemaOf,
  MAX_TOKENS,
  readStructured,
  type StructuredRequest,
} from './structured'

const KEY = 'sk-proj-test-0123456789abcdefghij'
const USAGE = { inputTokens: 1850, outputTokens: 420, cacheReadTokens: 0, cacheWriteTokens: 0 }

const schema = z.object({ answer: z.string(), score: z.number(), tags: z.array(z.string()) })
const ANSWER = { answer: 'Repos', score: 3, tags: ['sommeil'] }

function request(
  fetchImpl: typeof fetch,
  patch: Partial<StructuredRequest<typeof schema>> = {},
): StructuredRequest<typeof schema> {
  return {
    apiKey: KEY,
    model: 'gpt-6.2-sol',
    system: 'Tu es le coach.',
    content: [{ type: 'text', text: 'Que faire aujourd’hui ?' }],
    schema,
    effort: 'medium',
    fetchImpl,
    ...patch,
  }
}

describe('réponses structurées de ChatGPT', () => {
  it('lit la réponse après le bloc de réflexion, avec les jetons facturés', async () => {
    const { fetchImpl } = fakeOpenAiFetch(streamResponse(ANSWER))
    expect(await askStructured(request(fetchImpl))).toEqual({ ok: true, value: ANSWER, usage: USAGE })
  })

  it('demande un flux avec un schéma JSON strict, sans rien garder chez OpenAI', async () => {
    const { fetchImpl, requests } = fakeOpenAiFetch(streamResponse(ANSWER), streamResponse(ANSWER))
    await askStructured(request(fetchImpl))
    await askStructured(
      request(fetchImpl, {
        effort: 'low',
        model: 'gpt-6-luna',
        content: [
          { type: 'image', jpegBase64: 'SU1BR0U=' },
          { type: 'text', text: 'Et ça ?' },
        ],
      }),
    )

    const [medium, low] = requests
    expect(medium?.url).toBe('https://api.openai.com/v1/responses')
    expect(medium?.headers.get('authorization')).toBe(`Bearer ${KEY}`)
    expect(medium?.headers.get('content-type')).toBe('application/json')
    expect(medium?.body).toEqual({
      model: 'gpt-6.2-sol',
      instructions: 'Tu es le coach.',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'Que faire aujourd’hui ?' }] }],
      max_output_tokens: 16000,
      reasoning: { effort: 'medium' },
      text: { format: { type: 'json_schema', name: 'reponse', strict: true, schema: jsonSchemaOf(schema) } },
      store: false,
      stream: true,
    })
    expect(low?.body).toMatchObject({
      model: 'gpt-6-luna',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_image', image_url: 'data:image/jpeg;base64,SU1BR0U=', detail: 'auto' },
            { type: 'input_text', text: 'Et ça ?' },
          ],
        },
      ],
      max_output_tokens: 8000,
      reasoning: { effort: 'low' },
      stream: true,
    })
    expect(MAX_TOKENS).toEqual({ low: 8000, medium: 16000 })
  })

  it('reconnaît chaque problème, et rend les jetons quand une réponse est revenue', async () => {
    for (const errorCase of AI_ERROR_CASES) {
      const { fetchImpl } = fakeOpenAiFetch(...errorCase.answers())
      const billed = errorCase.problem === 'refused' || errorCase.structuredOnly === true
      expect(await askStructured(request(fetchImpl)), errorCase.name).toEqual({
        ok: false,
        problem: errorCase.problem,
        usage: billed ? USAGE : null,
      })
    }
  })

  it('distingue un refus d’un échec, même dans une réponse terminée', async () => {
    const { fetchImpl } = fakeOpenAiFetch(messageResponse(null, 'refusal'), streamResponse('', 'completed'))
    expect(await askStructured(request(fetchImpl))).toMatchObject({ ok: false, problem: 'refused' })
    expect(await askStructured(request(fetchImpl))).toMatchObject({ ok: false, problem: 'failed' })
  })

  it('s’arrête quand on annule pendant la réponse', async () => {
    const stream = streamController()
    const controller = new AbortController()
    const { fetchImpl, requests } = fakeOpenAiFetch(stream.answer)
    stream.push('{"answer": "Re')
    const pending = askStructured(request(fetchImpl, { signal: controller.signal }))
    await vi.waitFor(() => {
      expect(requests).toHaveLength(1)
    })
    controller.abort()
    expect(await pending).toEqual({ ok: false, problem: 'cancelled', usage: null })
  })

  it('donne un schéma JSON fermé, accepté par les sorties strictes', () => {
    expect(jsonSchemaOf(schema)).toEqual({
      type: 'object',
      properties: {
        answer: { type: 'string' },
        score: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
      required: ['answer', 'score', 'tags'],
    })
    const nested = z.object({
      low: z.number().nullable().describe('Bas'),
      items: z.array(z.object({ name: z.string() })),
    })
    expect(jsonSchemaOf(nested)).toEqual({
      type: 'object',
      properties: {
        low: { type: ['number', 'null'], description: 'Bas' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
      required: ['low', 'items'],
      additionalProperties: false,
    })
  })

  it('compte les jetons du cache à part, et refuse une réponse sans jetons comptés', () => {
    const response = {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(ANSWER) }] }],
    }
    expect(
      readStructured(
        {
          ...response,
          usage: { input_tokens: 2000, output_tokens: 10, input_tokens_details: { cached_tokens: 1500 } },
        },
        schema,
      ),
    ).toEqual({
      ok: true,
      value: ANSWER,
      usage: { inputTokens: 500, outputTokens: 10, cacheReadTokens: 1500, cacheWriteTokens: 0 },
    })
    expect(readStructured(response, schema)).toEqual({ ok: false, problem: 'failed', usage: null })
    expect(readStructured({ ...response, status: 'cancelled' }, schema)).toMatchObject({
      problem: 'cancelled',
    })
    expect(readStructured({ ...response, status: 'queued' }, schema)).toMatchObject({ problem: 'failed' })
  })

  it('ramène une valeur libre à un choix permis', () => {
    const decisions = ['asPlanned', 'lighter', 'rest'] as const
    expect(choice('lighter', decisions, 'asPlanned')).toBe('lighter')
    expect(choice('Lighter', decisions, 'asPlanned')).toBe('asPlanned')
    expect(choice('', decisions, 'rest')).toBe('rest')
  })
})
