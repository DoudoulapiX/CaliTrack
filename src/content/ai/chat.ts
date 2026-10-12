import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages'
import { aiClient, aiProblem, type AiProblem } from './client'
import { usageOf, type AiUsage } from './structured'

/** La réponse complète du coach, ou le problème qui l'a empêchée (avec les jetons facturés s'il y en a). */
export type ChatResult =
  { ok: true; text: string; usage: AiUsage } | { ok: false; problem: AiProblem; usage: AiUsage | null }

export interface ChatRequest {
  apiKey: string
  model: string
  system: TextBlockParam[]
  /** La conversation, en texte seulement, de la plus ancienne à la plus récente question. */
  messages: { role: 'user' | 'assistant'; content: string }[]
  /** Appelée à chaque morceau de texte reçu, pour l'afficher au fil de l'eau. */
  onText: (delta: string) => void
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

/** Jetons de sortie permis pour une réponse du coach, réflexion comprise. */
const CHAT_MAX_TOKENS = 8000

/**
 * Pose une question au coach et reçoit sa réponse au fil de l'eau. Le début de la conversation est mis
 * en cache par l'API (moins cher à relire à la question suivante). Une réponse vide n'est jamais gardée ;
 * une réponse coupée par la limite de longueur l'est, si elle a du texte.
 */
export async function streamChat(request: ChatRequest): Promise<ChatResult> {
  try {
    const stream = aiClient(request.apiKey, request.fetchImpl).messages.stream(
      {
        model: request.model,
        max_tokens: CHAT_MAX_TOKENS,
        system: request.system,
        messages: request.messages,
        cache_control: { type: 'ephemeral' },
        output_config: { effort: 'medium' },
      },
      { signal: request.signal },
    )
    // Avant la première attente : aucun morceau de texte ne peut arriver avant l'écoute.
    stream.on('text', (delta) => {
      request.onText(delta)
    })
    const message = await stream.finalMessage()
    const usage = usageOf(message.usage)
    if (message.stop_reason === 'refusal') return { ok: false, problem: 'refused', usage }
    const text = message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim()
    if (text === '') return { ok: false, problem: 'failed', usage }
    return { ok: true, text, usage }
  } catch (error) {
    return { ok: false, problem: aiProblem(error), usage: null }
  }
}
