/** Réponses de l'API d'OpenAI (Responses) enregistrées, pour tester sans réseau ni clé. */
import type { AiProblem } from '@/content/ai/client'
import type { CoachData } from '@/content/coach/context'

export interface RecordedRequest {
  url: string
  headers: Headers
  body: unknown
}

/** Une réponse calculée d'après la demande reçue (et son signal d'annulation). */
export type Answer = (request: RecordedRequest, init?: RequestInit) => Response | Error

/**
 * Comment se termine une réponse : terminée, refusée (bloc de refus), coupée par la limite de longueur
 * ou arrêtée par le filtre de contenu (réponses incomplètes).
 */
export type Finish = 'completed' | 'refusal' | 'max_output_tokens' | 'content_filter'

/** Les jetons comptés par défaut dans une réponse (sans cache). */
export const STREAM_USAGE = {
  input_tokens: 1850,
  output_tokens: 420,
  input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
  output_tokens_details: { reasoning_tokens: 120 },
  total_tokens: 2270,
}

export type FakeUsage = typeof STREAM_USAGE

/** Les jetons comptés, avec ceux lus dans le cache et ceux qui y sont écrits (compris dans l'entrée). */
export function usageWith({
  cached = 0,
  written = 0,
  input = 1850,
  output = 420,
}: { cached?: number; written?: number; input?: number; output?: number } = {}): FakeUsage {
  return {
    input_tokens: input + cached + written,
    output_tokens: output,
    input_tokens_details: { cached_tokens: cached, cache_write_tokens: written },
    output_tokens_details: { reasoning_tokens: 120 },
    total_tokens: input + cached + written + output,
  }
}

interface FakeItem {
  id: string
  type: string
  status?: string
  role?: string
  summary?: unknown[]
  content?: { type: string; text?: string; refusal?: string; annotations?: unknown[] }[]
}

interface FakeResponse {
  id: string
  object: 'response'
  created_at: number
  model: string
  status: string
  output: FakeItem[]
  usage: FakeUsage | null
  incomplete_details: { reason: string } | null
  error: { code: string; message: string } | null
}

const SSE_HEADERS = { 'content-type': 'text/event-stream' }
const JSON_HEADERS = { 'content-type': 'application/json' }

type StreamEvent = { type: string } & Record<string, unknown>

/** Les lignes d'un événement du flux, telles que l'API les envoie. */
function sseOf(event: StreamEvent, sequence: number): string {
  return `event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number: sequence })}\n\n`
}

/** Un texte coupé en trois morceaux au plus, jamais vides (comme les morceaux d'un vrai flux). */
function pieces(text: string): string[] {
  const size = Math.max(1, Math.ceil(text.length / 3))
  return [0, 1, 2].map((i) => text.slice(i * size, (i + 1) * size)).filter((piece) => piece !== '')
}

const REASONING: FakeItem = { id: 'rs_test', type: 'reasoning', summary: [] }

function messageItem(content: FakeItem['content']): FakeItem {
  return { id: 'msg_test', type: 'message', status: 'completed', role: 'assistant', content }
}

/** La réponse finale de l'API, dont le texte est `text` (null : aucun texte). */
function fakeResponse(
  text: string | null,
  finish: Finish,
  { reasoning = true, usage = STREAM_USAGE }: { reasoning?: boolean; usage?: FakeUsage } = {},
): FakeResponse {
  const output: FakeItem[] = reasoning ? [REASONING] : []
  if (finish === 'refusal') {
    output.push(messageItem([{ type: 'refusal', refusal: 'Je ne peux pas aider avec cette demande.' }]))
  } else if (text !== null) {
    output.push(messageItem([{ type: 'output_text', text, annotations: [] }]))
  }
  const incomplete = finish === 'max_output_tokens' || finish === 'content_filter'
  return {
    id: 'resp_test',
    object: 'response',
    created_at: 1_792_000_000,
    model: 'gpt-6.2-sol',
    status: incomplete ? 'incomplete' : 'completed',
    output,
    usage,
    incomplete_details: incomplete ? { reason: finish } : null,
    error: null,
  }
}

const textOf = (output: unknown): string | null =>
  output === null ? null : typeof output === 'string' ? output : JSON.stringify(output)

/** Une réponse JSON de l'API (demande sans flux) dont le texte est `output` (sortie structurée). */
export function messageResponse(output: unknown, finish: Finish = 'completed'): Response {
  return new Response(JSON.stringify(fakeResponse(textOf(output), finish)), {
    status: 200,
    headers: JSON_HEADERS,
  })
}

/** Une erreur de l'API (`invalid_api_key`, `insufficient_quota`…), avec son code HTTP. */
export function errorResponse(status: number, code: string, message = 'Erreur de test'): Response {
  const type = code === 'insufficient_quota' ? 'insufficient_quota' : 'invalid_request_error'
  return new Response(JSON.stringify({ error: { message, type, param: null, code } }), {
    status,
    headers: JSON_HEADERS,
  })
}

/* ------------------------------------------------------------------ */
/* Réponses en flux (server-sent events)                               */
/* ------------------------------------------------------------------ */

const inProgress = (response: FakeResponse) => ({
  ...response,
  status: 'in_progress',
  output: [],
  usage: null,
  incomplete_details: null,
})

/** Les événements qui redonnent `response` une fois mis bout à bout. */
function eventsOf(response: FakeResponse): StreamEvent[] {
  const events: StreamEvent[] = [
    { type: 'response.created', response: inProgress(response) },
    { type: 'response.in_progress', response: inProgress(response) },
  ]
  response.output.forEach((item, outputIndex) => {
    events.push({
      type: 'response.output_item.added',
      output_index: outputIndex,
      item: { ...item, status: 'in_progress', ...(item.content ? { content: [] } : {}) },
    })
    item.content?.forEach((part, contentIndex) => {
      const where = { item_id: item.id, output_index: outputIndex, content_index: contentIndex }
      events.push({ type: 'response.content_part.added', ...where, part: { ...part, text: '' } })
      if (part.type === 'output_text') {
        for (const delta of pieces(part.text ?? '')) {
          events.push({ type: 'response.output_text.delta', ...where, delta, logprobs: [] })
        }
        events.push({ type: 'response.output_text.done', ...where, text: part.text ?? '', logprobs: [] })
      } else {
        events.push({ type: 'response.refusal.delta', ...where, delta: part.refusal ?? '' })
        events.push({ type: 'response.refusal.done', ...where, refusal: part.refusal ?? '' })
      }
      events.push({ type: 'response.content_part.done', ...where, part })
    })
    events.push({ type: 'response.output_item.done', output_index: outputIndex, item })
  })
  events.push({
    type: response.status === 'incomplete' ? 'response.incomplete' : 'response.completed',
    response,
  })
  return events
}

/** La même réponse, envoyée en flux. */
function sseResponse(response: FakeResponse): Response {
  const body = eventsOf(response)
    .map((event, sequence) => sseOf(event, sequence))
    .join('')
  return new Response(body, { status: 200, headers: SSE_HEADERS })
}

/**
 * Une réponse en flux dont le texte est `output` : un objet (envoyé en JSON) ou un texte brut (discussion,
 * JSON illisible) ; null : aucun texte. Elle commence par défaut par un élément de réflexion, qui ne doit
 * jamais être lu comme la réponse.
 */
export function streamResponse(
  output: unknown,
  finish: Finish = 'completed',
  options: { reasoning?: boolean; usage?: FakeUsage } = {},
): Response {
  return sseResponse(fakeResponse(textOf(output), finish, options))
}

/** Une réponse en flux qui échoue côté OpenAI (événement response.failed, sans jetons comptés). */
export function failedResponse(code = 'server_error'): Response {
  const response: FakeResponse = {
    ...fakeResponse(null, 'completed', { reasoning: false }),
    status: 'failed',
    usage: null,
    error: { code, message: 'Erreur de test' },
  }
  const events: StreamEvent[] = [
    { type: 'response.created', response: inProgress(response) },
    { type: 'response.failed', response },
  ]
  return new Response(events.map((event, sequence) => sseOf(event, sequence)).join(''), {
    status: 200,
    headers: SSE_HEADERS,
  })
}

function errorEvent(code: string): StreamEvent {
  return { type: 'error', code, message: 'Erreur de test', param: null }
}

/** Une réponse qui commence bien (HTTP 200, un peu de texte) puis s'interrompt sur une erreur. */
export function streamErrorResponse(code = 'server_error', afterText = 'Je'): Response {
  const response = fakeResponse(null, 'completed', { reasoning: false })
  const where = { item_id: 'msg_test', output_index: 0, content_index: 0 }
  const events: StreamEvent[] = [
    { type: 'response.created', response: inProgress(response) },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { ...messageItem([]), status: 'in_progress' },
    },
  ]
  if (afterText !== '') {
    events.push({ type: 'response.output_text.delta', ...where, delta: afterText, logprobs: [] })
  }
  events.push(errorEvent(code))
  return new Response(events.map((event, sequence) => sseOf(event, sequence)).join(''), {
    status: 200,
    headers: SSE_HEADERS,
  })
}

/**
 * Une réponse en flux pilotée pas à pas par le test : chaque push() envoie un morceau de texte, finish()
 * termine la réponse, fail() l'interrompt sur une erreur. Ce qui est envoyé avant la demande est gardé
 * pour elle. Le flux s'arrête sur une erreur AbortError quand la demande est annulée.
 */
export function streamController() {
  const encoder = new TextEncoder()
  const waiting: Uint8Array[] = []
  let sink: ReadableStreamDefaultController<Uint8Array> | null = null
  let closed = false
  let sequence = 0
  let text = ''
  const base = fakeResponse(null, 'completed', { reasoning: false })
  const where = { item_id: 'msg_test', output_index: 0, content_index: 0 }

  const send = (event: StreamEvent) => {
    if (closed) return
    const bytes = encoder.encode(sseOf(event, sequence++))
    if (sink) sink.enqueue(bytes)
    else waiting.push(bytes)
  }
  const close = () => {
    if (closed) return
    closed = true
    sink?.close()
  }

  send({ type: 'response.created', response: inProgress(base) })
  send({
    type: 'response.output_item.added',
    output_index: 0,
    item: { ...messageItem([]), status: 'in_progress' },
  })

  const answer: Answer = (_request, init) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const bytes of waiting) controller.enqueue(bytes)
        waiting.length = 0
        if (closed) {
          controller.close()
          return
        }
        sink = controller
        init?.signal?.addEventListener('abort', () => {
          if (closed) return
          closed = true
          controller.error(new DOMException('Aborted', 'AbortError'))
        })
      },
    })
    return new Response(body, { status: 200, headers: SSE_HEADERS })
  }

  return {
    answer,
    /** Envoie un morceau de texte de la réponse. */
    push(delta: string) {
      text += delta
      send({ type: 'response.output_text.delta', ...where, delta, logprobs: [] })
    },
    /** Termine la réponse. */
    finish(finish: Finish = 'completed') {
      const response = fakeResponse(text, finish, { reasoning: false })
      send({ type: 'response.output_text.done', ...where, text, logprobs: [] })
      send({ type: 'response.output_item.done', output_index: 0, item: response.output[0] })
      send({
        type: response.status === 'incomplete' ? 'response.incomplete' : 'response.completed',
        response,
      })
      close()
    },
    /** Interrompt la réponse sur une erreur de l'API. */
    fail(code = 'server_error') {
      send(errorEvent(code))
      close()
    },
  }
}

/* ------------------------------------------------------------------ */
/* Le fetch simulé                                                     */
/* ------------------------------------------------------------------ */

const streams = (body: unknown) =>
  typeof body === 'object' && body !== null && (body as { stream?: unknown }).stream === true

/** Une réponse JSON (demande ordinaire) renvoyée en flux, quand la demande attend un flux. */
async function asStreamed(answer: Response): Promise<Response> {
  if (answer.status !== 200 || !answer.headers.get('content-type')?.includes('application/json'))
    return answer
  const response = (await answer.clone().json()) as Partial<FakeResponse>
  if (response.object !== 'response' || !Array.isArray(response.output)) return answer
  return sseResponse(response as FakeResponse)
}

/**
 * Un `fetch` qui répond dans l'ordre (une erreur = pas de réseau ; une fonction = une réponse calculée
 * d'après la demande) et note chaque requête. Une demande en flux reçoit les réponses JSON en flux.
 */
export function fakeOpenAiFetch(...answers: (Response | Error | Answer)[]) {
  const requests: RecordedRequest[] = []
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null
    const request = { url, headers: new Headers(init?.headers), body }
    requests.push(request)
    if (init?.signal?.aborted) throw init.signal.reason
    const next = answers.shift()
    if (next === undefined) throw new Error('Aucune réponse prévue')
    const answer = typeof next === 'function' ? next(request, init) : next
    if (answer instanceof Error) throw answer
    return streams(body) ? await asStreamed(answer) : answer
  }
  return { fetchImpl, requests }
}

/** La liste des modèles (réponse de la vérification d'une clé). */
export function modelsResponse(): Response {
  return new Response(JSON.stringify({ object: 'list', data: [] }), { status: 200, headers: JSON_HEADERS })
}

/* ------------------------------------------------------------------ */
/* Les erreurs à vérifier pour chaque demande                          */
/* ------------------------------------------------------------------ */

export interface AiErrorCase {
  name: string
  /** Les réponses successives (deux pour l'absence de réseau : la demande est réessayée une fois). */
  answers: () => (Response | Error)[]
  problem: AiProblem
  /** Vrai pour une réponse facturée (des jetons comptés), même inutilisable. */
  billed?: boolean
  /** Vrai pour une réponse qui n'est un problème que pour une sortie structurée (pas pour la discussion). */
  structuredOnly?: boolean
}

/** Toutes les façons dont une demande à ChatGPT peut échouer, et le problème attendu. */
export const AI_ERROR_CASES: readonly AiErrorCase[] = [
  {
    name: 'pas de réseau',
    answers: () => [new TypeError('fetch failed'), new TypeError('fetch failed')],
    problem: 'offline',
  },
  { name: 'clé refusée', answers: () => [errorResponse(401, 'invalid_api_key')], problem: 'invalidKey' },
  {
    name: 'clé sans droits',
    answers: () => [errorResponse(403, 'unsupported_country_region_territory')],
    problem: 'invalidKey',
  },
  { name: 'plus de crédit', answers: () => [errorResponse(429, 'insufficient_quota')], problem: 'noCredit' },
  { name: 'modèle fermé', answers: () => [errorResponse(404, 'model_not_found')], problem: 'model' },
  { name: 'trop de demandes', answers: () => [errorResponse(429, 'rate_limit_exceeded')], problem: 'busy' },
  { name: 'surcharge', answers: () => [errorResponse(503, 'server_error')], problem: 'busy' },
  {
    name: 'surcharge en cours de réponse',
    answers: () => [streamErrorResponse('rate_limit_exceeded')],
    problem: 'busy',
  },
  {
    name: 'panne en cours de réponse',
    answers: () => [streamErrorResponse('server_error')],
    problem: 'busy',
  },
  { name: 'réponse échouée', answers: () => [failedResponse('server_error')], problem: 'busy' },
  { name: 'refus', answers: () => [streamResponse(null, 'refusal')], problem: 'refused', billed: true },
  {
    name: 'contenu filtré',
    answers: () => [streamResponse(null, 'content_filter')],
    problem: 'refused',
    billed: true,
  },
  {
    name: 'réponse coupée',
    answers: () => [streamResponse({ réponse: 'coupée' }, 'max_output_tokens')],
    problem: 'failed',
    billed: true,
    structuredOnly: true,
  },
  {
    name: 'JSON illisible',
    answers: () => [streamResponse('{"isMeal": tru')],
    problem: 'failed',
    billed: true,
    structuredOnly: true,
  },
  {
    name: 'mauvaise forme',
    answers: () => [streamResponse({ réponse: 'pas le bon format' })],
    problem: 'failed',
    billed: true,
    structuredOnly: true,
  },
]

/* ------------------------------------------------------------------ */
/* Réponses enregistrées                                               */
/* ------------------------------------------------------------------ */

/** L’estimation de ChatGPT pour une assiette de poulet, riz et haricots verts. */
export const PLATE_ESTIMATE = {
  isMeal: true,
  problem: '',
  items: [
    { name: 'Blanc de poulet grillé', grams: 150, kcal: 248, protein: 46.5, carbs: 0, fat: 5.4 },
    { name: 'Riz blanc cuit', grams: 180, kcal: 234, protein: 4.9, carbs: 51.8, fat: 0.5 },
    { name: 'Haricots verts', grams: 100, kcal: 31, protein: 1.8, carbs: 4.2, fat: 0.2 },
  ],
}

/** Le coach allège la séance : une série de tractions en moins (créneau slot-1). */
export const DAILY_LIGHTER = {
  decision: 'lighter',
  headline: 'Séance allégée',
  summary: 'Ta nuit a été courte : garde la séance, avec un peu moins de volume.',
  tips: ['Allonge l’échauffement de cinq minutes.', 'Couche-toi tôt ce soir.'],
  changes: [
    {
      slotId: 'slot-1',
      action: 'lighter',
      exerciseId: 'pull-up',
      sets: 3,
      loadKg: null,
      reason: 'Nuit courte : une série de moins.',
    },
  ],
}

/** Le coach conseille le repos. */
export const DAILY_REST = {
  decision: 'rest',
  headline: 'Repos conseillé',
  summary: 'Tes courbatures sont fortes : une journée de repos te fera progresser plus vite.',
  tips: ['Marche vingt minutes pour récupérer.'],
  changes: [],
}

/** Les conseils du coach un jour sans séance. */
export const DAILY_TIPS = {
  decision: '',
  headline: 'Conseils du jour',
  summary: 'Pas de séance aujourd’hui : profites-en pour bien manger et bien dormir.',
  tips: ['Vise tes protéines du jour.', 'Étire tes avant-bras après l’escalade.'],
  changes: [],
}

/** L'analyse physique : ChatGPT conseille une sèche alors que la masse grasse est déjà basse (8 à 11 %). */
export const BODY_CUT_LEAN = {
  readable: true,
  problem: '',
  phase: 'cut',
  bodyFatLow: 8,
  bodyFatHigh: 11,
  summary: 'Silhouette sèche et musclée.',
  observations: ['Abdominaux bien visibles.', 'Épaules et dos développés.'],
  advice: ['Garde tes protéines hautes.'],
}

/** Ce que ChatGPT lit sur une photo de frigo (7 aliments). */
export const FRIDGE_ITEMS = {
  readable: true,
  problem: '',
  items: [
    { name: 'Œufs', quantity: '6' },
    { name: 'Lait demi-écrémé', quantity: '1 L' },
    { name: 'Yaourts nature', quantity: '4' },
    { name: 'Tomates', quantity: '3' },
    { name: 'Courgette', quantity: '1' },
    { name: 'Emmental râpé', quantity: '1 sachet' },
    { name: 'Blanc de poulet', quantity: '2 filets' },
  ],
}

/** Les idées de repas du coach (une recette avec ce qu'il y a dans le frigo, une autre avec un achat). */
export const IDEAS = {
  ideas: [
    {
      title: 'Omelette aux courgettes',
      why: 'Riche en protéines, prête en un quart d’heure.',
      minutes: 15,
      steps: ['Coupe la courgette en dés.', 'Fais-la revenir, puis ajoute les œufs battus.'],
      items: [
        { name: 'Œufs', grams: 180, kcal: 257, protein: 22.6, carbs: 1.3, fat: 17.8, fromPantry: true },
        { name: 'Courgette', grams: 200, kcal: 34, protein: 2.4, carbs: 6.2, fat: 0.6, fromPantry: true },
      ],
    },
    {
      title: 'Poulet, riz et tomates',
      why: 'Des glucides pour récupérer de ta séance.',
      minutes: 25,
      steps: ['Fais cuire le riz.', 'Saisis le poulet, puis ajoute les tomates.'],
      items: [
        {
          name: 'Blanc de poulet',
          grams: 150,
          kcal: 248,
          protein: 46.5,
          carbs: 0,
          fat: 5.4,
          fromPantry: true,
        },
        {
          name: 'Riz blanc cuit',
          grams: 180,
          kcal: 234,
          protein: 4.9,
          carbs: 51.8,
          fat: 0.5,
          fromPantry: false,
        },
        { name: 'Tomates', grams: 150, kcal: 27, protein: 1.2, carbs: 4.2, fat: 0.3, fromPantry: true },
      ],
    },
  ],
}

/** Une réponse du coach dans la discussion. */
export const CHAT_ANSWER =
  'Pour progresser sur les tractions, garde trois séances par semaine et ajoute une série tous les quinze jours.'

/* ------------------------------------------------------------------ */
/* Données du coach                                                    */
/* ------------------------------------------------------------------ */

/**
 * Ce que le coach sait le mercredi 21 octobre 2026 : un homme de 30 ans en sèche, la séance B du programme
 * prévue ce jour-là, une bonne nuit, des œufs au frigo. Les lignes d'exercices gardent leurs espaces
 * insécables, comme celles de formatPrescription().
 */
export function coachData(patch: Partial<CoachData> = {}): CoachData {
  return {
    date: '2026-10-21',
    profile: {
      sex: 'male',
      age: 30,
      heightCm: 180,
      weightKg: 80,
      experience: 'intermediate',
      focuses: ['strength', 'climbing'],
      targetSkills: ['frontLever'],
      sessionsPerWeek: 3,
      sessionMinutes: 60,
      trainingDays: [1, 3, 4],
      climbingDays: [6],
    },
    program: {
      name: 'Force',
      week: 2,
      deload: false,
      sessions: [
        {
          name: 'Séance A',
          exercises: ['Tractions\u00a0: 4\u00a0×\u00a05 à 8\u00a0rép.', 'Pompes\u00a0: 3\u00a0×\u00a012'],
        },
        { name: 'Séance B', exercises: ['Dips\u00a0: 3\u00a0×\u00a08 à 12\u00a0rép.'] },
      ],
    },
    agenda: [
      { date: '2026-10-21', label: 'Séance B', status: 'planned' },
      { date: '2026-10-22', label: 'Séance A', status: 'planned' },
      { date: '2026-10-24', label: 'Escalade', status: 'planned' },
    ],
    workouts: [
      {
        date: '2026-10-19',
        title: 'Séance A',
        rpe: 7,
        exercises: ['Tractions\u00a0: 8, 7, 6, 6', 'Pompes\u00a0: 15, 14, 12'],
      },
    ],
    climbing: [{ date: '2026-10-17', summary: '1\u00a0h\u00a030 à Vertical’Art, 12 blocs dont 3 flashs' }],
    oura: [
      {
        date: '2026-10-20',
        readinessScore: 75,
        sleepScore: 70,
        sleepMin: 395,
        hrvMs: 41,
        totalKcal: 2650,
        activeKcal: 540,
        steps: 9100,
      },
      {
        date: '2026-10-21',
        readinessScore: 82,
        sleepScore: 78,
        sleepMin: 430,
        hrvMs: 45.6,
        totalKcal: null,
        activeKcal: null,
        steps: null,
      },
    ],
    weights: [
      { date: '2026-10-14', kg: 80.4 },
      { date: '2026-10-21', kg: 80 },
    ],
    nutrition: {
      phase: 'cut',
      targets: { kcal: 2210, proteinG: 175, carbsG: 245, fatG: 60 },
      today: {
        kcal: 650,
        protein: 45.2,
        carbs: 70,
        fat: 18,
        fiber: null,
        sugars: null,
        satFat: null,
        salt: null,
      },
      last7Avg: {
        kcal: 2150.4,
        protein: 160,
        carbs: 230,
        fat: 62,
        fiber: null,
        sugars: null,
        satFat: null,
        salt: null,
      },
    },
    bodyReview: { date: '2026-10-14', phase: 'cut', bodyFat: { low: 15, high: 19 } },
    pantry: [
      { place: 'cupboard', name: 'Riz', quantity: '1 kg' },
      { place: 'fridge', name: 'Œufs', quantity: '6' },
    ],
    ...patch,
  }
}
