import { useState } from 'react'
import { formatClock } from '@/lib/dates'
import { Button } from '@/ui/Button'
import { Stepper } from '@/ui/Controls'
import { restRemainingSec, type RestState } from '../rest-timer'
import { useNow } from '../useNow'
import type { SessionView } from './counter-session'
import {
  addDoubtfulLabel,
  canRetry,
  CLOSE_LABEL,
  closeQuestion,
  EMPTY_TEXT,
  MAX_REPS,
  nextText,
  PROBLEM_TEXT,
  repsLabel,
  REST_LABEL,
  RESULT_LABEL,
  REVIEW_LEAD,
  reviewHeading,
  SAVE_TEXT,
  saveLabel,
  unsureLines,
} from './counter-view'
import type { SessionActions } from './useRepSession'

type SavingView = Extract<SessionView, { kind: 'saving' | 'saved' }>
type ReviewView = Extract<SessionView, { kind: 'review' }>

/** Le repos lancé par la série, au même format que l'écran de séance. */
function RestClock({ rest }: { rest: RestState }) {
  const now = useNow(250)
  return (
    <p role="timer" aria-label={REST_LABEL} className="text-[34px] leading-none font-bold text-ink tabular">
      {formatClock(restRemainingSec(rest, now))}
    </p>
  )
}

/** « Corriger » : le nombre se règle, puis s'enregistre (la série reste faite). */
function Correction({ reps, actions }: { reps: number; actions: SessionActions }) {
  const [draft, setDraft] = useState(reps)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-col items-center gap-3">
      <Stepper label={RESULT_LABEL.stepper} value={draft} min={0} max={MAX_REPS} onChange={setDraft} />
      {failed && (
        <p role="alert" className="text-center text-[15px] text-danger">
          {SAVE_TEXT.correctionError}
        </p>
      )}
      <Button
        block
        size="lg"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void actions.saveCorrection(draft).then((ok) => {
            setBusy(false)
            setFailed(!ok)
          })
        }}
      >
        {RESULT_LABEL.saveCorrection}
      </Button>
      <Button variant="ghost" block size="lg" onClick={actions.cancelCorrect}>
        {RESULT_LABEL.cancel}
      </Button>
    </div>
  )
}

/** « 12 répétitions » : la série enregistrée, le repos, ce qui vient ensuite. */
function SavedResult({
  view,
  rest,
  actions,
}: {
  view: SavingView
  rest: RestState | null
  actions: SessionActions
}) {
  const saved = view.kind === 'saved'
  const error = saved && view.error
  const status = !saved
    ? SAVE_TEXT.saving
    : view.error
      ? SAVE_TEXT.error
      : view.corrected
        ? SAVE_TEXT.corrected
        : SAVE_TEXT.saved
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1 text-center">
        <h3 className="text-ink">
          <span className="text-[48px] leading-none font-bold tabular">{view.reps}</span>
          &nbsp;
          <span className="text-[20px] font-semibold">{repsLabel(view.reps)}</span>
        </h3>
        <p role="status" className={error ? 'text-[15px] text-danger' : 'text-[15px] text-ink-2'}>
          {status}
        </p>
      </div>
      {saved && !view.error && (
        <div className="flex flex-col items-center gap-2 text-center">
          {rest && <RestClock rest={rest} />}
          <p className="text-[15px] text-ink-2">{nextText(view.next, rest !== null)}</p>
        </div>
      )}
      {error && (
        <Button block size="lg" onClick={actions.save}>
          {RESULT_LABEL.retry}
        </Button>
      )}
      {saved && !view.error && (
        <div className="flex flex-col gap-2">
          {view.next && (
            <Button block size="lg" onClick={actions.nextSet}>
              {RESULT_LABEL.nextSet}
            </Button>
          )}
          {view.correcting ? (
            <Correction reps={view.reps} actions={actions} />
          ) : (
            <>
              <Button variant="secondary" block size="lg" onClick={actions.correct}>
                {RESULT_LABEL.correct}
              </Button>
              <Button variant="ghost" block size="lg" onClick={actions.continueSet}>
                {RESULT_LABEL.continueSet}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** « 7 répétitions ? » : rien n'est enregistré avant que le nombre soit vérifié. */
function ReviewResult({ view, actions }: { view: ReviewView; actions: SessionActions }) {
  const { result } = view
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-center text-[32px] leading-tight font-bold text-ink tabular">
        {reviewHeading(result.reps)}
      </h3>
      <div className="text-[15px] text-ink-2">
        <p>{REVIEW_LEAD}</p>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
          {unsureLines(result).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Stepper
          label={RESULT_LABEL.stepper}
          value={view.reps}
          min={0}
          max={MAX_REPS}
          onChange={actions.adjust}
        />
        {result.doubtful > 0 && !view.addedDoubtful && (
          <Button variant="soft" size="sm" onClick={actions.addDoubtful}>
            {addDoubtfulLabel(result.doubtful)}
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Button block size="lg" disabled={view.reps <= 0} onClick={actions.save}>
          {saveLabel(view.reps)}
        </Button>
        <Button variant="secondary" block size="lg" onClick={actions.continueSet}>
          {RESULT_LABEL.continueSet}
        </Button>
        <Button variant="ghost" block size="lg" onClick={actions.discard}>
          {RESULT_LABEL.discard}
        </Button>
      </div>
    </div>
  )
}

export interface CounterResultProps {
  readonly view: Exclude<SessionView, { kind: 'guide' | 'starting' | 'live' }>
  readonly rest: RestState | null
  readonly actions: SessionActions
}

/** Ce que montre la feuille hors de l'image : série enregistrée, à vérifier, rien compté, problème, fermeture. */
export function CounterResult({ view, rest, actions }: CounterResultProps) {
  switch (view.kind) {
    case 'saving':
    case 'saved':
      return <SavedResult view={view} rest={rest} actions={actions} />
    case 'review':
      return <ReviewResult view={view} actions={actions} />
    case 'empty':
      return (
        <div className="flex flex-col gap-4 text-center">
          <h3 className="text-[20px] font-semibold text-ink">{EMPTY_TEXT.title}</h3>
          <p className="text-[15px] text-ink-2">{EMPTY_TEXT.text}</p>
          <Button block size="lg" onClick={actions.retry}>
            {RESULT_LABEL.retry}
          </Button>
        </div>
      )
    case 'problem':
      return (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-center text-[15px] text-ink">
            {PROBLEM_TEXT[view.problem]}
          </p>
          {canRetry(view.problem) && (
            <Button block size="lg" onClick={actions.retry}>
              {RESULT_LABEL.retry}
            </Button>
          )}
        </div>
      )
    case 'confirmClose':
      return (
        <div className="flex flex-col gap-4">
          <p className="text-center text-[17px] font-semibold text-ink">{closeQuestion(view.reps)}</p>
          <div className="flex flex-col gap-2">
            <Button block size="lg" onClick={actions.keepCounting}>
              {CLOSE_LABEL.keep}
            </Button>
            <Button variant="danger" block size="lg" onClick={actions.closeNow}>
              {CLOSE_LABEL.close}
            </Button>
          </div>
        </div>
      )
  }
}
