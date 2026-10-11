import { errorResponse, fakeAnthropicFetch, messageResponse, PLATE_ESTIMATE } from '@/test/anthropic'
import { cleanItems, estimateMealPhoto, type MealPhotoRequest } from './meal-photo'

const KEY = 'sk-ant-api03-test-0123456789abcdefghij'

function request(fetchImpl: typeof fetch, patch: Partial<MealPhotoRequest> = {}): MealPhotoRequest {
  return { apiKey: KEY, model: 'claude-sonnet-5-5', imageBase64: 'SU1BR0U=', note: '', fetchImpl, ...patch }
}

describe('photo de repas', () => {
  it('envoie la photo et les précisions, puis lit les aliments estimés', async () => {
    const { fetchImpl, requests } = fakeAnthropicFetch(messageResponse(PLATE_ESTIMATE))
    const result = await estimateMealPhoto(request(fetchImpl, { note: '  cuit à l’huile d’olive ' }))

    expect(result).toEqual({
      status: 'ok',
      items: [
        {
          name: 'Blanc de poulet grillé',
          grams: 150,
          nutrients: {
            kcal: 248,
            protein: 46.5,
            carbs: 0,
            fat: 5.4,
            fiber: null,
            sugars: null,
            satFat: null,
            salt: null,
          },
        },
        expect.objectContaining({ name: 'Riz blanc cuit', grams: 180 }),
        expect.objectContaining({ name: 'Haricots verts', grams: 100 }),
      ],
    })
    expect(requests).toHaveLength(1)
    const [sent] = requests
    expect(sent?.url).toBe('https://api.anthropic.com/v1/messages')
    expect(sent?.headers.get('x-api-key')).toBe(KEY)
    expect(sent?.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true')
    expect(sent?.body).toMatchObject({
      model: 'claude-sonnet-5-5',
      output_config: { effort: 'low', format: { type: 'json_schema' } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'SU1BR0U=' } },
            { type: 'text', text: 'Estime ce repas. Précisions : cuit à l’huile d’olive' },
          ],
        },
      ],
    })
  })

  it('dit quand la photo ne montre pas de repas', async () => {
    const { fetchImpl } = fakeAnthropicFetch(
      messageResponse({ isMeal: false, problem: 'La photo est trop sombre.', items: [] }),
      messageResponse({ isMeal: false, problem: ' ', items: [] }),
      messageResponse({ isMeal: true, problem: '', items: [] }),
    )
    expect(await estimateMealPhoto(request(fetchImpl))).toEqual({
      status: 'notMeal',
      reason: 'La photo est trop sombre.',
    })
    const fallback = { status: 'notMeal', reason: 'Aucun aliment reconnu sur cette photo.' }
    expect(await estimateMealPhoto(request(fetchImpl))).toEqual(fallback)
    expect(await estimateMealPhoto(request(fetchImpl))).toEqual(fallback)
  })

  it('reconnaît les erreurs de l’API', async () => {
    const cases: [Response, string][] = [
      [errorResponse(401, 'authentication_error'), 'invalidKey'],
      [errorResponse(403, 'permission_error'), 'invalidKey'],
      [errorResponse(402, 'billing_error'), 'noCredit'],
      [errorResponse(400, 'billing_error'), 'noCredit'],
      [errorResponse(404, 'not_found_error'), 'model'],
      [errorResponse(429, 'rate_limit_error'), 'busy'],
      [errorResponse(529, 'overloaded_error'), 'busy'],
      [errorResponse(400, 'invalid_request_error'), 'failed'],
      [messageResponse(null, 'refusal'), 'refused'],
      [messageResponse(PLATE_ESTIMATE, 'max_tokens'), 'failed'],
      [messageResponse({ réponse: 'pas le bon format' }), 'failed'],
    ]
    for (const [answer, problem] of cases) {
      const { fetchImpl } = fakeAnthropicFetch(answer)
      expect(await estimateMealPhoto(request(fetchImpl)), problem).toEqual({ status: 'error', problem })
    }
  })

  it('signale l’absence de réseau, après un nouvel essai', async () => {
    const { fetchImpl, requests } = fakeAnthropicFetch(
      new TypeError('Load failed'),
      new TypeError('Load failed'),
    )
    expect(await estimateMealPhoto(request(fetchImpl))).toEqual({ status: 'error', problem: 'offline' })
    expect(requests).toHaveLength(2)
  })

  it('s’arrête quand on annule', async () => {
    const controller = new AbortController()
    const fetchImpl = ((_input: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Annulé', 'AbortError'))
        })
      })) as typeof fetch
    const pending = estimateMealPhoto(request(fetchImpl, { signal: controller.signal }))
    controller.abort()
    expect(await pending).toEqual({ status: 'error', problem: 'cancelled' })
  })

  it('écarte les estimations aberrantes et arrondit les valeurs', () => {
    const item = { name: 'Pâtes', grams: 250.4, kcal: 330.6, protein: 11.04, carbs: 66.66, fat: 1.98 }
    expect(
      cleanItems([
        item,
        { ...item, name: '  ' },
        { ...item, grams: 0 },
        { ...item, grams: 5000 },
        { ...item, name: 'Sauce', grams: 30, kcal: -5, protein: Number.NaN },
      ]),
    ).toEqual([
      {
        name: 'Pâtes',
        grams: 250,
        nutrients: {
          kcal: 331,
          protein: 11,
          carbs: 66.7,
          fat: 2,
          fiber: null,
          sugars: null,
          satFat: null,
          salt: null,
        },
      },
      {
        name: 'Sauce',
        grams: 30,
        nutrients: {
          kcal: 0,
          protein: 0,
          carbs: 66.7,
          fat: 2,
          fiber: null,
          sugars: null,
          satFat: null,
          salt: null,
        },
      },
    ])
    expect(cleanItems(Array.from({ length: 30 }, () => item))).toHaveLength(20)
  })
})
