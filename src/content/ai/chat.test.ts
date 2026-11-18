import {
  AI_ERROR_CASES,
  fakeOpenAiFetch,
  streamController,
  streamResponse,
  usageWith,
  type Answer,
} from '@/test/openai'
import { CHAT_MAX_TOKENS, streamChat, type ChatRequest } from './chat'

const KEY = 'sk-proj-test-0123456789abcdefghij'
const SYSTEM = 'Tu es le coach.\n\n<donnees>\n</donnees>'
const USAGE = { inputTokens: 1850, outputTokens: 420, cacheReadTokens: 0, cacheWriteTokens: 0 }

function chat(answer: Response | Answer, patch: Partial<ChatRequest> = {}) {
  const fake = fakeOpenAiFetch(answer)
  const deltas: string[] = []
  const result = streamChat({
    apiKey: KEY,
    model: 'gpt-6.2-sol',
    system: SYSTEM,
    messages: [
      { role: 'user', content: 'Bonjour' },
      { role: 'assistant', content: 'Salut !' },
      { role: 'user', content: 'Comment progresser ?' },
    ],
    onText: (delta) => deltas.push(delta),
    fetchImpl: fake.fetchImpl,
    ...patch,
  })
  return { result, deltas, requests: fake.requests }
}

describe('discussion avec le coach', () => {
  it('montre la réponse au fil de l’eau, puis la rend en entier', async () => {
    const stream = streamController()
    const { result, deltas } = chat(stream.answer)
    stream.push('Garde ')
    stream.push('trois séances')
    stream.push(' par semaine.  ')
    stream.finish()
    expect(await result).toEqual({ ok: true, text: 'Garde trois séances par semaine.', usage: USAGE })
    expect(deltas).toEqual(['Garde ', 'trois séances', ' par semaine.  '])
  })

  it('ne perd aucun morceau envoyé tout de suite', async () => {
    const stream = streamController()
    stream.push('Tout ')
    stream.push('de suite.')
    stream.finish()
    const { result, deltas } = chat(stream.answer)
    expect(await result).toMatchObject({ ok: true, text: 'Tout de suite.' })
    expect(deltas).toEqual(['Tout ', 'de suite.'])
  })

  it('ignore la réflexion et garde une réponse coupée qui a du texte', async () => {
    const thinking = chat(streamResponse('Repose-toi aujourd’hui.'))
    expect(await thinking.result).toMatchObject({ ok: true, text: 'Repose-toi aujourd’hui.' })
    expect(thinking.deltas.join('')).toBe('Repose-toi aujourd’hui.')
    const cut = chat(streamResponse('Commence par', 'max_output_tokens'))
    expect(await cut.result).toEqual({ ok: true, text: 'Commence par', usage: USAGE })
  })

  it('ne garde jamais une réponse vide, et reconnaît un refus', async () => {
    expect(await chat(streamResponse('  \n ')).result).toEqual({ ok: false, problem: 'failed', usage: USAGE })
    expect(await chat(streamResponse(null)).result).toEqual({ ok: false, problem: 'failed', usage: USAGE })
    expect(await chat(streamResponse(null, 'refusal')).result).toEqual({
      ok: false,
      problem: 'refused',
      usage: USAGE,
    })
    expect(await chat(streamResponse(null, 'content_filter')).result).toEqual({
      ok: false,
      problem: 'refused',
      usage: USAGE,
    })
  })

  it('s’arrête quand on annule au milieu de la réponse', async () => {
    const stream = streamController()
    const controller = new AbortController()
    stream.push('Je ')
    const { result, deltas } = chat(stream.answer, {
      signal: controller.signal,
      onText: (delta) => {
        deltas.push(delta)
        controller.abort()
      },
    })
    expect(await result).toEqual({ ok: false, problem: 'cancelled', usage: null })
    expect(deltas).toEqual(['Je '])
  })

  it('reconnaît chaque problème de l’API', async () => {
    for (const errorCase of AI_ERROR_CASES.filter((c) => c.structuredOnly !== true)) {
      const fake = fakeOpenAiFetch(...errorCase.answers())
      const result = await streamChat({
        apiKey: KEY,
        model: 'gpt-6.2-sol',
        system: 'Tu es le coach.',
        messages: [{ role: 'user', content: 'Bonjour' }],
        onText: () => undefined,
        fetchImpl: fake.fetchImpl,
      })
      expect(result, errorCase.name).toMatchObject({ ok: false, problem: errorCase.problem })
    }
  })

  it('envoie le texte seul, consignes en tête, sans rien garder chez OpenAI', async () => {
    const { result, requests } = chat(streamResponse('Oui.'))
    await result
    expect(requests[0]?.url).toBe('https://api.openai.com/v1/responses')
    expect(requests[0]?.headers.get('authorization')).toBe(`Bearer ${KEY}`)
    expect(requests[0]?.body).toEqual({
      model: 'gpt-6.2-sol',
      instructions: SYSTEM,
      input: [
        { role: 'user', content: 'Bonjour' },
        { role: 'assistant', content: 'Salut !' },
        { role: 'user', content: 'Comment progresser ?' },
      ],
      max_output_tokens: 8000,
      reasoning: { effort: 'medium' },
      store: false,
      stream: true,
    })
    expect(CHAT_MAX_TOKENS).toBe(8000)
  })

  it('compte les jetons relus dans le cache à part', async () => {
    const { result } = chat(
      streamResponse('Oui.', 'completed', { usage: usageWith({ cached: 5000, written: 1500 }) }),
    )
    expect(await result).toMatchObject({
      ok: true,
      usage: { inputTokens: 1850, outputTokens: 420, cacheReadTokens: 5000, cacheWriteTokens: 1500 },
    })
  })
})
