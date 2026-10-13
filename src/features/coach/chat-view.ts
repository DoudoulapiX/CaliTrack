import { plainChatText } from '@/content/coach/chat'
import type { CoachMessage } from '@/db/types'
import { capitalize, formatDay, localDateOf, relativeDayLabel, type ISODate } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'

/** Des questions pour commencer : les toucher remplit le message, sans l'envoyer. */
export const CHAT_SUGGESTIONS: readonly string[] = [
  frenchSpacing('Comment progresser sur les tractions ?'),
  frenchSpacing('Que manger avant l’escalade ?'),
  frenchSpacing('Ma semaine est-elle trop chargée ?'),
]

/** Annoncé une fois quand le coach commence sa réponse (pas à chaque morceau de texte). */
export const COACH_TYPING = 'Le coach écrit…'

/** Qui parle, pour les lecteurs d'écran. */
export function speakerLabel(role: CoachMessage['role']): string {
  return role === 'user' ? 'Toi' : 'Le coach'
}

/**
 * Le texte d'un message à afficher, en paragraphes : celui de l'utilisateur tel qu'il l'a écrit, celui
 * du coach sans la mise en forme Markdown. Les retours à la ligne simples (listes) restent dans le
 * paragraphe.
 */
export function messageParagraphs(message: Pick<CoachMessage, 'role' | 'text'>): string[] {
  const text = message.role === 'assistant' ? plainChatText(message.text) : message.text.trim()
  return frenchSpacing(text)
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
}

/** Le jour d'un message : « Aujourd’hui », « Hier », « Lundi 19 octobre » (l'année si ce n'est pas celle-ci). */
export function chatDayLabel(day: ISODate, today: ISODate): string {
  if (day.slice(0, 4) !== today.slice(0, 4)) return capitalize(formatDay(day, 'EEEE d MMMM yyyy'))
  return capitalize(relativeDayLabel(day, today))
}

/** Les messages d'un même jour, sous leur titre. */
export interface ChatDay {
  day: ISODate
  label: string
  messages: CoachMessage[]
}

/** La discussion rangée par jour (jour local de chaque message), dans l'ordre de `seq`. */
export function chatDays(messages: readonly CoachMessage[], today: ISODate): ChatDay[] {
  const days: ChatDay[] = []
  for (const message of [...messages].sort((a, b) => a.seq - b.seq)) {
    const day = localDateOf(message.createdAt)
    const last = days.at(-1)
    if (last?.day === day) last.messages.push(message)
    else days.push({ day, label: chatDayLabel(day, today), messages: [message] })
  }
  return days
}
