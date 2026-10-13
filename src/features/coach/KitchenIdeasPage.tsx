import { useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, ChevronRight, Clock, Sparkles } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { useGoBack } from '@/app/useGoBack'
import type { AiProblem } from '@/content/ai/client'
import { IDEA_REQUEST_MAX, proposeMealIdeas, remainingMacros, type MealIdea } from '@/content/coach/kitchen'
import { isMealKey, mealAt } from '@/content/nutrition/meals'
import { db } from '@/db/db'
import { addEntries, entryFromEstimate } from '@/db/nutrition'
import type { MealKey } from '@/db/types'
import { today as todayISO } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { AiProblemNote } from '@/features/ai/AiProblemNote'
import { recordCallUsage } from '@/features/ai/ai-usage'
import { CostHint } from '@/features/ai/CostHint'
import { KeyNeeded } from '@/features/ai/KeyNeeded'
import { useAbortable } from '@/features/ai/useAbortable'
import { useAiKey } from '@/features/ai/useAiKey'
import { MealPicker } from '@/features/nutrition/MealPicker'
import { NutrientTiles } from '@/features/nutrition/NutrientTiles'
import {
  addFoodPath,
  dayFromParam,
  journalPath,
  missingLine,
  totalOf,
} from '@/features/nutrition/nutrition-view'
import { addItemsLabel, itemsAddedText, keptTotal, photoItemLine } from '@/features/nutrition/photo-view'
import { PhotoItemSheet } from '@/features/nutrition/PhotoItemSheet'
import { useDayEntries, useTargets } from '@/features/nutrition/useNutrition'
import { Button, ButtonLink } from '@/ui/Button'
import { Card, CardTitle } from '@/ui/Card'
import { Badge, Toggle } from '@/ui/Controls'
import { TextField } from '@/ui/Field'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { useToast } from '@/ui/toast-context'
import {
  afterIdeaText,
  ideaReviewItems,
  ideaTotal,
  KITCHEN_PHOTO_FROM_IDEAS,
  minutesText,
  pantryCountText,
  remainingTitle,
  STRICT_EMPTY_TEXT,
  TO_BUY,
  type IdeaReviewItem,
} from './kitchen-view'

type Phase =
  | { kind: 'form' }
  | { kind: 'asking' }
  | { kind: 'ideas'; ideas: MealIdea[] }
  /**
   * Une idée choisie (`index` dans `ideas`), à vérifier avant de l'ajouter au journal ; les autres
   * restent à portée.
   */
  | { kind: 'review'; ideas: MealIdea[]; index: number; idea: MealIdea; items: IdeaReviewItem[] }
  | { kind: 'problem'; problem: AiProblem }

/** L'ancre de la carte d'une idée, pour y revenir après l'avoir choisie. */
const ideaAnchor = (index: number) => `idee-${String(index)}`

/**
 * Des idées de repas du coach, avec ce qu'il y a dans le frigo et ce qui reste à manger dans la journée.
 * L'idée choisie se vérifie comme une photo de repas, puis rejoint le journal.
 */
export function KitchenIdeasPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const settings = useSettings()
  const apiKey = useAiKey()
  const { begin, cancel } = useAbortable()
  const today = todayISO()
  const day = dayFromParam(params.get('day'), today)
  const mealParam = params.get('meal')
  // Venu de l'ajout d'un aliment (repas donné) : le retour y ramène.
  const askedMeal: MealKey | null = isMealKey(mealParam) ? mealParam : null
  const goBack = useGoBack(askedMeal ? addFoodPath(day, askedMeal) : '/nutrition/kitchen')
  const [meal, setMeal] = useState<MealKey>(askedMeal ?? mealAt(new Date()))
  const [request, setRequest] = useState('')
  const [strict, setStrict] = useState(true)
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  const [editing, setEditing] = useState<IdeaReviewItem | null>(null)
  const [saving, setSaving] = useState(false)
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), [])
  const targets = useTargets()
  const entries = useDayEntries(day)

  const pageProps = {
    title: 'Idées de repas',
    back: true,
    onBack: goBack,
    backLabel: askedMeal ? 'Ajouter' : 'Frigo',
  } as const

  if (apiKey === undefined || pantry === undefined || targets === undefined || entries === undefined) {
    return (
      <Page {...pageProps}>
        <PageSpinner />
      </Page>
    )
  }
  if (apiKey === null) {
    return (
      <Page {...pageProps}>
        <KeyNeeded />
      </Page>
    )
  }

  const remaining = targets.result.ok ? remainingMacros(targets.result.targets, totalOf(entries)) : null
  const blocked = strict && pantry.length === 0

  const ask = async () => {
    if (blocked) return
    const signal = begin()
    setPhase({ kind: 'asking' })
    const model = settings.aiModel
    const result = await proposeMealIdeas({
      apiKey,
      model,
      input: { pantry, request, remaining, meal, phase: targets.goals.phase, strict },
      signal,
    })
    // Compté avant d'afficher le résultat, même inutilisable : la réponse est facturée.
    await recordCallUsage(result.usage, model)
    if (signal.aborted) return
    setPhase(
      result.status === 'ok'
        ? { kind: 'ideas', ideas: result.ideas }
        : { kind: 'problem', problem: result.problem },
    )
  }

  const stop = () => {
    cancel()
    setPhase({ kind: 'form' })
  }

  const updateItems = (update: (items: IdeaReviewItem[]) => IdeaReviewItem[]) => {
    setPhase((current) =>
      current.kind === 'review' ? { ...current, items: update(current.items) } : current,
    )
  }

  const add = async (items: readonly IdeaReviewItem[]) => {
    const kept = items.filter((item) => item.keep)
    setSaving(true)
    try {
      await addEntries(kept.map((item) => entryFromEstimate(item, day, meal)))
      toast(itemsAddedText(kept.length, meal))
      void navigate(journalPath(day, today), { replace: true })
    } catch (e) {
      setSaving(false)
      toast(userMessage(e, 'Enregistrement impossible, réessaie.'), 'error')
    }
  }

  const remainingCard = (
    <Section title={remainingTitle(day, today)}>
      <Card>
        {remaining ? (
          <NutrientTiles nutrients={remaining} />
        ) : (
          <>
            <p className="text-[15px] font-semibold text-ink">Objectifs non définis</p>
            <p className="mt-1 text-[14px] text-ink-2">{missingLine(targets.result.missing)}</p>
          </>
        )}
      </Card>
    </Section>
  )

  if (phase.kind === 'review') {
    const keptCount = phase.items.filter((item) => item.keep).length
    const total = keptTotal(phase.items)
    const after = afterIdeaText(total, remaining)
    return (
      <Page
        {...pageProps}
        footer={
          <Button block size="lg" disabled={saving || keptCount === 0} onClick={() => void add(phase.items)}>
            {addItemsLabel(keptCount, meal)}
          </Button>
        }
      >
        <Section title={frenchSpacing(phase.idea.title)}>
          <ul
            aria-label="Ingrédients"
            className="divide-y divide-line overflow-hidden rounded-2xl bg-surface"
          >
            {phase.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 pl-4">
                <input
                  type="checkbox"
                  checked={item.keep}
                  aria-label={`Garder ${item.name}`}
                  className="size-5 shrink-0 accent-accent"
                  onChange={(e) => {
                    const keep = e.target.checked
                    updateItems((items) => items.map((i) => (i.id === item.id ? { ...i, keep } : i)))
                  }}
                />
                <button
                  type="button"
                  className="flex min-h-13 min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 text-left"
                  onClick={() => {
                    setEditing(item)
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={
                        item.keep ? 'block text-[16px] text-ink' : 'block text-[16px] text-ink-3 line-through'
                      }
                    >
                      {frenchSpacing(item.name)}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-ink-3">{photoItemLine(item)}</span>
                  </span>
                  {!item.fromPantry && <Badge tone="accent">{TO_BUY}</Badge>}
                  <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-[13px] text-ink-3">
            {frenchSpacing(
              'Ce sont des estimations : touche un ingrédient pour corriger sa quantité ou ses valeurs.',
            )}
          </p>
        </Section>
        <Section title="Total">
          <div className="rounded-2xl bg-surface px-2 py-3">
            <NutrientTiles nutrients={total} />
          </div>
          {after && <p className="mt-2 px-1 text-[13px] text-ink-3">{after}</p>}
        </Section>
        <MealPicker value={meal} onChange={setMeal} />
        <Button
          block
          variant="secondary"
          className="mt-6"
          onClick={() => {
            flushSync(() => {
              setPhase({ kind: 'ideas', ideas: phase.ideas })
            })
            // Retour à l'idée regardée, plus bas que le formulaire.
            document.getElementById(ideaAnchor(phase.index))?.scrollIntoView({ block: 'start' })
          }}
        >
          Revenir aux idées
        </Button>

        {editing && (
          <PhotoItemSheet
            item={editing}
            onClose={() => {
              setEditing(null)
            }}
            onSave={(saved) => {
              updateItems((items) => items.map((i) => (i.id === saved.id ? { ...i, ...saved } : i)))
              setEditing(null)
            }}
            onRemove={() => {
              updateItems((items) => items.map((i) => (i.id === editing.id ? { ...i, keep: false } : i)))
              setEditing(null)
            }}
          />
        )}
      </Page>
    )
  }

  return (
    <Page {...pageProps}>
      {remainingCard}

      <Section title="Ta demande">
        <div className="flex flex-col gap-4">
          <MealPicker value={meal} onChange={setMeal} />
          <TextField
            label={frenchSpacing('Une envie ? (facultatif)')}
            value={request}
            maxLength={IDEA_REQUEST_MAX}
            autoCapitalize="sentences"
            placeholder="Ex. quelque chose de chaud, sans four"
            onChange={setRequest}
          />
          <div className="overflow-hidden rounded-2xl bg-surface">
            <Toggle
              checked={strict}
              onChange={setStrict}
              label="Seulement avec ce que j’ai"
              description={pantryCountText(pantry.length)}
            />
          </div>
          {blocked && (
            <Link to="/nutrition/kitchen" className="px-1 text-[15px] font-medium text-accent-text">
              {STRICT_EMPTY_TEXT}
            </Link>
          )}
          {phase.kind === 'asking' ? (
            <div className="flex flex-col gap-3">
              <p role="status" className="px-1 text-[15px] text-ink-2">
                Le coach cherche des idées…
              </p>
              <Button variant="secondary" onClick={stop}>
                Annuler
              </Button>
            </div>
          ) : (
            <div>
              <Button
                block
                size="lg"
                disabled={blocked}
                icon={<Sparkles size={18} aria-hidden />}
                onClick={() => void ask()}
              >
                Proposer des idées
              </Button>
              <CostHint action="ideas" />
            </div>
          )}
        </div>
      </Section>

      {phase.kind === 'problem' && (
        <div className="mb-6">
          <AiProblemNote problem={phase.problem} task="ideas" onRetry={() => void ask()} />
        </div>
      )}

      {phase.kind === 'ideas' && (
        <Section title="Idées du coach">
          <div className="flex flex-col gap-3">
            {phase.ideas.map((idea, index) => {
              const after = afterIdeaText(ideaTotal(idea.items), remaining)
              return (
                <Card key={index} id={ideaAnchor(index)} className="scroll-mt-[calc(var(--safe-top)+3.5rem)]">
                  <CardTitle
                    level={3}
                    title={frenchSpacing(idea.title)}
                    action={
                      <Badge>
                        <Clock size={13} aria-hidden />
                        {minutesText(idea.minutes)}
                      </Badge>
                    }
                  />
                  {idea.why !== '' && <p className="text-[14px] text-ink-2">{frenchSpacing(idea.why)}</p>}
                  <div className="mt-3 rounded-xl bg-surface-2 px-2 py-3">
                    <NutrientTiles nutrients={ideaTotal(idea.items)} />
                  </div>
                  {after && <p className="mt-2 text-[13px] text-ink-3">{after}</p>}
                  <h4 className="mt-4 text-[13px] font-semibold text-ink-2">Ingrédients</h4>
                  <ul className="mt-1 flex flex-col gap-1 text-[14px] text-ink">
                    {idea.items.map((item, itemIndex) => (
                      <li key={itemIndex} className="flex flex-wrap items-center gap-x-2">
                        <span>{frenchSpacing(item.name)}</span>
                        <span className="text-ink-3">{photoItemLine(item)}</span>
                        {!item.fromPantry && <Badge tone="accent">{TO_BUY}</Badge>}
                      </li>
                    ))}
                  </ul>
                  {idea.steps.length > 0 && (
                    <>
                      <h4 className="mt-4 text-[13px] font-semibold text-ink-2">Étapes</h4>
                      <ol className="mt-1 list-decimal pl-5 text-[14px] text-ink">
                        {idea.steps.map((step, stepIndex) => (
                          <li key={stepIndex} className="mt-0.5">
                            {frenchSpacing(step)}
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                  <Button
                    block
                    className="mt-4"
                    aria-label={`Choisir ${idea.title}`}
                    onClick={() => {
                      setPhase({
                        kind: 'review',
                        ideas: phase.ideas,
                        index,
                        idea,
                        items: ideaReviewItems(idea.items),
                      })
                      // L'idée s'affiche à la place de la liste, plus courte : on la montre depuis le haut.
                      window.scrollTo(0, 0)
                    }}
                  >
                    Choisir
                  </Button>
                </Card>
              )
            })}
          </div>
        </Section>
      )}

      <ButtonLink to={KITCHEN_PHOTO_FROM_IDEAS} block variant="ghost" icon={<Camera size={18} aria-hidden />}>
        Mettre à jour mon frigo
      </ButtonLink>
    </Page>
  )
}
