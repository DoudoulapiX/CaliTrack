import { memo, useDeferredValue, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight, Plus, SearchX, SlidersHorizontal, Star } from 'lucide-react'
import type { Exercise } from '@/db/types'
import {
  activeFilterCount,
  EMPTY_FILTER,
  equipmentSummary,
  filterExercises,
  initialOf,
  type ExerciseFilter,
} from '@/content/exercises/catalog'
import { MUSCLE_LABEL } from '@/content/exercises/labels'
import { useSettings } from '@/app/data-context'
import { useAvailableKinds } from '@/features/equipment/useAvailableKinds'
import { cn } from '@/lib/cn'
import { Button, IconButton } from '@/ui/Button'
import { Chip, EmptyState } from '@/ui/Controls'
import { Page } from '@/ui/Page'
import { LoadMore } from '@/ui/LoadMore'
import { SearchField } from '@/ui/SearchField'
import { ExerciseThumb } from './ExerciseThumb'
import { FilterSheet } from './FilterSheet'
import {
  LIBRARY_PAGE_SIZE,
  saveLibraryFilter,
  saveLibraryLimit,
  savedLibraryFilter,
  savedLibraryLimit,
} from './filter-store'
import { useCatalog } from './catalog-context'
import { useExerciseMetaIndex } from './useExerciseMeta'

function subtitleOf(exercise: Exercise): string {
  const muscles = exercise.primaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')
  const gear = equipmentSummary(exercise.equipment, 1)
  return muscles ? `${muscles} · ${gear}` : gear
}

const ExerciseRow = memo(function ExerciseRow({
  exercise,
  favorite,
}: {
  exercise: Exercise
  favorite: boolean
}) {
  return (
    <li className="cv-row">
      <Link
        to={`/library/${exercise.id}`}
        className="flex min-h-16 items-center gap-3 px-3 py-2 active:bg-surface-2"
      >
        <ExerciseThumb exercise={exercise} />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] leading-snug text-ink">{exercise.name}</span>{' '}
          <span className="mt-0.5 block truncate text-[13px] text-ink-3">{subtitleOf(exercise)}</span>
        </span>
        {favorite && (
          <>
            <Star size={16} className="shrink-0 fill-current text-accent-text" aria-hidden />
            <span className="sr-only">(favori)</span>
          </>
        )}
        <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
      </Link>
    </li>
  )
})

function ExerciseList({
  exercises,
  favoriteIds,
}: {
  exercises: readonly Exercise[]
  favoriteIds: ReadonlySet<string>
}) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
      {exercises.map((exercise) => (
        <ExerciseRow key={exercise.id} exercise={exercise} favorite={favoriteIds.has(exercise.id)} />
      ))}
    </ul>
  )
}

/** Regroupe une liste déjà triée par nom sous ses initiales. */
function byInitial(exercises: readonly Exercise[]): [string, Exercise[]][] {
  const groups = new Map<string, Exercise[]>()
  for (const exercise of exercises) {
    const letter = initialOf(exercise.name)
    const group = groups.get(letter)
    if (group) group.push(exercise)
    else groups.set(letter, [exercise])
  }
  return [...groups.entries()]
}

export function LibraryPage() {
  const navigate = useNavigate()
  const catalog = useCatalog()
  const meta = useExerciseMetaIndex()
  const settings = useSettings()
  const equipment = useAvailableKinds(settings.currentLocationId)
  const [filter, setFilterState] = useState(savedLibraryFilter)
  const [limit, setLimitState] = useState(savedLibraryLimit)
  const [sheetOpen, setSheetOpen] = useState(false)

  const setLimit = (next: number) => {
    saveLibraryLimit(next)
    setLimitState(next)
  }
  const setFilter = (next: ExerciseFilter) => {
    saveLibraryFilter(next)
    setFilterState(next)
    // Nouveaux critères : on repart du haut de la liste.
    setLimit(LIBRARY_PAGE_SIZE)
  }
  const toggle = (patch: Partial<ExerciseFilter>) => {
    setFilter({ ...filter, ...patch })
  }

  // La recherche reste fluide pendant la frappe : la liste suit avec un léger décalage.
  const deferred = useDeferredValue(filter)
  const results = useMemo(
    () =>
      filterExercises(catalog.all, deferred, {
        available: equipment.kinds,
        favoriteIds: meta.favoriteIds,
      }),
    [catalog.all, deferred, equipment.kinds, meta.favoriteIds],
  )
  const visible = results.slice(0, limit)
  const searching = deferred.query.trim() !== ''
  const filterCount = activeFilterCount(filter)
  const total = catalog.all.length

  return (
    <Page
      title="Exercices"
      large={false}
      actions={
        <IconButton
          label="Créer un exercice"
          onClick={() => {
            void navigate('/library/new')
          }}
        >
          <Plus size={24} aria-hidden />
        </IconButton>
      }
      toolbar={
        <div className="flex flex-col gap-2">
          <SearchField
            label="Rechercher un exercice"
            placeholder="Nom, muscle, matériel…"
            value={filter.query}
            onChange={(query) => {
              toggle({ query })
            }}
          />
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            <button
              type="button"
              onClick={() => {
                setSheetOpen(true)
              }}
              className={cn(
                'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium',
                filterCount > 0 ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-2 active:bg-surface-3',
              )}
            >
              <SlidersHorizontal size={15} aria-hidden />
              Filtres{filterCount > 0 ? ` (${filterCount})` : ''}
            </button>
            <Chip
              className="shrink-0"
              selected={filter.favorites}
              onToggle={() => {
                toggle({ favorites: !filter.favorites })
              }}
              icon={<Star size={15} aria-hidden />}
            >
              Favoris
            </Chip>
            <Chip
              className="shrink-0"
              selected={filter.equipment === 'mine'}
              onToggle={() => {
                toggle({ equipment: filter.equipment === 'mine' ? 'all' : 'mine' })
              }}
            >
              Mon matériel
            </Chip>
            <Chip
              className="shrink-0"
              selected={filter.equipment === 'none'}
              onToggle={() => {
                toggle({ equipment: filter.equipment === 'none' ? 'all' : 'none' })
              }}
            >
              Sans matériel
            </Chip>
            <Chip
              className="shrink-0"
              selected={filter.sources.length === 1 && filter.sources[0] === 'calitrack'}
              onToggle={() => {
                const only = filter.sources.length === 1 && filter.sources[0] === 'calitrack'
                toggle({ sources: only ? [] : ['calitrack'] })
              }}
            >
              Calisthénie
            </Chip>
          </div>
        </div>
      }
    >
      <p className="mb-2 px-1 text-[13px] text-ink-3" aria-live="polite">
        {results.length === total
          ? `${total} exercices`
          : `${results.length} exercice${results.length > 1 ? 's' : ''} sur ${total}`}
      </p>

      {results.length === 0 ? (
        <EmptyState
          icon={<SearchX size={32} aria-hidden />}
          title="Aucun exercice trouvé"
          text="Essaie un autre mot ou retire des filtres."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setFilter(EMPTY_FILTER)
              }}
            >
              Tout effacer
            </Button>
          }
        />
      ) : searching ? (
        <ExerciseList exercises={visible} favoriteIds={meta.favoriteIds} />
      ) : (
        byInitial(visible).map(([letter, exercises]) => (
          <section key={letter} aria-label={`Lettre ${letter}`} className="mb-4">
            <h2 className="px-1 pb-1 text-[13px] font-semibold text-ink-3">{letter}</h2>
            <ExerciseList exercises={exercises} favoriteIds={meta.favoriteIds} />
          </section>
        ))
      )}

      {visible.length < results.length && (
        <LoadMore
          remaining={results.length - visible.length}
          onMore={() => {
            setLimit(limit + LIBRARY_PAGE_SIZE)
          }}
        />
      )}

      <FilterSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false)
        }}
        filter={filter}
        onChange={setFilter}
        resultCount={results.length}
        hasInventory={equipment.hasInventory}
      />
    </Page>
  )
}
