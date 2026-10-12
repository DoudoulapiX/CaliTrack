import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { ContentBlockParam, Message, TextBlockParam, Usage } from '@anthropic-ai/sdk/resources/messages'
import type { z } from 'zod'
import type { AiUsage } from '@/db/types'
import { aiClient, aiProblem, type AiProblem } from './client'

export type { AiUsage } from '@/db/types'

/**
 * La réponse structurée de Claude, ou le problème qui l'a empêchée. `usage` est donné dès qu'une réponse
 * est revenue, même inutilisable : elle est facturée.
 */
export type StructuredResult<T> =
  { ok: true; value: T; usage: AiUsage } | { ok: false; problem: AiProblem; usage: AiUsage | null }

export interface StructuredRequest<S extends z.ZodType> {
  apiKey: string
  model: string
  system: string | TextBlockParam[]
  /** Les images d'abord, puis le texte. */
  content: ContentBlockParam[]
  /**
   * La forme attendue, SOUPLE : chaînes, nombres, booléens et listes seulement, sans enum ni bornes
   * (l'API les déplace dans les descriptions : Claude peut renvoyer n'importe quelle valeur). Les valeurs
   * sont ramenées dans les bornes après coup, avec choice() et des fonctions de nettoyage.
   */
  schema: S
  effort: 'low' | 'medium'
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

/** Jetons de sortie permis, réflexion comprise : de la marge pour que la réponse ne soit pas coupée. */
export const MAX_TOKENS = { low: 8000, medium: 16000 } as const

/** Le schéma JSON accepté par les sorties structurées de l'API, tiré d'un schéma zod. */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  return zodOutputFormat(schema).schema
}

/** Les jetons comptés par l'API pour une réponse. */
export function usageOf(usage: Usage): AiUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  }
}

/** La valeur reçue si elle fait partie des choix permis, sinon la valeur de repli. */
export function choice<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return (options as readonly string[]).includes(value) ? (value as T) : fallback
}

/**
 * Lit la réponse finale : un refus, une réponse coupée, du JSON illisible ou de la mauvaise forme sont
 * des problèmes. Seuls les blocs de texte comptent (la réponse peut commencer par la réflexion).
 */
export function readStructured<S extends z.ZodType>(
  message: Message,
  schema: S,
): StructuredResult<z.output<S>> {
  const usage = usageOf(message.usage)
  if (message.stop_reason === 'refusal') return { ok: false, problem: 'refused', usage }
  if (message.stop_reason !== 'end_turn') return { ok: false, problem: 'failed', usage }
  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, problem: 'failed', usage }
  }
  const parsed = schema.safeParse(json)
  return parsed.success ? { ok: true, value: parsed.data, usage } : { ok: false, problem: 'failed', usage }
}

/**
 * Demande à Claude une réponse de la forme voulue. La réponse arrive en flux : le délai du client ne
 * porte que sur l'attente des en-têtes, et une longue réflexion ne le dépasse pas. Le format envoyé est
 * un simple schéma JSON, sans lecture automatique par le SDK : un refus reste un refus, lu ici.
 */
export async function askStructured<S extends z.ZodType>(
  request: StructuredRequest<S>,
): Promise<StructuredResult<z.output<S>>> {
  try {
    const stream = aiClient(request.apiKey, request.fetchImpl).messages.stream(
      {
        model: request.model,
        max_tokens: MAX_TOKENS[request.effort],
        system: request.system,
        messages: [{ role: 'user', content: request.content }],
        output_config: {
          effort: request.effort,
          format: { type: 'json_schema', schema: jsonSchemaOf(request.schema) },
        },
      },
      { signal: request.signal },
    )
    return readStructured(await stream.finalMessage(), request.schema)
  } catch (error) {
    return { ok: false, problem: aiProblem(error), usage: null }
  }
}
