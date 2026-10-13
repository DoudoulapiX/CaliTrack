/** Réponses de l'API Claude enregistrées, pour tester sans réseau ni clé. */
import type { AiProblem } from '@/content/ai/client'
import type { CoachData } from '@/content/coach/context'

export interface RecordedRequest {
  url: string
  headers: Headers
  body: unknown
}

/** Une réponse calculée d'après la demande reçue (et son signal d'annulation). */
export type Answer = (request: RecordedRequest, init?: RequestInit) => Response | Error

type StopReason = 'end_turn' | 'refusal' | 'max_tokens'

/** Une réponse de l'API Messages dont le texte est `output` (sortie structurée). */
export function messageResponse(output: unknown, stopReason: StopReason = 'end_turn'): Response {
  const body = {
    id: 'msg_01Test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: stopReason === 'refusal' ? [] : [{ type: 'text', text: JSON.stringify(output) }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1850, output_tokens: 420 },
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

/** Une erreur de l'API (`authentication_error`, `billing_error`…), sans nouvel essai. */
export function errorResponse(status: number, type: string, message = 'Erreur de test'): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message }, request_id: 'req_test' }), {
    status,
    // Pas de nouvel essai : le client réessaie seulement si le serveur ne l'interdit pas.
    headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
  })
}

/* ------------------------------------------------------------------ */
/* Réponses en flux (server-sent events)                               */
/* ------------------------------------------------------------------ */

type StreamEvent = { type: string } & Record<string, unknown>

interface FakeBlock {
  type: string
  text?: string
  thinking?: string
  signature?: string
}

interface FakeMessage {
  content: FakeBlock[]
  stop_reason: string | null
  usage: Record<string, number | null>
}

const SSE_HEADERS = { 'content-type': 'text/event-stream' }

/** Les lignes d'un événement du flux, telles que l'API les envoie. */
function sseOf(event: StreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

/** Un texte coupé en trois morceaux au plus, jamais vides (comme les morceaux d'un vrai flux). */
function pieces(text: string): string[] {
  const size = Math.max(1, Math.ceil(text.length / 3))
  return [0, 1, 2].map((i) => text.slice(i * size, (i + 1) * size)).filter((piece) => piece !== '')
}

function messageStart(usage: Record<string, number | null>): StreamEvent {
  return {
    type: 'message_start',
    message: {
      id: 'msg_01Test',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { ...usage, output_tokens: 1 },
    },
  }
}

/** Les événements qui redonnent `message` une fois mis bout à bout par le SDK. */
function eventsOf(message: FakeMessage): StreamEvent[] {
  const events: StreamEvent[] = [messageStart(message.usage)]
  message.content.forEach((block, index) => {
    if (block.type === 'thinking') {
      events.push(
        {
          type: 'content_block_start',
          index,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        },
        {
          type: 'content_block_delta',
          index,
          delta: { type: 'thinking_delta', thinking: block.thinking ?? '' },
        },
        {
          type: 'content_block_delta',
          index,
          delta: { type: 'signature_delta', signature: block.signature ?? '' },
        },
      )
    } else {
      events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } })
      for (const text of pieces(block.text ?? '')) {
        events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } })
      }
    }
    events.push({ type: 'content_block_stop', index })
  })
  events.push(
    {
      type: 'message_delta',
      delta: { stop_reason: message.stop_reason, stop_sequence: null },
      usage: message.usage,
    },
    { type: 'message_stop' },
  )
  return events
}

/** Le même message, envoyé en flux. */
function sseResponse(message: FakeMessage): Response {
  return new Response(eventsOf(message).map(sseOf).join(''), { status: 200, headers: SSE_HEADERS })
}

/** Les jetons comptés par défaut dans une réponse en flux. */
export const STREAM_USAGE = {
  input_tokens: 1850,
  output_tokens: 420,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

/**
 * Une réponse en flux dont le texte est `output` : un objet (envoyé en JSON) ou un texte brut (discussion,
 * JSON illisible) ; null : aucun texte. Elle commence par défaut par un bloc de réflexion, qui ne doit
 * jamais être lu comme la réponse.
 */
export function streamResponse(
  output: unknown,
  stopReason: StopReason = 'end_turn',
  { thinking = true, usage = {} }: { thinking?: boolean; usage?: Partial<typeof STREAM_USAGE> } = {},
): Response {
  const content: FakeBlock[] = []
  if (thinking) content.push({ type: 'thinking', thinking: 'Je regarde les données.', signature: 'sig_test' })
  if (output !== null) {
    content.push({ type: 'text', text: typeof output === 'string' ? output : JSON.stringify(output) })
  }
  return sseResponse({ content, stop_reason: stopReason, usage: { ...STREAM_USAGE, ...usage } })
}

/** Les erreurs que l'API peut envoyer au milieu d'une réponse en flux. */
export type StreamErrorType = 'overloaded_error' | 'rate_limit_error' | 'api_error'

function errorEvent(type: StreamErrorType): string {
  return `event: error\ndata: ${JSON.stringify({ type: 'error', error: { type, message: 'Erreur de test' } })}\n\n`
}

/** Une réponse qui commence bien (HTTP 200, un peu de texte) puis s'interrompt sur une erreur. */
export function streamErrorResponse(type: StreamErrorType, afterText = 'Je'): Response {
  const events: StreamEvent[] = [
    messageStart(STREAM_USAGE),
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  ]
  if (afterText !== '') {
    events.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: afterText } })
  }
  return new Response(events.map(sseOf).join('') + errorEvent(type), { status: 200, headers: SSE_HEADERS })
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
  let textStarted = false

  const send = (chunk: string) => {
    if (closed) return
    const bytes = encoder.encode(chunk)
    if (sink) sink.enqueue(bytes)
    else waiting.push(bytes)
  }
  const close = () => {
    if (closed) return
    closed = true
    sink?.close()
  }
  const startText = () => {
    if (textStarted) return
    textStarted = true
    send(sseOf({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }))
  }

  send(sseOf(messageStart(STREAM_USAGE)))

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
    push(text: string) {
      startText()
      send(sseOf({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }))
    },
    /** Termine la réponse. */
    finish(stopReason: StopReason = 'end_turn') {
      if (textStarted) send(sseOf({ type: 'content_block_stop', index: 0 }))
      send(
        sseOf({
          type: 'message_delta',
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: STREAM_USAGE,
        }),
      )
      send(sseOf({ type: 'message_stop' }))
      close()
    },
    /** Interrompt la réponse sur une erreur de l'API. */
    fail(type: StreamErrorType) {
      send(errorEvent(type))
      close()
    },
  }
}

/* ------------------------------------------------------------------ */
/* Le fetch simulé                                                     */
/* ------------------------------------------------------------------ */

const streams = (body: unknown) =>
  typeof body === 'object' && body !== null && (body as { stream?: unknown }).stream === true

/** Un message JSON (réponse ordinaire) renvoyé en flux, quand la demande attend un flux. */
async function asStreamed(answer: Response): Promise<Response> {
  if (answer.status !== 200 || !answer.headers.get('content-type')?.includes('application/json'))
    return answer
  const message = (await answer.clone().json()) as Partial<FakeMessage> & { type?: unknown }
  if (message.type !== 'message' || !message.content || !message.usage) return answer
  return sseResponse({
    content: message.content,
    stop_reason: message.stop_reason ?? null,
    usage: message.usage,
  })
}

/**
 * Un `fetch` qui répond dans l'ordre (une erreur = pas de réseau ; une fonction = une réponse calculée
 * d'après la demande) et note chaque requête. Une demande en flux reçoit les messages JSON en flux.
 */
export function fakeAnthropicFetch(...answers: (Response | Error | Answer)[]) {
  const requests: RecordedRequest[] = []
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null
    const request = { url, headers: new Headers(init?.headers), body }
    requests.push(request)
    const next = answers.shift()
    if (next === undefined) throw new Error('Aucune réponse prévue')
    const answer = typeof next === 'function' ? next(request, init) : next
    if (answer instanceof Error) throw answer
    return streams(body) ? await asStreamed(answer) : answer
  }
  return { fetchImpl, requests }
}

/* ------------------------------------------------------------------ */
/* Les erreurs à vérifier pour chaque demande                          */
/* ------------------------------------------------------------------ */

export interface AiErrorCase {
  name: string
  /** Les réponses successives (deux pour l'absence de réseau : le client réessaie une fois). */
  answers: () => (Response | Error)[]
  problem: AiProblem
  /** Vrai pour une réponse qui n'est un problème que pour une sortie structurée (pas pour la discussion). */
  structuredOnly?: boolean
}

/** Toutes les façons dont une demande à Claude peut échouer, et le problème attendu. */
export const AI_ERROR_CASES: readonly AiErrorCase[] = [
  {
    name: 'pas de réseau',
    answers: () => [new TypeError('fetch failed'), new TypeError('fetch failed')],
    problem: 'offline',
  },
  { name: 'clé refusée', answers: () => [errorResponse(401, 'authentication_error')], problem: 'invalidKey' },
  { name: 'clé sans droits', answers: () => [errorResponse(403, 'permission_error')], problem: 'invalidKey' },
  { name: 'plus de crédit', answers: () => [errorResponse(400, 'billing_error')], problem: 'noCredit' },
  { name: 'modèle fermé', answers: () => [errorResponse(404, 'not_found_error')], problem: 'model' },
  { name: 'trop de demandes', answers: () => [errorResponse(429, 'rate_limit_error')], problem: 'busy' },
  { name: 'surcharge', answers: () => [errorResponse(529, 'overloaded_error')], problem: 'busy' },
  {
    name: 'surcharge en cours de réponse',
    answers: () => [streamErrorResponse('overloaded_error')],
    problem: 'busy',
  },
  { name: 'panne en cours de réponse', answers: () => [streamErrorResponse('api_error')], problem: 'busy' },
  { name: 'refus', answers: () => [streamResponse(null, 'refusal')], problem: 'refused' },
  {
    name: 'réponse coupée',
    answers: () => [streamResponse({ réponse: 'coupée' }, 'max_tokens')],
    problem: 'failed',
    structuredOnly: true,
  },
  {
    name: 'JSON illisible',
    answers: () => [streamResponse('{"isMeal": tru')],
    problem: 'failed',
    structuredOnly: true,
  },
  {
    name: 'mauvaise forme',
    answers: () => [streamResponse({ réponse: 'pas le bon format' })],
    problem: 'failed',
    structuredOnly: true,
  },
]

/* ------------------------------------------------------------------ */
/* Réponses enregistrées                                               */
/* ------------------------------------------------------------------ */

/** L'estimation de Claude pour une assiette de poulet, riz et haricots verts. */
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

/** L'analyse physique : Claude conseille une sèche alors que la masse grasse est déjà basse (8 à 11 %). */
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

/** Ce que Claude lit sur une photo de frigo (7 aliments). */
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
