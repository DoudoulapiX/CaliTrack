import { errorResponse, fakeOpenAiFetch, modelsResponse } from '@/test/openai'
import {
  AI_TIMEOUT_MS,
  AiError,
  aiProblem,
  callApi,
  checkApiKey,
  looksLikeApiKey,
  looksLikeClaudeKey,
  problemOfCode,
  problemOfStatus,
} from './client'
import { AI_MODEL_OPTIONS, aiModelOption } from './models'

const KEY = 'sk-proj-test-0123456789abcdefghij'

describe('clé de l’API OpenAI', () => {
  it('se vérifie avec la liste des modèles, gratuite', async () => {
    const { fetchImpl, requests } = fakeOpenAiFetch(modelsResponse())
    expect(await checkApiKey(KEY, fetchImpl)).toBeNull()
    expect(requests[0]?.url).toBe('https://api.openai.com/v1/models')
    expect(requests[0]?.headers.get('authorization')).toBe(`Bearer ${KEY}`)
    expect(requests[0]?.body).toBeNull()
  })

  it('dit pourquoi une clé ne marche pas', async () => {
    expect(await checkApiKey(KEY, fakeOpenAiFetch(errorResponse(401, 'invalid_api_key')).fetchImpl)).toBe(
      'invalidKey',
    )
    expect(await checkApiKey(KEY, fakeOpenAiFetch(new TypeError('x'), new TypeError('x')).fetchImpl)).toBe(
      'offline',
    )
  })

  it('réessaie une fois quand le réseau manque', async () => {
    const { fetchImpl, requests } = fakeOpenAiFetch(new TypeError('x'), modelsResponse())
    expect(await checkApiKey(KEY, fetchImpl)).toBeNull()
    expect(requests).toHaveLength(2)
  })

  it('repère un copier-coller raté, et une clé Claude', () => {
    expect(looksLikeApiKey(KEY)).toBe(true)
    expect(looksLikeApiKey(`  ${KEY}\n`)).toBe(true)
    expect(looksLikeApiKey('sk-0123456789abcdefghijklmnop')).toBe(true)
    expect(looksLikeApiKey('sk-proj-court')).toBe(false)
    expect(looksLikeApiKey('ma clé')).toBe(false)
    expect(looksLikeApiKey('sk-ant-api03-test-0123456789abcdefghij')).toBe(false)
    expect(looksLikeClaudeKey(' sk-ant-api03-test-0123456789abcdefghij')).toBe(true)
    expect(looksLikeClaudeKey(KEY)).toBe(false)
  })

  it('propose trois modèles d’OpenAI, du plus précis au moins cher', () => {
    expect(AI_MODEL_OPTIONS.map((option) => option.id)).toEqual([
      'gpt-6.2-astra',
      'gpt-6.2-sol',
      'gpt-6-luna',
    ])
    expect(aiModelOption('gpt-6-luna').label).toBe('GPT-6 Luna')
  })
})

describe('erreurs de l’API OpenAI', () => {
  it('lit le code HTTP et le code de l’erreur', () => {
    const body = (code: string, type = 'invalid_request_error') => ({ error: { code, type, message: 'x' } })
    expect(problemOfStatus(401, body('invalid_api_key'))).toBe('invalidKey')
    expect(problemOfStatus(403, null)).toBe('invalidKey')
    // OpenAI dit « plus de crédit » avec le code 429, comme un excès de demandes.
    expect(problemOfStatus(429, body('insufficient_quota', 'insufficient_quota'))).toBe('noCredit')
    expect(problemOfStatus(429, body('rate_limit_exceeded'))).toBe('busy')
    expect(problemOfStatus(402, null)).toBe('noCredit')
    expect(problemOfStatus(404, body('model_not_found'))).toBe('model')
    expect(problemOfStatus(400, body('model_not_found'))).toBe('model')
    expect(problemOfStatus(500, null)).toBe('busy')
    expect(problemOfStatus(503, null)).toBe('busy')
    expect(problemOfStatus(400, body('image_content_policy_violation'))).toBe('refused')
    expect(problemOfStatus(400, body('invalid_value'))).toBe('failed')
  })

  it('lit le code d’une erreur envoyée au milieu d’une réponse', () => {
    expect(problemOfCode('server_error')).toBe('busy')
    expect(problemOfCode('rate_limit_exceeded')).toBe('busy')
    expect(problemOfCode(null)).toBe('busy')
    expect(problemOfCode('insufficient_quota')).toBe('noCredit')
    expect(problemOfCode('bio_policy')).toBe('refused')
    expect(problemOfCode('invalid_image')).toBe('failed')
  })

  it('distingue une réponse trop lente, une annulation et une absence de réseau', () => {
    expect(aiProblem(new DOMException('x', 'TimeoutError'))).toBe('busy')
    expect(aiProblem(new DOMException('x', 'AbortError'))).toBe('cancelled')
    expect(aiProblem(new TypeError('fetch failed'))).toBe('offline')
    expect(aiProblem(new AiError('model'))).toBe('model')
    expect(aiProblem(new Error('autre chose'))).toBe('failed')
  })

  it('abandonne une demande dont les en-têtes tardent trop', async () => {
    vi.useFakeTimers()
    try {
      const hanging = (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error)
          })
        })
      const pending = callApi({ apiKey: KEY, path: '/models', fetchImpl: hanging }).catch((e: unknown) => e)
      await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS)
      expect(aiProblem(await pending)).toBe('busy')
    } finally {
      vi.useRealTimers()
    }
  })

  it('s’arrête tout de suite quand la demande est déjà annulée', async () => {
    const controller = new AbortController()
    controller.abort()
    const { fetchImpl } = fakeOpenAiFetch(modelsResponse())
    const error = await callApi({ apiKey: KEY, path: '/models', signal: controller.signal, fetchImpl }).catch(
      (e: unknown) => e,
    )
    expect(aiProblem(error)).toBe('cancelled')
  })
})
