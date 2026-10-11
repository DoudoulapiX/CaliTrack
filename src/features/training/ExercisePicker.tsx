import { useDeferredValue, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { canDoWith, EMPTY_FILTER, equipmentSummary, filterExercises } from '@/content/exercises/catalog'
import { formatTarget } from '@/content/programs/format'
import { ladderFor, type LadderStep } from '@/content/programs/ladders'
import type { EquipmentKind, Exercise } from '@/db/types'
import { cn } from '@/lib/cn'
import { Badge, Chip } from '@/ui/Controls'
import { LoadMore } from '@/ui/LoadMore'
import { SearchField } from '@/ui/SearchField'
import { ExerciseThumb } from '@/features/library/ExerciseThumb'
import { useCatalog } from '@/features/library/catalog-context'

const PAGE = 40
const NO_FAVORITES: ReadonlySet<string> = new Set()

function PickRow({
  exercise,
  current,
  missing,
  detail,
  onPick,
}: {
  exercise: Exercise
  current: boolean
  missing: boolean
  detail?: string
  onPick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={current ? 'true' : undefined}
        onClick={onPick}
        className={cn(
          'flex min-h-15 w-full items-center gap-3 px-3 py-2 text-left active:bg-surface-2',
          current && 'bg-accent-soft/60',
        )}
      >
        <ExerciseThumb exercise={exercise} className="size-11" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-snug text-ink">{exercise.name}</span>
          <span className="mt-0.5 block truncate text-[13px] text-ink-3">
            {detail ?? equipmentSummary(exercise.equipment, 1)}
          </span>
          {missing && (
            <Badge tone="warning" className="mt-1">
              Matériel manquant
            </Badge>
          )}
        </span>
        {current && <Check size={18} className="shrink-0 text-accent-text" aria-hidden />}
      </button>
    </li>
  )
}

/** « Étape 5 sur 6 · objectif 1 rép. » */
function stepDetail(step: LadderStep, index: number, total: number): string {
  const label = `Étape ${index + 1} sur ${total}`
  if (!step.goal) return label
  const { kind, value } = step.goal
  return `${label} · objectif ${formatTarget({ kind, min: value, max: value })}`
}

/**
 * Choix d'un exercice : les échelons de la progression en premier, puis tout le répertoire
 * (avec le matériel du lieu, ou sans filtre). Un échelon choisi est rendu avec son rang, car un même
 * exercice peut revenir plus haut avec un objectif plus dur (muscle-up : 1, puis 5).
 */
export function ExercisePicker({
  ladderId,
  currentId,
  currentStep = null,
  kinds,
  onPick,
}: {
  ladderId: string | null
  currentId: string | null
  /** Échelon en cours dans la progression (à partir de 0). */
  currentStep?: number | null
  kinds: ReadonlySet<EquipmentKind>
  onPick: (exercise: Exercise, stepIndex?: number) => void
}) {
  const catalog = useCatalog()
  const [query, setQuery] = useState('')
  const [mine, setMine] = useState(true)
  const [limit, setLimit] = useState(PAGE)
  const search = useDeferredValue(query)
  const ladder = ladderFor(ladderId)

  const results = useMemo(
    () =>
      filterExercises(
        catalog.all,
        { ...EMPTY_FILTER, query: search, equipment: mine ? 'mine' : 'all' },
        { available: kinds, favoriteIds: NO_FAVORITES },
      ),
    [catalog, search, mine, kinds],
  )

  const steps = ladder
    ? ladder.steps.flatMap((step, index) =>
        step.exerciseIds.flatMap((id) => {
          const exercise = catalog.byId.get(id)
          return exercise ? [{ exercise, index, detail: stepDetail(step, index, ladder.steps.length) }] : []
        }),
      )
    : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SearchField
          label="Rechercher un exercice"
          value={query}
          onChange={(value) => {
            setQuery(value)
            setLimit(PAGE)
          }}
        />
        <div>
          <Chip
            selected={mine}
            onToggle={() => {
              setMine(!mine)
              setLimit(PAGE)
            }}
          >
            Avec mon matériel
          </Chip>
        </div>
      </div>

      {ladder && search === '' && steps.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">
            Progression&nbsp;: {ladder.name}
          </h3>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface-2/50">
            {steps.map(({ exercise, index, detail }) => (
              <PickRow
                key={`${String(index)}-${exercise.id}`}
                exercise={exercise}
                current={exercise.id === currentId && (currentStep === null || index === currentStep)}
                missing={!canDoWith(exercise, kinds)}
                detail={detail}
                onPick={() => {
                  onPick(exercise, index)
                }}
              />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 px-1 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">
          {search === '' ? 'Tous les exercices' : 'Résultats'}
        </h3>
        {results.length === 0 ? (
          <p className="rounded-2xl bg-surface-2/50 px-4 py-6 text-center text-[14px] text-ink-3">
            Aucun exercice trouvé
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface-2/50">
            {results.slice(0, limit).map((exercise) => (
              <PickRow
                key={exercise.id}
                exercise={exercise}
                current={exercise.id === currentId}
                missing={!mine && !canDoWith(exercise, kinds)}
                onPick={() => {
                  onPick(exercise)
                }}
              />
            ))}
          </ul>
        )}
        {results.length > limit && (
          <LoadMore
            remaining={results.length - limit}
            onMore={() => {
              setLimit((n) => n + PAGE)
            }}
          />
        )}
      </section>
    </div>
  )
}
