import type { CoachMessage } from '@/db/types'
import { ALL_SECTIONS, buildCoachContext, type CoachData } from './context'
import { COACH_RULES, promptText } from './prompt'

/**
 * Ce que ChatGPT relit de la discussion à chaque question : les derniers messages seulement (la question
 * comprise), dans une limite de caractères. Les plus anciens restent affichés, mais ne sont plus envoyés.
 */
export const CHAT_WINDOW = { messages: 20, chars: 16_000 } as const

/** Longueur maximale d'une question. */
export const CHAT_DRAFT_MAX = 2000

/** Les règles propres à la discussion, ajoutées à celles du coach (texte simple, espaces ordinaires). */
export const CHAT_RULES = `Discussion :
- Tu réponds aux questions de l'utilisateur sur son entraînement, son escalade, sa nutrition et sa récupération.
- Appuie-toi sur les données de <donnees> quand elles sont utiles, sans les recopier. Si une donnée manque, dis-le au lieu de l'inventer.
- Les données sont celles du jour indiqué ; les messages précédents de la discussion ont pu être écrits avant.
- Réponds en quelques phrases courtes, ou en une liste simple : pas de tableau, pas de titre.
- Si la question sort de ces sujets, réponds brièvement et ramène la discussion à son entraînement.`

/** Un message de la conversation envoyée à ChatGPT : du texte seulement. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/**
 * La conversation envoyée à ChatGPT : les derniers messages enregistrés (dans l'ordre de `seq`, au plus
 * CHAT_WINDOW.messages avec la question, CHAT_WINDOW.chars caractères en tout), en commençant par une
 * question de l'utilisateur, puis la nouvelle question. Seul le texte enregistré est relu : la réflexion
 * de ChatGPT n'est jamais gardée.
 */
export function chatWindow(history: readonly CoachMessage[], draft: string): ChatTurn[] {
  const question = promptText(draft.trim())
  const ordered = [...history].sort((a, b) => a.seq - b.seq)
  const kept: CoachMessage[] = []
  let chars = question.length
  for (let index = ordered.length - 1; index >= 0; index--) {
    const message = ordered[index]
    if (message === undefined || kept.length >= CHAT_WINDOW.messages - 1) break
    if (chars + message.text.length > CHAT_WINDOW.chars) break
    chars += message.text.length
    kept.unshift(message)
  }
  while (kept[0]?.role === 'assistant') kept.shift()
  return [
    ...kept.map((message) => ({ role: message.role, content: promptText(message.text) })),
    { role: 'user', content: question },
  ]
}

/**
 * Les consignes de la discussion : les règles, puis les données du coach. Elles ouvrent chaque demande,
 * toujours dans le même ordre : OpenAI garde ce début en cache (les mêmes données donnent le même texte,
 * relu moins cher d'une question à l'autre).
 */
export function chatSystem(data: CoachData): string {
  return `${promptText(`${COACH_RULES}\n\n${CHAT_RULES}`)}\n\n${buildCoachContext(data, ALL_SECTIONS)}`
}

/**
 * Une réponse du coach en texte simple, pour l'afficher telle quelle : sans titres, gras, code, citations
 * ni séparateurs Markdown ; les puces deviennent « • » et les liens « texte (adresse) ».
 */
export function plainChatText(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, '\n')
    .replace(/^[ \t]*```.*$\n?/gm, '')
    .replace(/^[ \t]*(?:-[ \t]*){3,}$|^[ \t]*(?:\*[ \t]*){3,}$|^[ \t]*(?:_[ \t]*){3,}$/gm, '')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '• ')
    .replace(/\*\*|__/g, '')
    .replace(/(^|[^\p{L}\p{N}*])\*(?=\S)([^*\n]*?\S)\*(?![\p{L}\p{N}*])/gu, '$1$2')
    .replace(/`/g, '')
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
