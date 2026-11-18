import { z } from 'zod'
import type { AiUsage } from '@/db/types'
import { aiProblem, type AiContent, type AiProblem } from './client'
import {
  finalProblem,
  inputContent,
  outputOf,
  streamResponses,
  usageOf,
  type OpenAiResponse,
} from './responses'

export type { AiUsage } from '@/db/types'
export { choice } from './choice'

/**
 * La réponse structurée de ChatGPT, ou le problème qui l'a empêchée. `usage` est donné dès qu'une réponse
 * est revenue, même inutilisable : elle est facturée.
 */
export type StructuredResult<T> =
  { ok: true; value: T; usage: AiUsage } | { ok: false; problem: AiProblem; usage: AiUsage | null }

export interface StructuredRequest<S extends z.ZodType> {
  apiKey: string
  model: string
  /** Les consignes (texte simple, sans espace insécable). */
  system: string
  /** Les images d'abord, puis le texte. */
  content: AiContent[]
  /**
   * La forme attendue, SOUPLE : chaînes, nombres, booléens, listes et null seulement, sans enum ni bornes.
   * Les valeurs sont ramenées dans les bornes après coup, avec choice() et des fonctions de nettoyage.
   */
  schema: S
  effort: 'low' | 'medium'
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

/** Jetons de sortie permis, réflexion comprise : de la marge pour que la réponse ne soit pas coupée. */
export const MAX_TOKENS = { low: 8000, medium: 16000 } as const

/**
 * Le schéma JSON envoyé à l'API (sorties structurées strictes : chaque champ requis, aucun champ en plus),
 * tiré d'un schéma zod.
 */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const json: Record<string, unknown> = { ...z.toJSONSchema(schema, { target: 'draft-7', io: 'output' }) }
  delete json.$schema
  return json
}

/**
 * Lit la réponse finale : un refus, une réponse coupée, du JSON illisible ou de la mauvaise forme sont
 * des problèmes. L'état de la réponse est vérifié avant de lire le JSON ; seul le texte des messages
 * compte (jamais la réflexion).
 */
export function readStructured<S extends z.ZodType>(
  response: OpenAiResponse,
  schema: S,
): StructuredResult<z.output<S>> {
  const usage = usageOf(response.usage)
  const problem = finalProblem(response)
  const { text, refused } = outputOf(response)
  if (problem !== null) return { ok: false, problem: problem === 'incomplete' ? 'failed' : problem, usage }
  if (refused) return { ok: false, problem: 'refused', usage }
  if (usage === null) return { ok: false, problem: 'failed', usage }
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
 * Demande à ChatGPT une réponse de la forme voulue (API Responses, en flux, rien gardé chez OpenAI). Le
 * format envoyé est un schéma JSON strict, lu ici : un refus reste un refus.
 */
export async function askStructured<S extends z.ZodType>(
  request: StructuredRequest<S>,
): Promise<StructuredResult<z.output<S>>> {
  try {
    const response = await streamResponses({
      apiKey: request.apiKey,
      body: {
        model: request.model,
        instructions: request.system,
        input: [{ role: 'user', content: inputContent(request.content) }],
        max_output_tokens: MAX_TOKENS[request.effort],
        reasoning: { effort: request.effort },
        text: {
          format: {
            type: 'json_schema',
            name: 'reponse',
            strict: true,
            schema: jsonSchemaOf(request.schema),
          },
        },
        store: false,
      },
      signal: request.signal,
      fetchImpl: request.fetchImpl,
    })
    return readStructured(response, request.schema)
  } catch (error) {
    return { ok: false, problem: aiProblem(error), usage: null }
  }
}
