import { streamResponses } from '@/content/ai/responses'
import {
  AI_ERROR_CASES,
  CHAT_ANSWER,
  failedResponse,
  fakeOpenAiFetch,
  messageResponse,
  PLATE_ESTIMATE,
  streamController,
  streamErrorResponse,
  streamResponse,
  usageWith,
} from './openai'

const KEY = 'sk-proj-test-0123456789abcdefghij'

/** Une demande en flux à l'API simulée, comme celles de l'appli. */
function stream(fetchImpl: typeof fetch, onText?: (delta: string) => void, signal?: AbortSignal) {
  return streamResponses({
    apiKey: KEY,
    body: { model: 'gpt-6.2-sol', input: [{ role: 'user', content: 'Bonjour' }] },
    onText,
    signal,
    fetchImpl,
  })
}

describe('API OpenAI simulée', () => {
  it('renvoie en flux une réponse JSON quand la demande attend un flux', async () => {
    const { fetchImpl, requests } = fakeOpenAiFetch(messageResponse(PLATE_ESTIMATE))
    const response = await stream(fetchImpl)
    expect(requests[0]?.body).toMatchObject({ stream: true })
    expect(response.status).toBe('completed')
    expect(response.output?.at(-1)).toMatchObject({
      type: 'message',
      content: [{ type: 'output_text', text: JSON.stringify(PLATE_ESTIMATE) }],
    })
    expect(response.usage).toMatchObject({ input_tokens: 1850, output_tokens: 420 })
  })

  it('laisse telle quelle une réponse à une demande sans flux', async () => {
    const { fetchImpl } = fakeOpenAiFetch(messageResponse(PLATE_ESTIMATE))
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      body: JSON.stringify({ stream: false }),
    })
    expect(response.headers.get('content-type')).toBe('application/json')
  })

  it('commence par la réflexion, puis donne le texte en morceaux', async () => {
    const { fetchImpl } = fakeOpenAiFetch(streamResponse(CHAT_ANSWER))
    const deltas: string[] = []
    const response = await stream(fetchImpl, (delta) => deltas.push(delta))
    expect(response.output?.map((item) => item.type)).toEqual(['reasoning', 'message'])
    expect(deltas).toHaveLength(3)
    expect(deltas.join('')).toBe(CHAT_ANSWER)
  })

  it('compte le cache dans les jetons d’entrée', () => {
    expect(usageWith({ cached: 300, written: 50 })).toMatchObject({
      input_tokens: 2200,
      input_tokens_details: { cached_tokens: 300, cache_write_tokens: 50 },
    })
  })

  it('marque une réponse coupée ou filtrée comme incomplète', async () => {
    const { fetchImpl } = fakeOpenAiFetch(
      streamResponse('Un', 'max_output_tokens'),
      streamResponse(null, 'content_filter'),
      streamResponse(null, 'refusal'),
    )
    expect(await stream(fetchImpl)).toMatchObject({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
    })
    expect(await stream(fetchImpl)).toMatchObject({
      status: 'incomplete',
      incomplete_details: { reason: 'content_filter' },
    })
    expect((await stream(fetchImpl)).output?.at(-1)).toMatchObject({ content: [{ type: 'refusal' }] })
  })

  it('interrompt une réponse sur une erreur sans code HTTP', async () => {
    const { fetchImpl } = fakeOpenAiFetch(streamErrorResponse('server_error'), failedResponse('bio_policy'))
    await expect(stream(fetchImpl)).rejects.toMatchObject({ problem: 'busy' })
    expect(await stream(fetchImpl)).toMatchObject({ status: 'failed', error: { code: 'bio_policy' } })
  })

  it('arrête le flux quand la demande est annulée', async () => {
    const controller = new AbortController()
    const live = streamController()
    const { fetchImpl } = fakeOpenAiFetch(live.answer)
    live.push('Je')
    const pending = stream(
      fetchImpl,
      () => {
        controller.abort()
      },
      controller.signal,
    )
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('donne les morceaux du flux piloté dans l’ordre', async () => {
    const live = streamController()
    const { fetchImpl } = fakeOpenAiFetch(live.answer)
    const deltas: string[] = []
    const pending = stream(fetchImpl, (delta) => deltas.push(delta))
    live.push('Un, ')
    live.push('deux, ')
    live.push('trois.')
    live.finish('max_output_tokens')
    const response = await pending
    expect(deltas).toEqual(['Un, ', 'deux, ', 'trois.'])
    expect(response.output).toEqual([
      expect.objectContaining({ content: [expect.objectContaining({ text: 'Un, deux, trois.' })] }),
    ])
    expect(response.status).toBe('incomplete')
  })

  it('interrompt le flux piloté sur une erreur', async () => {
    const live = streamController()
    const { fetchImpl } = fakeOpenAiFetch(live.answer)
    live.push('Je')
    live.fail('insufficient_quota')
    await expect(stream(fetchImpl)).rejects.toMatchObject({ problem: 'noCredit' })
  })

  it('répond à une demande imprévue par une erreur', async () => {
    const { fetchImpl } = fakeOpenAiFetch()
    await expect(fetchImpl('https://api.openai.com/v1/responses')).rejects.toThrow('Aucune réponse prévue')
  })

  it('liste chaque problème une seule fois', () => {
    const names = AI_ERROR_CASES.map((errorCase) => errorCase.name)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(AI_ERROR_CASES.map((errorCase) => errorCase.problem))).toEqual(
      new Set(['offline', 'invalidKey', 'noCredit', 'model', 'busy', 'refused', 'failed']),
    )
    for (const errorCase of AI_ERROR_CASES) {
      expect(errorCase.billed === true, errorCase.name).toBe(
        errorCase.problem === 'refused' || errorCase.structuredOnly === true,
      )
    }
  })
})
