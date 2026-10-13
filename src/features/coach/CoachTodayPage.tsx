import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Coffee, LoaderCircle, Play, Sparkles } from 'lucide-react'
import { useProfile, useSettings } from '@/app/data-context'
import type { AiProblem } from '@/content/ai/client'
import { askStructured } from '@/content/ai/structured'
import type { ProgramItem } from '@/content/calendar/agenda'
import {
  cleanDailyAdvice,
  coachBasis,
  coachPlanFor,
  dailyAdviceOutput,
  dailyPrompt,
  slotOptions,
} from '@/content/coach/today'
import { isDeloadWeek } from '@/content/programs/schedule'
import { schemeFor } from '@/content/programs/schemes'
import { setProgramSessionSkipped } from '@/db/calendar'
import { saveCoachDay, setCoachDayIgnored } from '@/db/coach'
import { db } from '@/db/db'
import { coachDaySchema } from '@/db/schema'
import type { AiUsage, CoachCheckIn, CoachDay, Program } from '@/db/types'
import { addDaysISO, nowISO, today } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Badge } from '@/ui/Controls'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { useToast } from '@/ui/toast-context'
import { AiProblemNote } from '@/features/ai/AiProblemNote'
import { canRetry } from '@/features/ai/ai-view'
import { recordCallUsage } from '@/features/ai/ai-usage'
import { loadCoachData } from '@/features/ai/coach-data'
import { CostHint } from '@/features/ai/CostHint'
import { KeyNeeded } from '@/features/ai/KeyNeeded'
import { useAbortable } from '@/features/ai/useAbortable'
import { useAiKey } from '@/features/ai/useAiKey'
import { useAgenda } from '@/features/calendar/useAgenda'
import { useCatalog } from '@/features/library/catalog-context'
import { useOura, useOuraAutoSync } from '@/features/oura/useOura'
import { sessionSummary } from '@/features/training/program-view'
import { useActiveProgram, useTrainingContext } from '@/features/training/useTraining'
import { coachSessionBuilder, programSessionBuilder } from '@/features/workout/build-session'
import { StartWorkoutButton } from '@/features/workout/StartWorkoutButton'
import { CheckInForm } from './CheckInForm'
import {
  changeLine,
  checkInDraft,
  checkInOf,
  DECISION_LABEL,
  DECISION_TONE,
  formLines,
  headlineBesides,
  ignoreLabel,
  newestDay,
  NO_SESSION_TEXT,
  ouraNight,
  restLabel,
  SESSION_STATUS_TEXT,
  TIPS_LABEL,
  TODAY_COACH_TEXT,
  type CheckInDraft,
} from './coach-today-view'
import { useCoachDay } from './useCoachDay'

type Phase = { kind: 'idle' } | { kind: 'asking' } | { kind: 'problem'; problem: AiProblem }

/**
 * Coach du jour : on dit au coach comment on se sent ; d'après la bague, les séances récentes et la
 * semaine à venir, il valide la séance prévue, l'allège ou conseille le repos (des conseils pour la
 * journée quand rien n'est prévu). Claude n'est appelé qu'au toucher de « Demander au coach ».
 */
export function CoachTodayPage() {
  const apiKey = useAiKey()
  const settings = useSettings()
  const profile = useProfile()
  const catalog = useCatalog()
  const toast = useToast()
  const date = today()
  const program = useActiveProgram()
  const agenda = useAgenda(program, date, date)
  const context = useTrainingContext(program?.locationId ?? null)
  const live = useCoachDay(date)
  const oura = useOura()
  useOuraAutoSync(oura)
  const yesterday = useLiveQuery(async () => (await db.ouraDays.get(addDaysISO(date, -1))) ?? null, [date])
  const { begin, cancel } = useAbortable()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<CheckInDraft | null>(null)
  const [saved, setSaved] = useState<CoachDay | null>(null)
  const [busy, setBusy] = useState(false)

  const pageProps = { title: 'Coach du jour', back: true, backTo: '/training', backLabel: 'Entraînement' }

  if (apiKey === null) {
    return (
      <Page {...pageProps}>
        <KeyNeeded />
      </Page>
    )
  }
  if (
    apiKey === undefined ||
    program === undefined ||
    agenda === undefined ||
    context === null ||
    live === undefined ||
    oura === undefined ||
    yesterday === undefined
  ) {
    return (
      <Page {...pageProps}>
        <PageSpinner />
      </Page>
    )
  }

  const day = newestDay(live, saved, date)
  const items = (agenda.get(date) ?? []).filter((item): item is ProgramItem => item.type === 'program')
  const planned = items.find((item) => item.status === 'planned') ?? null
  const advised =
    !day || day.programSessionId === null
      ? null
      : (items.find(
          (item) => item.program.id === day.programId && item.session.id === day.programSessionId,
        ) ?? null)
  const shownItem = planned ?? advised ?? items[0] ?? null
  const deload = program !== null && isDeloadWeek(program, date)
  const night = ouraNight(oura.latest, date)
  const current = draft ?? checkInDraft(day?.checkIn)
  const showResult = day !== null && !editing && phase.kind !== 'asking'

  const ask = async (checkIn: CoachCheckIn) => {
    const signal = begin()
    setPhase({ kind: 'asking' })
    const model = settings.aiModel
    let problem: AiProblem | null = null
    let usage: AiUsage | null = null
    try {
      const data = await loadCoachData(date)
      const session = program && planned ? planned.session : null
      const options =
        program && session
          ? slotOptions(program, session, date, context, schemeFor(program.focuses, profile.experience))
          : []
      const basis = coachBasis(data)
      const prompt = dailyPrompt({
        data,
        session: session ? { name: session.name, deload } : null,
        options,
        checkIn,
        basis,
      })
      const result = await askStructured({
        apiKey,
        model,
        system: prompt.system,
        content: prompt.content,
        schema: dailyAdviceOutput,
        effort: 'medium',
        signal,
      })
      usage = result.usage
      if (!result.ok) problem = result.problem
      else if (!signal.aborted) {
        const now = nowISO()
        const advice = cleanDailyAdvice(result.value, options, session !== null)
        const next = coachDaySchema.parse({
          date,
          model,
          checkIn,
          basis,
          programId: program && session ? program.id : null,
          programSessionId: session?.id ?? null,
          ...advice,
          ignored: false,
          createdAt: now,
          updatedAt: now,
        })
        await saveCoachDay(next)
        setSaved(next)
      }
    } catch {
      problem = 'failed'
    }
    // Compté avant d'afficher le résultat, même annulé ou inutilisable : la réponse est facturée.
    await recordCallUsage(usage, model)
    if (signal.aborted || problem === 'cancelled') return
    if (problem) {
      setPhase({ kind: 'problem', problem })
      return
    }
    setDraft(null)
    setEditing(false)
    setPhase({ kind: 'idle' })
  }

  const stop = () => {
    cancel()
    setPhase({ kind: 'idle' })
  }

  const run = async (label: string, action: () => Promise<void>, done?: string) => {
    setBusy(true)
    try {
      await action()
      if (done) toast(done)
    } catch (error) {
      toast(userMessage(error, label), 'error')
    } finally {
      setBusy(false)
    }
  }

  const setRest = (item: ProgramItem, skipped: boolean) =>
    void run(
      'Enregistrement impossible, réessaie.',
      () => setProgramSessionSkipped(item.program, item.session, item.date, skipped),
      skipped ? TODAY_COACH_TEXT.restTaken : TODAY_COACH_TEXT.restCancelled,
    )

  const header = (
    <Section title="Aujourd’hui">
      <Card>
        {shownItem ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[18px] font-semibold text-ink">{shownItem.session.name}</p>
              {deload && <Badge tone="success">Semaine allégée</Badge>}
            </div>
            <p className="mt-0.5 text-[14px] text-ink-3">{sessionSummary(shownItem.session, catalog.byId)}</p>
            {shownItem.status !== 'planned' && (
              <p className="mt-1 text-[14px] text-ink-2">{SESSION_STATUS_TEXT[shownItem.status]}</p>
            )}
          </>
        ) : (
          <p className="text-[15px] text-ink-2">{NO_SESSION_TEXT}</p>
        )}
      </Card>
    </Section>
  )

  if (phase.kind === 'asking') {
    return (
      <Page {...pageProps}>
        {header}
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-6 py-8 text-center">
          <LoaderCircle size={28} className="animate-spin text-ink-3" aria-hidden />
          <p role="status" className="text-[15px] text-ink-2">
            Le coach regarde ta journée…
          </p>
          <p className="text-[13px] text-ink-3">Il lui faut parfois une minute pour réfléchir.</p>
          <Button variant="secondary" block className="mt-2" onClick={stop}>
            Annuler
          </Button>
        </div>
      </Page>
    )
  }

  if (showResult) {
    return (
      <Page {...pageProps}>
        {header}
        <Result
          day={day}
          program={program}
          advised={advised}
          deload={deload}
          busy={busy}
          onRest={setRest}
          onIgnore={() =>
            void run('Enregistrement impossible, réessaie.', () => setCoachDayIgnored(date, !day.ignored))
          }
          onAskAgain={() => {
            setDraft(checkInDraft(day.checkIn))
            setEditing(true)
            setPhase({ kind: 'idle' })
          }}
        />
      </Page>
    )
  }

  const retryable = phase.kind === 'problem' && canRetry(phase.problem)
  const submit = () => void ask(checkInOf(current, night === null))

  return (
    <Page {...pageProps}>
      {header}
      <Section title="Ta forme">
        <Card>
          <ul className="flex flex-col gap-1 text-[15px] text-ink-2">
            {formLines(night, yesterday).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      </Section>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Section title="Ton ressenti">
          <CheckInForm value={current} onChange={setDraft} showSleep={night === null} />
        </Section>
        <div className="flex flex-col gap-3">
          {phase.kind === 'problem' && (
            <AiProblemNote problem={phase.problem} task="daily" onRetry={submit} />
          )}
          {!retryable && (
            <Button type="submit" size="lg" block icon={<Sparkles size={18} aria-hidden />}>
              Demander au coach
            </Button>
          )}
          <CostHint action="daily" />
          {editing && day && (
            <Button
              variant="ghost"
              block
              onClick={() => {
                setEditing(false)
                setDraft(null)
                setPhase({ kind: 'idle' })
              }}
            >
              Garder le conseil actuel
            </Button>
          )}
        </div>
      </form>
    </Page>
  )
}

/** Le conseil du jour et ce qu'on peut en faire : commencer la séance, prendre son repos, redemander. */
function Result({
  day,
  program,
  advised,
  deload,
  busy,
  onRest,
  onIgnore,
  onAskAgain,
}: {
  day: CoachDay
  program: Program | null
  /** La séance du jour visée par le conseil ; null s'il n'y en avait pas (ou plus). */
  advised: ProgramItem | null
  deload: boolean
  busy: boolean
  onRest: (item: ProgramItem, skipped: boolean) => void
  onIgnore: () => void
  onAskAgain: () => void
}) {
  const catalog = useCatalog()
  const settings = useSettings()
  const slots = new Map(advised?.session.blocks.flatMap((block) => block.slots.map((s) => [s.id, s])) ?? [])
  const plan = program && advised ? coachPlanFor(day, program, advised.session, day.date) : null
  const canStart = program !== null && advised !== null && advised.status === 'planned'
  const label = day.decision ? DECISION_LABEL[day.decision] : TIPS_LABEL
  const headline = headlineBesides(day.headline, label)

  return (
    <Section title="Conseil du coach">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={day.decision ? DECISION_TONE[day.decision] : 'neutral'}>{label}</Badge>
          {day.ignored && <Badge>Conseil mis de côté</Badge>}
        </div>
        {headline && <p className="mt-2 text-[18px] font-semibold text-ink">{frenchSpacing(headline)}</p>}
        {day.summary !== '' && <p className="mt-1 text-[15px] text-ink-2">{frenchSpacing(day.summary)}</p>}
        {day.changes.length > 0 && (
          <ul aria-label="Exercices changés" className="mt-3 flex flex-col gap-2">
            {day.changes.map((change) => (
              <li key={change.slotId} className="rounded-xl bg-surface-2 px-3 py-2">
                <p className="text-[15px] text-ink">
                  {changeLine(change, slots.get(change.slotId), deload, catalog.byId, settings.weightUnit)}
                </p>
                {change.reason !== '' && (
                  <p className="mt-0.5 text-[13px] text-ink-3">{frenchSpacing(change.reason)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {day.tips.length > 0 && (
          <>
            <h3 className="mt-4 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">
              Pour ta journée
            </h3>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-[15px] text-ink-2">
              {day.tips.map((tip, i) => (
                <li key={i}>{frenchSpacing(tip)}</li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <div className="mt-4 flex flex-col gap-2">
        {advised &&
          day.decision === 'rest' &&
          (advised.status === 'planned' || advised.status === 'skipped') && (
            <Button
              block
              variant={advised.status === 'skipped' ? 'secondary' : 'primary'}
              disabled={busy}
              icon={advised.status === 'skipped' ? undefined : <Coffee size={18} aria-hidden />}
              onClick={() => onRest(advised, advised.status !== 'skipped')}
            >
              {restLabel(advised.status === 'skipped')}
            </Button>
          )}
        {canStart && day.decision !== 'rest' && (
          <StartWorkoutButton
            build={
              plan?.decision === 'lighter'
                ? coachSessionBuilder(program, advised.session, advised.date, plan)
                : programSessionBuilder(program, advised.session, advised.date)
            }
            block
            icon={<Play size={18} aria-hidden />}
          >
            {plan?.decision === 'lighter' ? TODAY_COACH_TEXT.startLighter : TODAY_COACH_TEXT.start}
          </StartWorkoutButton>
        )}
        {canStart && day.decision === 'lighter' && (
          <Button variant="ghost" block disabled={busy} onClick={onIgnore}>
            {ignoreLabel(day.ignored)}
          </Button>
        )}
        <Button variant="ghost" block onClick={onAskAgain}>
          Redemander au coach
        </Button>
      </div>
    </Section>
  )
}
