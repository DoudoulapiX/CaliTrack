import Anthropic from '@anthropic-ai/sdk'
import { aiClient } from '@/content/ai/client'
import {
  AI_ERROR_CASES,
  CHAT_ANSWER,
  fakeAnthropicFetch,
  messageResponse,
  PLATE_ESTIMATE,
  streamController,
  streamErrorResponse,
  streamResponse,
} from './anthropic'

const KEY = 'sk-ant-api03-test-0123456789abcdefghij'

/** Une demande en flux à l'API simulée, comme celles de l'appli. */
function stream(fetchImpl: typeof fetch, signal?: AbortSignal) {
  return aiClient(KEY, fetchImpl).messages.stream(
    { model: 'claude-opus-5-5', max_tokens: 8000, messages: [{ role: 'user', content: 'Bonjour' }] },
    { signal },
  )
}

describe('API Claude simulée', () => {
  it('renvoie en flux une réponse JSON quand la demande attend un flux', async () => {
    const { fetchImpl, requests } = fakeAnthropicFetch(messageResponse(PLATE_ESTIMATE))
    const message = await stream(fetchImpl).finalMessage()
    expect(requests[0]?.body).toMatchObject({ stream: true })
    expect(message.stop_reason).toBe('end_turn')
    expect(message.content).toEqual([{ type: 'text', text: JSON.stringify(PLATE_ESTIMATE) }])
    expect(message.usage).toMatchObject({ input_tokens: 1850, output_tokens: 420 })
  })

  it('laisse telle quelle une réponse à une demande sans flux', async () => {
    const { fetchImpl } = fakeAnthropicFetch(messageResponse(PLATE_ESTIMATE))
    const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ stream: false }),
    })
    expect(response.headers.get('content-type')).toBe('application/json')
  })

  it('commence par la réflexion, puis donne le texte en morceaux', async () => {
    const { fetchImpl } = fakeAnthropicFetch(streamResponse(CHAT_ANSWER))
    const deltas: string[] = []
    const message = await stream(fetchImpl)
      .on('text', (delta) => deltas.push(delta))
      .finalMessage()
    expect(message.content.map((block) => block.type)).toEqual(['thinking', 'text'])
    expect(deltas).toHaveLength(3)
    expect(deltas.join('')).toBe(CHAT_ANSWER)
    expect(message.usage).toMatchObject({ cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })
  })

  it('interrompt une réponse sur une erreur sans code HTTP', async () => {
    const { fetchImpl } = fakeAnthropicFetch(streamErrorResponse('overloaded_error'))
    const error: unknown = await stream(fetchImpl)
      .finalMessage()
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Anthropic.APIError)
    expect(error).toMatchObject({ status: undefined, type: 'overloaded_error' })
  })

  it('arrête le flux quand la demande est annulée', async () => {
    const controller = new AbortController()
    const live = streamController()
    const { fetchImpl } = fakeAnthropicFetch(live.answer)
    live.push('Je')
    const pending = stream(fetchImpl, controller.signal).on('text', () => {
      controller.abort()
    })
    await expect(pending.finalMessage()).rejects.toBeInstanceOf(Anthropic.APIUserAbortError)
  })

  it('donne les morceaux du flux piloté dans l’ordre', async () => {
    const live = streamController()
    const { fetchImpl } = fakeAnthropicFetch(live.answer)
    const deltas: string[] = []
    const pending = stream(fetchImpl)
      .on('text', (delta) => deltas.push(delta))
      .finalMessage()
    live.push('Un, ')
    live.push('deux, ')
    live.push('trois.')
    live.finish('max_tokens')
    const message = await pending
    expect(deltas).toEqual(['Un, ', 'deux, ', 'trois.'])
    expect(message.content).toEqual([{ type: 'text', text: 'Un, deux, trois.' }])
    expect(message.stop_reason).toBe('max_tokens')
  })

  it('interrompt le flux piloté sur une erreur', async () => {
    const live = streamController()
    const { fetchImpl } = fakeAnthropicFetch(live.answer)
    live.push('Je')
    live.fail('rate_limit_error')
    await expect(stream(fetchImpl).finalMessage()).rejects.toMatchObject({ type: 'rate_limit_error' })
  })

  it('répond à une demande imprévue par une erreur', async () => {
    const { fetchImpl } = fakeAnthropicFetch()
    await expect(fetchImpl('https://api.anthropic.com/v1/messages')).rejects.toThrow('Aucune réponse prévue')
  })

  it('liste chaque problème une seule fois', () => {
    const names = AI_ERROR_CASES.map((errorCase) => errorCase.name)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(AI_ERROR_CASES.map((errorCase) => errorCase.problem))).toEqual(
      new Set(['offline', 'invalidKey', 'noCredit', 'model', 'busy', 'refused', 'failed']),
    )
  })
})
