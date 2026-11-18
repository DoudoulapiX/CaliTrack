import type { AiUsage } from '@/db/types'
import { AiError, callApi, problemOfCode, type AiContent, type AiProblem } from './client'

/*
 * L'API Responses d'OpenAI, lue en flux (server-sent events). Seuls les champs utiles sont décrits : le
 * texte au fil de l'eau, puis la réponse finale (état, sorties, jetons).
 */

/** Les jetons comptés par l'API : l'entrée comprend ceux lus dans le cache et ceux qui y sont écrits. */
export interface OpenAiUsage {
  input_tokens: number
  output_tokens: number
  input_tokens_details?: { cached_tokens?: number | null; cache_write_tokens?: number | null } | null
}

interface OutputContent {
  type: string
  text?: string
  refusal?: string
}

interface OutputItem {
  type: string
  content?: OutputContent[] | null
}

/** La réponse finale, telle que l'envoient les événements response.completed, .incomplete ou .failed. */
export interface OpenAiResponse {
  status: string
  output?: OutputItem[] | null
  usage?: OpenAiUsage | null
  incomplete_details?: { reason?: string | null } | null
  error?: { code?: string | null; message?: string | null } | null
}

/** Les jetons d'une réponse ; null si l'API n'en a pas compté (réponse interrompue). */
export function usageOf(usage: OpenAiUsage | null | undefined): AiUsage | null {
  if (!usage) return null
  const cached = usage.input_tokens_details?.cached_tokens ?? 0
  const written = usage.input_tokens_details?.cache_write_tokens ?? 0
  return {
    inputTokens: Math.max(0, usage.input_tokens - cached - written),
    outputTokens: usage.output_tokens,
    cacheReadTokens: cached,
    cacheWriteTokens: written,
  }
}

/** Le texte de la réponse (blocs de texte des messages seulement, jamais la réflexion) et s'il y a un refus. */
export function outputOf(response: OpenAiResponse): { text: string; refused: boolean } {
  let text = ''
  let refused = false
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue
    for (const part of item.content ?? []) {
      if (part.type === 'output_text') text += part.text ?? ''
      if (part.type === 'refusal') refused = true
    }
  }
  return { text, refused }
}

/** Les morceaux d'une demande dans la forme de l'API : photos en adresses « data: », puis texte. */
export function inputContent(content: readonly AiContent[]) {
  return content.map((part) =>
    part.type === 'image'
      ? { type: 'input_image', image_url: `data:image/jpeg;base64,${part.jpegBase64}`, detail: 'auto' }
      : { type: 'input_text', text: part.text },
  )
}

const FINAL_EVENTS: ReadonlySet<string> = new Set([
  'response.completed',
  'response.incomplete',
  'response.failed',
])

interface StreamEvent {
  type?: string
  delta?: string
  code?: string | null
  response?: OpenAiResponse
}

/** Les événements d'un flux, à mesure qu'ils arrivent (une ligne « data: » par événement). */
async function* eventsOf(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const parse = (block: string): StreamEvent | null => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n')
    if (data === '' || data === '[DONE]') return null
    try {
      return JSON.parse(data) as StreamEvent
    } catch {
      throw new AiError('failed', 'Événement illisible')
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n?/g, '\n')
      let end = buffer.indexOf('\n\n')
      while (end !== -1) {
        const event = parse(buffer.slice(0, end))
        buffer = buffer.slice(end + 2)
        if (event) yield event
        end = buffer.indexOf('\n\n')
      }
      if (done) break
    }
    const last = parse(buffer)
    if (last) yield last
  } finally {
    reader.releaseLock()
  }
}

export interface ResponsesCall {
  apiKey: string
  /** Le corps de la demande, sans `stream` (ajouté ici). */
  body: Record<string, unknown>
  /** Appelée à chaque morceau de texte reçu. */
  onText?: (delta: string) => void
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

/**
 * Envoie une demande en flux et rend la réponse finale (terminée, incomplète ou échouée). Une erreur au
 * milieu du flux lève l'AiError de son code ; un flux qui s'arrête sans réponse finale est un échec.
 */
export async function streamResponses(call: ResponsesCall): Promise<OpenAiResponse> {
  const response = await callApi({
    apiKey: call.apiKey,
    path: '/responses',
    body: { ...call.body, stream: true },
    signal: call.signal,
    fetchImpl: call.fetchImpl,
  })
  if (!response.body) throw new AiError('failed', 'Réponse vide')
  for await (const event of eventsOf(response.body)) {
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      call.onText?.(event.delta)
    } else if (event.type === 'error') {
      throw new AiError(problemOfCode(event.code), 'Erreur pendant la réponse')
    } else if (event.type !== undefined && FINAL_EVENTS.has(event.type) && event.response) {
      return event.response
    }
  }
  if (call.signal?.aborted) throw call.signal.reason
  throw new AiError('failed', 'Réponse interrompue')
}

/**
 * Le problème d'une réponse finale qui n'a pas abouti : échec (selon son code), refus, contenu filtré ;
 * null si elle est terminée. Une réponse coupée par la limite de longueur est un échec (`incomplete`).
 */
export function finalProblem(response: OpenAiResponse): 'incomplete' | AiProblem | null {
  if (response.status === 'failed') return problemOfCode(response.error?.code)
  if (response.status === 'incomplete') {
    return response.incomplete_details?.reason === 'content_filter' ? 'refused' : 'incomplete'
  }
  if (response.status === 'cancelled') return 'cancelled'
  return response.status === 'completed' ? null : 'failed'
}
