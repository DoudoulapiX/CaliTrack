/**
 * L'API d'OpenAI (ChatGPT), appelée directement depuis le téléphone avec la clé de son propriétaire :
 * l'appli n'a pas de serveur, et la clé ne quitte l'iPhone que pour aller chez OpenAI. Les demandes
 * passent par l'API Responses, en flux : le délai ne porte que sur l'attente des en-têtes, et une longue
 * réflexion ne le dépasse pas.
 */

/** L'adresse de l'API d'OpenAI. */
export const OPENAI_API = 'https://api.openai.com/v1'

/** Ce qui peut empêcher une réponse de ChatGPT. */
export type AiProblem =
  'offline' | 'invalidKey' | 'noCredit' | 'busy' | 'model' | 'refused' | 'cancelled' | 'failed'

/** Un morceau de demande : du texte, ou une photo en JPEG encodée en base64 (sans le préfixe « data: »). */
export type AiContent = { type: 'text'; text: string } | { type: 'image'; jpegBase64: string }

/** Attente maximale des en-têtes de la réponse. */
export const AI_TIMEOUT_MS = 120_000

/** Un problème connu, levé pendant une demande puis rendu par aiProblem(). */
export class AiError extends Error {
  readonly problem: AiProblem

  constructor(problem: AiProblem, message: string = problem) {
    super(message)
    this.name = 'AiError'
    this.problem = problem
  }
}

/** Le corps d'une erreur de l'API : `{ error: { type, code, message } }`. */
interface ErrorBody {
  error?: { type?: string | null; code?: string | null; message?: string | null } | null
}

/** Les erreurs qui disent que le compte n'a plus de crédit (OpenAI les envoie avec le code 429). */
const NO_CREDIT: ReadonlySet<string> = new Set(['insufficient_quota', 'billing_hard_limit_reached'])

/** Les erreurs qui disent qu'OpenAI refuse le contenu envoyé (photo ou texte). */
const REFUSED: ReadonlySet<string> = new Set([
  'image_content_policy_violation',
  'bio_policy',
  'misalignment_policy_violation',
  'content_policy_violation',
  'content_filter',
])

/** Les erreurs passagères envoyées au milieu d'une réponse en flux (surcharge, panne). */
const BUSY: ReadonlySet<string> = new Set(['server_error', 'rate_limit_exceeded', 'overloaded', 'timeout'])

/** Le problème d'une erreur nommée par l'API (au milieu d'un flux, ou dans une réponse échouée). */
export function problemOfCode(code: string | null | undefined): AiProblem {
  if (code === null || code === undefined || code === '' || BUSY.has(code)) return 'busy'
  if (NO_CREDIT.has(code)) return 'noCredit'
  if (REFUSED.has(code)) return 'refused'
  return 'failed'
}

/** Le problème d'une réponse HTTP en erreur (clé refusée, plus de crédit, modèle fermé…). */
export function problemOfStatus(status: number, body: ErrorBody | null): AiProblem {
  const code = body?.error?.code ?? ''
  const type = body?.error?.type ?? ''
  if (NO_CREDIT.has(code) || NO_CREDIT.has(type) || status === 402) return 'noCredit'
  if (status === 401 || status === 403) return 'invalidKey'
  if (status === 404 || code === 'model_not_found') return 'model'
  if (status === 408 || status === 409 || status === 429 || status >= 500) return 'busy'
  if (REFUSED.has(code)) return 'refused'
  return 'failed'
}

/** Le problème correspondant à une erreur levée pendant une demande. */
export function aiProblem(error: unknown): AiProblem {
  if (error instanceof AiError) return error.problem
  // Par le nom : l'erreur d'annulation ne vient pas toujours du même DOMException (fetch, signal, iOS).
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : ''
  if (name === 'TimeoutError') return 'busy'
  if (name === 'AbortError') return 'cancelled'
  // fetch lève une TypeError quand le réseau manque (ou qu'un pare-feu coupe la connexion).
  if (error instanceof TypeError) return 'offline'
  return 'failed'
}

async function errorBody(response: Response): Promise<ErrorBody | null> {
  try {
    return (await response.json()) as ErrorBody
  } catch {
    return null
  }
}

export interface AiCall {
  apiKey: string
  /** Le chemin sous /v1 (« /responses », « /models »). */
  path: string
  /** Le corps envoyé en JSON ; sans corps : une simple lecture (GET). */
  body?: unknown
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

/**
 * Envoie une demande à l'API et rend la réponse si elle a réussi ; sinon lève l'AiError du problème.
 * Une absence de réseau est réessayée une fois. Une annulation par l'utilisateur lève une AbortError,
 * un délai dépassé une TimeoutError (lues par aiProblem).
 */
export async function callApi(call: AiCall): Promise<Response> {
  const fetchImpl = call.fetchImpl ?? globalThis.fetch.bind(globalThis)
  // Un seul signal pour l'annulation et le délai (sans AbortSignal.any, absent des iOS plus anciens). Le
  // délai ne court que jusqu'aux en-têtes : la suite du flux n'est arrêtée que par l'utilisateur.
  const controller = new AbortController()
  const signal = controller.signal
  const cancel = () => {
    controller.abort(call.signal?.reason ?? new DOMException('Aborted', 'AbortError'))
  }
  if (call.signal?.aborted) cancel()
  else call.signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Délai dépassé', 'TimeoutError'))
  }, AI_TIMEOUT_MS)
  try {
    return await send(call, fetchImpl, signal)
  } finally {
    clearTimeout(timer)
  }
}

async function send(call: AiCall, fetchImpl: typeof fetch, signal: AbortSignal): Promise<Response> {
  const init: RequestInit = {
    method: call.body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${call.apiKey}`,
      ...(call.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
    signal,
  }
  // Une annulation ou un délai dépassé l'emportent sur l'erreur de fetch, qui ne dit pas toujours pourquoi.
  const failure = (error: unknown): unknown => (signal.aborted ? signal.reason : error)
  let response: Response
  try {
    response = await fetchImpl(`${OPENAI_API}${call.path}`, init)
  } catch (error) {
    const reason = failure(error)
    if (!(reason instanceof TypeError)) throw reason
    // Un seul nouvel essai, quand le réseau a manqué : une coupure brève ne doit pas faire échouer la photo.
    try {
      response = await fetchImpl(`${OPENAI_API}${call.path}`, init)
    } catch (retryError) {
      throw failure(retryError)
    }
  }
  if (!response.ok) throw new AiError(problemOfStatus(response.status, await errorBody(response)))
  return response
}

/** Vérifie une clé sans rien dépenser : la liste des modèles est gratuite. */
export async function checkApiKey(apiKey: string, fetchImpl?: typeof fetch): Promise<AiProblem | null> {
  try {
    await callApi({ apiKey, path: '/models', fetchImpl })
    return null
  } catch (error) {
    return aiProblem(error)
  }
}

/** Forme d'une clé de l'API OpenAI (« sk-proj-… », « sk-… »), pour repérer un copier-coller raté. */
export function looksLikeApiKey(value: string): boolean {
  const key = value.trim()
  return /^sk-[A-Za-z0-9_-]{20,}$/.test(key) && !key.startsWith('sk-ant-')
}

/** Une clé de l'API Claude d'Anthropic (« sk-ant-… »), collée par erreur à la place d'une clé OpenAI. */
export function looksLikeClaudeKey(value: string): boolean {
  return value.trim().startsWith('sk-ant-')
}
