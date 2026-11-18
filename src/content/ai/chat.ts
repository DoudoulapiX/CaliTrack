import { aiProblem, type AiProblem } from './client'
import { finalProblem, outputOf, streamResponses, usageOf } from './responses'
import type { AiUsage } from './structured'

/** La réponse complète du coach, ou le problème qui l'a empêchée (avec les jetons facturés s'il y en a). */
export type ChatResult =
  { ok: true; text: string; usage: AiUsage } | { ok: false; problem: AiProblem; usage: AiUsage | null }

export interface ChatRequest {
  apiKey: string
  model: string
  /** Les consignes et les données du coach (texte simple, sans espace insécable). */
  system: string
  /** La conversation, en texte seulement, de la plus ancienne à la plus récente question. */
  messages: { role: 'user' | 'assistant'; content: string }[]
  /** Appelée à chaque morceau de texte reçu, pour l'afficher au fil de l'eau. */
  onText: (delta: string) => void
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

/** Jetons de sortie permis pour une réponse du coach, réflexion comprise. */
export const CHAT_MAX_TOKENS = 8000

/**
 * Pose une question au coach et reçoit sa réponse au fil de l'eau. Le début de la demande (consignes et
 * données, identiques d'une question à l'autre) est mis en cache par OpenAI, moins cher à relire. Une
 * réponse vide n'est jamais gardée ; une réponse coupée par la limite de longueur l'est, si elle a du texte.
 */
export async function streamChat(request: ChatRequest): Promise<ChatResult> {
  try {
    const response = await streamResponses({
      apiKey: request.apiKey,
      body: {
        model: request.model,
        instructions: request.system,
        input: request.messages,
        max_output_tokens: CHAT_MAX_TOKENS,
        reasoning: { effort: 'medium' },
        store: false,
      },
      onText: request.onText,
      signal: request.signal,
      fetchImpl: request.fetchImpl,
    })
    const usage = usageOf(response.usage)
    const problem = finalProblem(response)
    const { text, refused } = outputOf(response)
    if (problem !== null && problem !== 'incomplete') return { ok: false, problem, usage }
    if (refused) return { ok: false, problem: 'refused', usage }
    const answer = text.trim()
    if (answer === '' || usage === null) return { ok: false, problem: 'failed', usage }
    return { ok: true, text: answer, usage }
  } catch (error) {
    return { ok: false, problem: aiProblem(error), usage: null }
  }
}
