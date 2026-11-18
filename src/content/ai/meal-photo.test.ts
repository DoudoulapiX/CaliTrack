import {
  errorResponse,
  fakeOpenAiFetch,
  messageResponse,
  PLATE_ESTIMATE,
  streamResponse,
  usageWith,
} from '@/test/openai'
import { entryFromEstimate } from '@/db/nutrition'
import { foodEntrySchema } from '@/db/schema'
import { cleanItems, estimateMealPhoto, type MealPhotoRequest } from './meal-photo'

const KEY = 'sk-proj-test-0123456789abcdefghij'

/** Les jetons facturés d'une réponse enregistrée (messageResponse). */
const USAGE = { inputTokens: 1850, outputTokens: 420, cacheReadTokens: 0, cacheWriteTokens: 0 }

function request(fetchImpl: typeof fetch, patch: Partial<MealPhotoRequest> = {}): MealPhotoRequest {
  return { apiKey: KEY, model: 'gpt-6.2-astra', imageBase64: 'SU1BR0U=', note: '', fetchImpl, ...patch }
}

describe('photo de repas', () => {
  it('envoie la photo et les précisions, puis lit les aliments estimés', async () => {
    const { fetchImpl, requests } = fakeOpenAiFetch(messageResponse(PLATE_ESTIMATE))
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
      usage: USAGE,
    })
    expect(requests).toHaveLength(1)
    const [sent] = requests
    expect(sent?.url).toBe('https://api.openai.com/v1/responses')
    expect(sent?.headers.get('authorization')).toBe(`Bearer ${KEY}`)
    expect(sent?.body).toMatchObject({
      model: 'gpt-6.2-astra',
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_schema', strict: true } },
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_image', image_url: 'data:image/jpeg;base64,SU1BR0U=', detail: 'auto' },
            { type: 'input_text', text: 'Estime ce repas. Précisions : cuit à l’huile d’olive' },
          ],
        },
      ],
    })
  })

  it('dit quand la photo ne montre pas de repas', async () => {
    const { fetchImpl } = fakeOpenAiFetch(
      messageResponse({ isMeal: false, problem: 'La photo est trop sombre.', items: [] }),
      messageResponse({ isMeal: false, problem: ' ', items: [] }),
      messageResponse({ isMeal: true, problem: '', items: [] }),
    )
    expect(await estimateMealPhoto(request(fetchImpl))).toEqual({
      status: 'notMeal',
      reason: 'La photo est trop sombre.',
      usage: USAGE,
    })
    const fallback = { status: 'notMeal', reason: 'Aucun aliment reconnu sur cette photo.', usage: USAGE }
    expect(await estimateMealPhoto(request(fetchImpl))).toEqual(fallback)
    expect(await estimateMealPhoto(request(fetchImpl))).toEqual(fallback)
  })

  it('reconnaît les erreurs de l’API', async () => {
    const cases: [Response, string][] = [
      [errorResponse(401, 'invalid_api_key'), 'invalidKey'],
      [errorResponse(403, 'unsupported_country_region_territory'), 'invalidKey'],
      [errorResponse(402, 'payment_required'), 'noCredit'],
      [errorResponse(429, 'insufficient_quota'), 'noCredit'],
      [errorResponse(404, 'model_not_found'), 'model'],
      [errorResponse(429, 'rate_limit_exceeded'), 'busy'],
      [errorResponse(503, 'server_error'), 'busy'],
      [errorResponse(400, 'invalid_request_error'), 'failed'],
      [messageResponse(null, 'refusal'), 'refused'],
      [messageResponse(null, 'content_filter'), 'refused'],
      [messageResponse(PLATE_ESTIMATE, 'max_output_tokens'), 'failed'],
      [messageResponse({ réponse: 'pas le bon format' }), 'failed'],
    ]
    for (const [answer, problem] of cases) {
      // Une réponse revenue (code 200) est facturée, même inutilisable ; une erreur de l'API ne l'est pas.
      const usage = answer.status === 200 ? USAGE : null
      const { fetchImpl } = fakeOpenAiFetch(answer)
      expect(await estimateMealPhoto(request(fetchImpl)), problem).toEqual({
        status: 'error',
        problem,
        usage,
      })
    }
  })

  it('signale l’absence de réseau, après un nouvel essai', async () => {
    const { fetchImpl, requests } = fakeOpenAiFetch(
      new TypeError('Load failed'),
      new TypeError('Load failed'),
    )
    expect(await estimateMealPhoto(request(fetchImpl))).toEqual({
      status: 'error',
      problem: 'offline',
      usage: null,
    })
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
    expect(await pending).toEqual({ status: 'error', problem: 'cancelled', usage: null })
  })

  it('demande la réponse en flux, au format JSON strict', async () => {
    const { fetchImpl, requests } = fakeOpenAiFetch(messageResponse(PLATE_ESTIMATE))
    await estimateMealPhoto(request(fetchImpl))
    const body = requests[0]?.body as {
      stream: boolean
      store: boolean
      max_output_tokens: number
      text: { format: object }
    }
    expect(body.stream).toBe(true)
    expect(body.store).toBe(false)
    expect(body.max_output_tokens).toBe(8000)
    expect(Object.keys(body.text.format).sort()).toEqual(['name', 'schema', 'strict', 'type'])
  })

  it('rend les jetons facturés, réflexion comprise', async () => {
    const { fetchImpl } = fakeOpenAiFetch(
      streamResponse(PLATE_ESTIMATE, 'completed', { usage: usageWith({ cached: 300 }) }),
    )
    const result = await estimateMealPhoto(request(fetchImpl))
    expect(result.status).toBe('ok')
    expect(result.usage).toEqual({ ...USAGE, cacheReadTokens: 300 })
  })

  it('dit quand ChatGPT refuse d’analyser la photo, sans le confondre avec un échec', async () => {
    const { fetchImpl } = fakeOpenAiFetch(streamResponse(null, 'refusal'))
    expect(await estimateMealPhoto(request(fetchImpl))).toEqual({
      status: 'error',
      problem: 'refused',
      usage: USAGE,
    })
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

  it('compte une pincée pour 1 g, que le journal accepte', () => {
    const pepper = { name: 'Poivre', grams: 0.3, kcal: 1, protein: 0, carbs: 0.2, fat: 0 }
    const [item] = cleanItems([pepper])
    expect(item).toMatchObject({ name: 'Poivre', grams: 1, nutrients: { kcal: 1, carbs: 0.2 } })
    if (!item) throw new Error('Poivre écarté')
    expect(foodEntrySchema.safeParse(entryFromEstimate(item, '2026-10-21', 'lunch')).success).toBe(true)
  })
})
