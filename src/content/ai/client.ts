import Anthropic from '@anthropic-ai/sdk'

/** Ce qui peut empêcher une réponse de Claude. */
export type AiProblem =
  'offline' | 'invalidKey' | 'noCredit' | 'busy' | 'model' | 'refused' | 'cancelled' | 'failed'

/**
 * Le client de l'API Claude, appelé directement depuis le téléphone avec la clé de son propriétaire :
 * l'appli n'a pas de serveur, et la clé ne quitte l'iPhone que pour aller chez Anthropic.
 */
export function aiClient(apiKey: string, fetchImpl?: typeof fetch): Anthropic {
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    timeout: 120_000,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  })
}

/**
 * Les erreurs envoyées au milieu d'une réponse en flux (« event: error ») : elles n'ont pas de code HTTP,
 * seulement un type. Celles-ci disent que Claude est surchargé, comme un code 429 ou 529.
 */
const MID_STREAM_BUSY: ReadonlySet<string> = new Set(['overloaded_error', 'rate_limit_error', 'api_error'])

/** Le problème correspondant à une erreur de l'API (pas de réseau, clé refusée, plus de crédit…). */
export function aiProblem(error: unknown): AiProblem {
  if (error instanceof Anthropic.APIUserAbortError) return 'cancelled'
  // Avant APIConnectionError, dont elle hérite : une réponse trop lente n'est pas une absence de réseau.
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'busy'
  if (error instanceof Anthropic.APIConnectionError) return 'offline'
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return 'invalidKey'
  }
  if (error instanceof Anthropic.APIError && (error.status === 402 || error.type === 'billing_error')) {
    return 'noCredit'
  }
  if (error instanceof Anthropic.NotFoundError) return 'model'
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError)
    return 'busy'
  if (
    error instanceof Anthropic.APIError &&
    error.status === undefined &&
    MID_STREAM_BUSY.has(error.type ?? '')
  ) {
    return 'busy'
  }
  return 'failed'
}

/** Vérifie une clé sans rien dépenser : la liste des modèles est gratuite. */
export async function checkApiKey(apiKey: string, fetchImpl?: typeof fetch): Promise<AiProblem | null> {
  try {
    await aiClient(apiKey, fetchImpl).models.list({ limit: 1 })
    return null
  } catch (error) {
    return aiProblem(error)
  }
}

/** Forme d'une clé de l'API Claude (« sk-ant-… »), pour repérer un copier-coller raté. */
export function looksLikeApiKey(value: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(value.trim())
}
