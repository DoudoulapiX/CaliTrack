import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowUp, MessageCircle, Square, Trash2 } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { streamChat, type ChatResult } from '@/content/ai/chat'
import type { AiProblem } from '@/content/ai/client'
import { CHAT_DRAFT_MAX, chatSystem, chatWindow } from '@/content/coach/chat'
import { appendChatExchange, clearChat } from '@/db/coach'
import { db } from '@/db/db'
import type { CoachMessage } from '@/db/types'
import { cn } from '@/lib/cn'
import { today as todayISO } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { AiProblemNote } from '@/features/ai/AiProblemNote'
import { recordCallUsage } from '@/features/ai/ai-usage'
import { loadCoachData } from '@/features/ai/coach-data'
import { CostHint } from '@/features/ai/CostHint'
import { KeyNeeded } from '@/features/ai/KeyNeeded'
import { useAbortable } from '@/features/ai/useAbortable'
import { useAiKey } from '@/features/ai/useAiKey'
import { IconButton } from '@/ui/Button'
import { EmptyState } from '@/ui/Controls'
import { INPUT_CLASS } from '@/ui/Field'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { ConfirmSheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import {
  CHAT_PRIVACY_TEXT,
  CHAT_SUGGESTIONS,
  COACH_TYPING,
  chatDayLabel,
  chatDays,
  messageParagraphs,
  speakerLabel,
  type ChatDay,
} from './chat-view'

/**
 * La question en cours. Sa réponse arrive au fil de l'eau, puis l'échange est enregistré (`saved`) : il
 * reste affiché ici jusqu'à ce que la liste lue dans la base le montre (sans trou entre les deux).
 */
interface Turn {
  question: string
  answer: string
  saved: boolean
  /** Le dernier `seq` enregistré avant la question : l'échange porte les deux suivants. */
  lastSeq: number
}

/** Distance au bas de l'écran sous laquelle la discussion suit la réponse qui s'écrit. */
const FOLLOW_MARGIN = 96

/** Descend en bas de la discussion, d'un coup (la réponse qui s'écrit la ferait sinon tressauter). */
function scrollToEnd() {
  window.scrollTo({ top: document.documentElement.scrollHeight })
}

/**
 * Un message, en bulle : à droite pour l'utilisateur, à gauche pour le coach. Mémorisé : seule la bulle
 * de la réponse qui s'écrit change à chaque morceau reçu.
 */
const MessageBubble = memo(function MessageBubble({ role, text }: Pick<CoachMessage, 'role' | 'text'>) {
  const mine = role === 'user'
  return (
    <li className={mine ? 'flex justify-end pl-10' : 'flex justify-start pr-6'}>
      <div
        className={
          mine
            ? 'min-w-0 rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-[16px] text-ink'
            : 'min-w-0 rounded-2xl rounded-bl-md bg-surface px-4 py-3 text-[16px] text-ink'
        }
      >
        <span className="sr-only">{frenchSpacing(`${speakerLabel(role)} : `)}</span>
        <div className="space-y-2">
          {messageParagraphs({ role, text }).map((paragraph, index) => (
            <p key={index} className="break-words whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </li>
  )
})

/** Les messages d'un jour, sous le titre de ce jour. */
function DayGroup({ day, children }: { day: Pick<ChatDay, 'label'>; children: ReactNode }) {
  return (
    <div>
      <h2 className="my-3 text-center text-[12px] font-semibold text-ink-3">{day.label}</h2>
      <ol className="flex flex-col gap-3">{children}</ol>
    </div>
  )
}

/**
 * Discussion avec le coach : un seul fil, gardé sur l'iPhone. Chaque question part avec les données du
 * coach et les derniers messages relus dans la base ; la réponse s'affiche au fil de l'eau et n'est
 * enregistrée, avec la question, qu'une fois complète.
 */
export function CoachChatPage() {
  const settings = useSettings()
  const apiKey = useAiKey()
  const toast = useToast()
  const { begin, cancel } = useAbortable()
  // Pour l'affichage seulement : une question relit la discussion dans la base au moment de partir.
  const messages = useLiveQuery(() => db.coachMessages.orderBy('seq').toArray(), [])
  const [text, setText] = useState('')
  const [turn, setTurn] = useState<Turn | null>(null)
  const [problem, setProblem] = useState<AiProblem | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sending = useRef(false)
  // L'écran est-il en bas de la discussion ? Si oui, il y reste quand elle s'allonge.
  const atEnd = useRef(true)

  useEffect(() => {
    const onScroll = () => {
      atEnd.current =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - FOLLOW_MARGIN
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  // Le champ grandit avec le message (jusqu'à sa hauteur maximale, puis il défile).
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    if (input.scrollHeight > 0) input.style.height = `${String(input.scrollHeight)}px`
  }, [text])

  const today = todayISO()
  // Rangée par jour une fois par lecture de la base, pas à chaque morceau de la réponse qui s'écrit.
  const days = useMemo(() => (messages ? chatDays(messages, today) : []), [messages, today])
  const storedLastSeq = messages?.at(-1)?.seq ?? -1
  const shownTurn = turn && !(turn.saved && storedLastSeq >= turn.lastSeq + 2) ? turn : null
  const streaming = turn !== null && !turn.saved

  useEffect(() => {
    if (messages !== undefined && atEnd.current) scrollToEnd()
  }, [messages, shownTurn?.question, shownTurn?.answer, problem])

  /** Envoie une question. Rien n'est enregistré tant que la réponse n'est pas complète. */
  const send = async (value: string) => {
    const draft = value.trim()
    if (!apiKey || draft === '' || sending.current) return
    sending.current = true
    const signal = begin()
    const model = settings.aiModel
    atEnd.current = true
    setText('')
    setProblem(null)
    setTurn({ question: draft, answer: '', saved: false, lastSeq: -1 })

    let lastSeq = -1
    let result: ChatResult
    try {
      const history = await db.coachMessages.orderBy('seq').toArray()
      lastSeq = history.at(-1)?.seq ?? -1
      const data = await loadCoachData(todayISO())
      result = await streamChat({
        apiKey,
        model,
        system: chatSystem(data),
        messages: chatWindow(history, draft),
        signal,
        onText: (delta) => {
          setTurn((current) =>
            current && !current.saved ? { ...current, answer: current.answer + delta } : current,
          )
        },
      })
    } catch {
      // Les données du coach n'ont pas pu être lues : rien n'est parti.
      result = { ok: false, problem: signal.aborted ? 'cancelled' : 'failed', usage: null }
    }
    // Compté avant d'afficher la suite : une réponse refusée ou vide est facturée aussi.
    await recordCallUsage(result.usage, model)

    if (result.ok && !signal.aborted) {
      try {
        await appendChatExchange({ user: draft, assistant: result.text, model })
        setTurn({ question: draft, answer: result.text, saved: true, lastSeq })
        sending.current = false
        return
      } catch {
        result = { ok: false, problem: 'failed', usage: null }
      }
    }
    // Arrêtée, refusée ou en échec : la réponse partielle disparaît et la question revient dans le champ.
    setTurn(null)
    setText((current) => (current.trim() === '' ? draft : current))
    if (!result.ok && result.problem !== 'cancelled') setProblem(result.problem)
    sending.current = false
  }

  const suggest = (suggestion: string) => {
    setText(suggestion)
    inputRef.current?.focus()
  }

  const clear = async () => {
    try {
      await clearChat()
      setTurn(null)
      setProblem(null)
      toast('Discussion effacée')
    } catch (e) {
      toast(userMessage(e, 'Effacement impossible, réessaie.'), 'error')
    }
  }

  const pageProps = {
    title: 'Discussion avec le coach',
    back: true,
    backTo: '/more',
    backLabel: 'Plus',
    noTabBar: true,
  } as const

  if (apiKey === undefined || messages === undefined) {
    return (
      <Page {...pageProps}>
        <PageSpinner />
      </Page>
    )
  }

  // L'échange en cours va sous le jour d'aujourd'hui, à la suite des messages déjà enregistrés.
  const groups: Pick<ChatDay, 'day' | 'label'>[] =
    shownTurn && days.at(-1)?.day !== today
      ? [...days, { day: today, label: chatDayLabel(today, today) }]
      : days
  const empty = messages.length === 0 && shownTurn === null

  return (
    <Page
      {...pageProps}
      className="flex flex-col"
      actions={
        messages.length > 0 && !streaming ? (
          <IconButton
            label="Effacer la discussion"
            onClick={() => {
              setConfirmClear(true)
            }}
          >
            <Trash2 size={20} aria-hidden />
          </IconButton>
        ) : undefined
      }
    >
      <div className="flex flex-1 flex-col pb-4">
        {empty && apiKey !== null && (
          <div className="flex flex-col gap-6 pt-2">
            <EmptyState
              icon={<MessageCircle size={36} aria-hidden />}
              title="Pose ta question au coach"
              text={CHAT_PRIVACY_TEXT}
            />
            <Section title="Pour commencer">
              <ul className="flex flex-col gap-2">
                {CHAT_SUGGESTIONS.map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      className="flex min-h-12 w-full items-center rounded-2xl bg-surface px-4 py-3 text-left text-[15px] text-ink active:bg-surface-2"
                      onClick={() => {
                        suggest(suggestion)
                      }}
                    >
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        )}

        {groups.map((group, index) => (
          <DayGroup key={group.day} day={group}>
            {days[index]?.messages.map((message) => (
              <MessageBubble key={message.id} role={message.role} text={message.text} />
            ))}
            {index === groups.length - 1 && shownTurn && (
              <>
                <MessageBubble role="user" text={shownTurn.question} />
                {shownTurn.answer.trim() !== '' && <MessageBubble role="assistant" text={shownTurn.answer} />}
              </>
            )}
          </DayGroup>
        ))}

        {/* Annoncé une fois au début de la réponse ; le texte qui s'écrit n'est pas une zone annoncée. */}
        <p role="status" className={cn('px-1 text-[13px] text-ink-3', streaming && 'mt-3')}>
          {streaming ? COACH_TYPING : ''}
        </p>

        {problem && (
          <div className="mt-3">
            <AiProblemNote
              problem={problem}
              task="chat"
              onRetry={
                text.trim() === ''
                  ? undefined
                  : () => {
                      void send(text)
                    }
              }
            />
          </div>
        )}

        {apiKey === null && (
          <div className={cn(!empty && 'mt-6')}>
            <KeyNeeded />
          </div>
        )}
      </div>

      {apiKey !== null && (
        <form
          className="sticky bottom-0 z-10 -mx-4 mb-[calc(var(--safe-bottom)*-1)] border-t border-line bg-canvas/95 px-4 pt-3 pb-[calc(var(--safe-bottom)+12px)] backdrop-blur-xl"
          onSubmit={(e) => {
            e.preventDefault()
            void send(text)
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              aria-label="Ton message"
              rows={1}
              maxLength={CHAT_DRAFT_MAX}
              autoCapitalize="sentences"
              placeholder="Écris au coach…"
              className={cn(INPUT_CLASS, 'max-h-40 min-h-11 resize-none leading-snug')}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
              }}
            />
            {/*
             * Deux boutons distincts (clés différentes) : l'arrêt peut finir avant la fin du clic, et le
             * même bouton, devenu « Envoyer », renverrait alors aussitôt la question remise dans le champ.
             */}
            {streaming ? (
              <IconButton key="stop" label="Arrêter" variant="filled" onClick={cancel}>
                <Square size={16} fill="currentColor" aria-hidden />
              </IconButton>
            ) : (
              <IconButton
                key="send"
                type="submit"
                label="Envoyer"
                variant="accent"
                disabled={text.trim() === ''}
              >
                <ArrowUp size={22} aria-hidden />
              </IconButton>
            )}
          </div>
          {empty && <CostHint action="chat" />}
        </form>
      )}

      <ConfirmSheet
        open={confirmClear}
        onClose={() => {
          setConfirmClear(false)
        }}
        onConfirm={() => {
          void clear()
        }}
        title={frenchSpacing('Effacer la discussion ?')}
        message="Tous les messages échangés avec le coach seront supprimés de cet iPhone."
        confirmLabel="Effacer"
      />
    </Page>
  )
}
