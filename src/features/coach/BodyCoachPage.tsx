import { useEffect, useId, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Check, Info, LoaderCircle, Scale, Sparkles, UserRound, X } from 'lucide-react'
import { useProfile, useSettings } from '@/app/data-context'
import type { AiProblem } from '@/content/ai/client'
import { askStructured } from '@/content/ai/structured'
import type { CoachData } from '@/content/coach/context'
import {
  BODY_PHOTO_MAX_SIDE,
  bodyCoachGate,
  bodyPrompt,
  bodyReviewFrom,
  bodyReviewOutput,
  cutText,
  type BodyPhoto,
  type PhotoView,
} from '@/content/coach/body'
import { applyBodyReview, saveBodyReview } from '@/db/coach'
import { db } from '@/db/db'
import type { BodyReview, NutritionGoals } from '@/db/types'
import { nowISO, today as todayISO, type ISODate } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { AiProblemNote } from '@/features/ai/AiProblemNote'
import { recordCallUsage } from '@/features/ai/ai-usage'
import { loadCoachData } from '@/features/ai/coach-data'
import { CostHint } from '@/features/ai/CostHint'
import { KeyNeeded } from '@/features/ai/KeyNeeded'
import { useAbortable } from '@/features/ai/useAbortable'
import { useAiKey } from '@/features/ai/useAiKey'
import { WeightSheet } from '@/features/goals/WeightSheet'
import { NutrientTiles } from '@/features/nutrition/NutrientTiles'
import { preparePhoto } from '@/features/nutrition/photo'
import { useCurrentWeightKg, useNutritionGoals } from '@/features/nutrition/useNutrition'
import { Button, ButtonLink, IconButton } from '@/ui/Button'
import { Card, CardLink } from '@/ui/Card'
import { EmptyState, Toggle } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { useToast } from '@/ui/toast-context'
import {
  ANALYZING_TEXT,
  appliedText,
  BODY_DISCLAIMER,
  bodyFatText,
  GATE_TEXT,
  guardText,
  historyLine,
  historyTitle,
  PHOTO_NOTE,
  PHOTO_SLOTS,
  phaseAdviceText,
  removePhotoLabel,
  UNREADABLE_PHOTO,
} from './body-view'

/** Analyses montrées dans l'historique. */
const HISTORY_SIZE = 6

/** Ce que dit l'écran quand Claude ne voit pas de silhouette, sans explication de sa part. */
const UNREADABLE_DEFAULT =
  'Ces photos ne permettent pas l’analyse. Essaie avec d’autres, en pied et en tenue de sport.'

/** Une photo choisie : en préparation, puis prête (aperçu affiché et JPEG à envoyer, en mémoire seulement). */
type Slot = { status: 'empty' } | { status: 'preparing' } | { status: 'ready'; url: string; base64: string }

type Slots = Record<PhotoView, Slot>

const EMPTY_SLOTS: Slots = {
  front: { status: 'empty' },
  side: { status: 'empty' },
  back: { status: 'empty' },
}

type Phase =
  | { kind: 'ready' }
  | { kind: 'analyzing' }
  | { kind: 'problem'; problem: AiProblem }
  | { kind: 'unreadable'; text: string }

/**
 * Coach physique : une à trois photos, analysées par Claude (phase conseillée et masse grasse estimée),
 * puis la phase appliquée aux objectifs caloriques. Les photos ne quittent la mémoire que pour l'analyse :
 * jamais enregistrées, leurs aperçus libérés en les remplaçant et en quittant l'écran.
 */
export function BodyCoachPage() {
  const settings = useSettings()
  const profile = useProfile()
  const apiKey = useAiKey()
  const weightKg = useCurrentWeightKg()
  const goals = useNutritionGoals()
  const reviews = useLiveQuery(
    () => db.bodyReviews.orderBy('date').reverse().limit(HISTORY_SIZE).toArray(),
    [],
  )
  const { begin, cancel } = useAbortable()
  const inputId = useId()
  const today = todayISO()
  const [slots, setSlots] = useState<Slots>(EMPTY_SLOTS)
  const [photoError, setPhotoError] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' })
  const [weighing, setWeighing] = useState(false)
  // Les adresses des aperçus (à libérer) et la dernière photo choisie à chaque place (les plus anciennes,
  // encore en préparation, sont ignorées).
  const live = useRef({
    mounted: true,
    urls: new Map<PhotoView, string>(),
    picks: new Map<PhotoView, number>(),
  })
  useEffect(() => {
    const current = live.current
    current.mounted = true
    return () => {
      current.mounted = false
      for (const url of current.urls.values()) URL.revokeObjectURL(url)
      current.urls.clear()
    }
  }, [])

  const pageProps = {
    title: 'Coach physique',
    back: true,
    backTo: '/nutrition',
    backLabel: 'Nutrition',
  } as const

  if (apiKey === undefined || weightKg === undefined || goals === undefined || reviews === undefined) {
    return (
      <Page {...pageProps}>
        <PageSpinner />
      </Page>
    )
  }

  const gate = bodyCoachGate({ hasKey: apiKey !== null, profile, weightKg, year: Number(today.slice(0, 4)) })

  const setSlot = (view: PhotoView, slot: Slot) => {
    setSlots((current) => ({ ...current, [view]: slot }))
  }
  /** Libère l'aperçu d'une place et oublie la photo en préparation. Renvoie le numéro du choix suivant. */
  const release = (view: PhotoView): number => {
    const url = live.current.urls.get(view)
    if (url) URL.revokeObjectURL(url)
    live.current.urls.delete(view)
    const pick = (live.current.picks.get(view) ?? 0) + 1
    live.current.picks.set(view, pick)
    return pick
  }
  const current = (view: PhotoView, pick: number) =>
    live.current.mounted && live.current.picks.get(view) === pick

  const choose = async (view: PhotoView, file: File | undefined) => {
    if (!file) return
    const pick = release(view)
    setPhotoError(false)
    setSlot(view, { status: 'preparing' })
    try {
      const base64 = await preparePhoto(file, BODY_PHOTO_MAX_SIDE)
      if (!current(view, pick)) return
      const url = URL.createObjectURL(file)
      live.current.urls.set(view, url)
      setSlot(view, { status: 'ready', url, base64 })
    } catch {
      if (!current(view, pick)) return
      setSlot(view, { status: 'empty' })
      setPhotoError(true)
    }
  }

  const remove = (view: PhotoView) => {
    release(view)
    setSlot(view, { status: 'empty' })
  }

  const photos: BodyPhoto[] = PHOTO_SLOTS.flatMap(({ view }) => {
    const slot = slots[view]
    return slot.status === 'ready' ? [{ view, base64: slot.base64 }] : []
  })
  const preparing = PHOTO_SLOTS.some(({ view }) => slots[view].status === 'preparing')
  const analyzing = phase.kind === 'analyzing'

  const analyze = async () => {
    if (apiKey === null || weightKg === null || photos.length === 0) return
    const signal = begin()
    const model = settings.aiModel
    const date = todayISO()
    setPhase({ kind: 'analyzing' })
    let data: CoachData
    try {
      data = await loadCoachData(date)
    } catch {
      if (!signal.aborted) setPhase({ kind: 'problem', problem: 'failed' })
      return
    }
    // Annulée entre-temps : le client lève l'annulation avant d'envoyer quoi que ce soit.
    const result = await askStructured({
      apiKey,
      model,
      ...bodyPrompt({ data, photos }),
      schema: bodyReviewOutput,
      effort: 'medium',
      signal,
    })
    // Compté avant d'afficher le résultat, même inutilisable : la réponse est facturée.
    await recordCallUsage(result.usage, model)
    if (signal.aborted) return
    if (!result.ok) {
      setPhase({ kind: 'problem', problem: result.problem })
      return
    }
    if (!result.value.readable) {
      setPhase({
        kind: 'unreadable',
        text: frenchSpacing(cutText(result.value.problem, 300) || UNREADABLE_DEFAULT),
      })
      return
    }
    const review = bodyReviewFrom({ raw: result.value, profile, weightKg, goals, date, model, now: nowISO() })
    try {
      if (review === null) throw new Error('Objectifs impossibles à calculer.')
      await saveBodyReview(review)
    } catch {
      setPhase({ kind: 'problem', problem: 'failed' })
      return
    }
    setPhase({ kind: 'ready' })
  }

  const stop = () => {
    cancel()
    setPhase({ kind: 'ready' })
  }

  const latest = reviews[0]?.date === today && !analyzing ? reviews[0] : undefined

  return (
    <Page {...pageProps}>
      <p className="mb-5 flex gap-2.5 rounded-2xl bg-surface px-4 py-3 text-[14px] text-ink-2">
        <Info size={18} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
        <span>{BODY_DISCLAIMER}</span>
      </p>

      {gate === 'noKey' && <KeyNeeded />}
      {(gate === 'noBirthYear' || gate === 'noHeight') && (
        <EmptyState
          icon={<UserRound size={36} aria-hidden />}
          title={GATE_TEXT[gate]}
          action={<ButtonLink to="/more/profile">Compléter mon profil</ButtonLink>}
        />
      )}
      {gate === 'minor' && <EmptyState icon={<UserRound size={36} aria-hidden />} title={GATE_TEXT.minor} />}
      {gate === 'noWeight' && (
        <EmptyState
          icon={<Scale size={36} aria-hidden />}
          title={GATE_TEXT.noWeight}
          action={
            <Button
              onClick={() => {
                setWeighing(true)
              }}
            >
              Noter mon poids
            </Button>
          }
        />
      )}

      {gate === null && (
        <>
          <Section title="Tes photos">
            <ul className="grid grid-cols-3 gap-3">
              {PHOTO_SLOTS.map(({ view, label }) => {
                const slot = slots[view]
                return (
                  <li key={view} className="relative">
                    <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl focus-within:outline-2">
                      <input
                        id={`${inputId}-${view}`}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={analyzing}
                        onChange={(e) => {
                          void choose(view, e.target.files?.[0])
                          e.target.value = ''
                        }}
                      />
                      <span className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl bg-surface text-ink-3">
                        {slot.status === 'ready' ? (
                          <img src={slot.url} alt="" className="size-full object-cover" />
                        ) : slot.status === 'preparing' ? (
                          <LoaderCircle size={26} className="animate-spin" aria-hidden />
                        ) : (
                          <Camera size={26} aria-hidden />
                        )}
                      </span>
                      <span className="text-[14px] font-medium text-ink-2">{label}</span>
                    </label>
                    {slot.status === 'ready' && (
                      <IconButton
                        label={removePhotoLabel(view)}
                        variant="filled"
                        size="sm"
                        className="absolute top-1.5 right-1.5"
                        disabled={analyzing}
                        onClick={() => {
                          remove(view)
                        }}
                      >
                        <X size={16} aria-hidden />
                      </IconButton>
                    )}
                  </li>
                )
              })}
            </ul>
            {photoError && (
              <p role="alert" className="mt-3 px-1 text-[14px] font-medium text-danger">
                {UNREADABLE_PHOTO}
              </p>
            )}
            <p className="mt-3 px-1 text-[13px] text-ink-3">{PHOTO_NOTE}</p>
          </Section>

          {analyzing ? (
            <div className="mb-6 flex flex-col gap-3">
              <div className="flex items-center gap-2.5 px-1">
                <LoaderCircle size={20} className="shrink-0 animate-spin text-ink-3" aria-hidden />
                <p role="status" className="text-[15px] text-ink-2">
                  {ANALYZING_TEXT}
                </p>
              </div>
              <Button variant="secondary" onClick={stop}>
                Annuler
              </Button>
            </div>
          ) : (
            <div className="mb-6">
              <Button
                block
                size="lg"
                icon={<Sparkles size={18} aria-hidden />}
                disabled={photos.length === 0 || preparing}
                onClick={() => void analyze()}
              >
                Analyser mes photos
              </Button>
              <CostHint action="body" />
            </div>
          )}

          {phase.kind === 'problem' && (
            <div className="mb-6">
              <AiProblemNote problem={phase.problem} task="body" onRetry={() => void analyze()} />
            </div>
          )}
          {phase.kind === 'unreadable' && (
            <p role="alert" className="mb-6 rounded-2xl bg-surface px-5 py-5 text-[15px] text-ink-2">
              {phase.text}
            </p>
          )}

          {latest && <ReviewResult review={latest} goals={goals} today={today} />}

          {reviews.length > 0 && (
            <Section title="Historique">
              <ListGroup>
                {reviews.map((review) => (
                  <ListRow
                    key={review.date}
                    title={historyTitle(review, today)}
                    subtitle={historyLine(review)}
                  />
                ))}
              </ListGroup>
            </Section>
          )}
        </>
      )}

      {weighing && (
        <WeightSheet
          lastKg={null}
          onClose={() => {
            setWeighing(false)
          }}
        />
      )}
    </Page>
  )
}

/** L'analyse du jour : phase conseillée, masse grasse, bilan, objectifs de la phase, et de quoi l'appliquer. */
function ReviewResult({
  review,
  goals,
  today,
}: {
  review: BodyReview
  goals: NutritionGoals
  today: ISODate
}) {
  const toast = useToast()
  const [resetOverrides, setResetOverrides] = useState(true)
  const [applying, setApplying] = useState(false)
  const overridden =
    goals.kcal !== null || goals.proteinG !== null || goals.carbsG !== null || goals.fatG !== null
  // Appliquée, tant que la phase n'a pas été changée depuis sur l'écran des objectifs.
  const appliedAt = goals.phase === review.phase ? review.appliedAt : null
  const guard = guardText(review)

  const apply = async () => {
    setApplying(true)
    try {
      await applyBodyReview(review.date, { resetOverrides: overridden && resetOverrides })
      toast('Phase appliquée à tes objectifs')
    } catch (e) {
      toast(userMessage(e, 'Enregistrement impossible, réessaie.'), 'error')
    } finally {
      setApplying(false)
    }
  }

  return (
    <>
      <Section title="Analyse du jour">
        <Card className="flex flex-col gap-3">
          <p className="text-[20px] leading-snug font-bold text-ink">{phaseAdviceText(review.phase)}</p>
          {guard && <p className="text-[15px] font-medium text-warning">{guard}</p>}
          <p className="text-[15px] text-ink">{bodyFatText(review.bodyFat)}</p>
          {review.summary !== '' && <p className="text-[15px] text-ink-2">{frenchSpacing(review.summary)}</p>}
          {review.observations.length > 0 && (
            <div>
              <h3 className="mb-1 text-[15px] font-semibold text-ink">Ce que voit le coach</h3>
              <ul className="list-disc pl-5 text-[15px] text-ink-2">
                {review.observations.map((line) => (
                  <li key={line}>{frenchSpacing(line)}</li>
                ))}
              </ul>
            </div>
          )}
          {review.advice.length > 0 && (
            <div>
              <h3 className="mb-1 text-[15px] font-semibold text-ink">Ses conseils</h3>
              <ul className="list-disc pl-5 text-[15px] text-ink-2">
                {review.advice.map((line) => (
                  <li key={line}>{frenchSpacing(line)}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </Section>

      <Section
        title="Objectifs pour cette phase"
        action={<CardLink to="/nutrition/targets">Mes objectifs</CardLink>}
      >
        <Card className="flex flex-col gap-4 px-2">
          <NutrientTiles
            nutrients={{
              kcal: review.targets.kcal,
              protein: review.targets.proteinG,
              carbs: review.targets.carbsG,
              fat: review.targets.fatG,
            }}
          />
        </Card>
      </Section>

      <Section>
        <div className="flex flex-col gap-3">
          {overridden && appliedAt === null && (
            <div className="rounded-2xl bg-surface">
              <Toggle
                label="Remplacer mes valeurs manuelles"
                checked={resetOverrides}
                onChange={setResetOverrides}
              />
            </div>
          )}
          {overridden && (appliedAt !== null || !resetOverrides) && (
            <p className="px-1 text-[14px] text-ink-2">Tes valeurs manuelles restent prioritaires.</p>
          )}
          {appliedAt !== null ? (
            <Button block size="lg" disabled icon={<Check size={18} aria-hidden />}>
              {appliedText(appliedAt, today)}
            </Button>
          ) : (
            <Button block size="lg" disabled={applying} onClick={() => void apply()}>
              Appliquer cette phase
            </Button>
          )}
        </div>
      </Section>
    </>
  )
}
