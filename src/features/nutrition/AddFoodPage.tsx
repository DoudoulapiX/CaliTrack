import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Camera, PenLine, Plus, Refrigerator, ScanBarcode, SearchX } from 'lucide-react'
import { foodItem, searchFoods, type FoodItem } from '@/content/nutrition/foods'
import { isMealKey, mealAt } from '@/content/nutrition/meals'
import type { MealKey } from '@/db/types'
import { today as todayISO } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { EmptyState } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { SearchField } from '@/ui/SearchField'
import { useToast } from '@/ui/toast-context'
import { dayFromParam, journalPath, mealTo, newFoodPath, per100Line } from './nutrition-view'
import { QuantitySheet } from './QuantitySheet'
import { QuickSheet } from './QuickSheet'
import { useCiqual, useFoods, useRecentFoods } from './useNutrition'

/** Résultats montrés pour une recherche. */
const RESULT_LIMIT = 50

const SHORTCUT_CLASS =
  'flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-surface px-2 py-3 text-center text-[14px] font-medium text-ink active:bg-surface-2'
/** La même tuile, sur toute la largeur de la grille. */
const WIDE_SHORTCUT_CLASS =
  'col-span-2 flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-surface px-2 py-3 text-center text-[14px] font-medium text-ink active:bg-surface-2'

function Shortcut({
  to,
  onClick,
  icon,
  label,
  wide = false,
}: {
  to?: string
  onClick?: () => void
  icon: ReactNode
  label: string
  /** Sur toute la largeur de la grille. */
  wide?: boolean
}) {
  const className = wide ? WIDE_SHORTCUT_CLASS : SHORTCUT_CLASS
  const content = (
    <>
      <span className="text-accent-text">{icon}</span>
      {label}
    </>
  )
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  )
}

function FoodList({ items, onPick }: { items: FoodItem[]; onPick: (item: FoodItem) => void }) {
  return (
    <ListGroup className="mb-6">
      {items.map((item) => (
        <ListRow
          key={item.id}
          title={item.name}
          subtitle={item.detail ? `${item.detail} · ${per100Line(item.per100)}` : per100Line(item.per100)}
          onClick={() => {
            onPick(item)
          }}
          chevron={false}
          trailing={<Plus size={20} className="text-accent-text" aria-hidden />}
        />
      ))}
    </ListGroup>
  )
}

/** Ajouter un aliment à un repas : recherche dans la table Ciqual et mes aliments, récents, saisie rapide. */
export function AddFoodPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const today = todayISO()
  const day = dayFromParam(params.get('day'), today)
  const mealParam = params.get('meal')
  const meal: MealKey = isMealKey(mealParam) ? mealParam : mealAt(new Date())
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [picked, setPicked] = useState<FoodItem | null>(null)
  const [quick, setQuick] = useState(false)
  const [added, setAdded] = useState(0)
  const ciqual = useCiqual()
  const foods = useFoods()
  const recents = useRecentFoods()
  // Un aliment tout juste créé ou scanné : on propose aussitôt sa quantité.
  const foodParam = params.get('food')
  const [handledFood, setHandledFood] = useState<string | null>(null)
  if (foodParam !== null && foodParam !== handledFood && foods !== undefined) {
    setHandledFood(foodParam)
    const food = foods.find((candidate) => candidate.id === foodParam)
    if (food) setPicked(foodItem(food))
  }

  const searching = deferredQuery.trim() !== ''
  const results = useMemo(() => {
    if (!searching || ciqual.state.status !== 'ready' || foods === undefined) return null
    return searchFoods([...foods.map(foodItem), ...ciqual.state.items], deferredQuery, RESULT_LIMIT)
  }, [searching, ciqual.state, foods, deferredQuery])

  const onAdded = (to: MealKey) => {
    setPicked(null)
    setQuick(false)
    setAdded((count) => count + 1)
    toast(`Ajouté ${mealTo(to)}`)
  }
  const query1 = query.trim()
  const addLabel = `Ajouter ${mealTo(meal)}`

  return (
    <Page
      title={addLabel}
      back
      backTo={journalPath(day, today)}
      backLabel="Journal"
      toolbar={<SearchField value={query} onChange={setQuery} label="Chercher un aliment" />}
      footer={
        added > 0 ? (
          <Button block size="lg" onClick={() => void navigate(journalPath(day, today))}>
            Terminé
          </Button>
        ) : undefined
      }
    >
      {!searching ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <Shortcut
              to={`/nutrition/scan?day=${day}&meal=${meal}`}
              icon={<ScanBarcode size={24} aria-hidden />}
              label="Scanner un produit"
            />
            <Shortcut
              to={`/nutrition/photo?day=${day}&meal=${meal}`}
              icon={<Camera size={24} aria-hidden />}
              label="Photo du repas"
            />
            <Shortcut
              onClick={() => {
                setQuick(true)
              }}
              icon={<PenLine size={24} aria-hidden />}
              label="Saisie rapide"
            />
            <Shortcut
              to={newFoodPath({ day, meal })}
              icon={<Plus size={24} aria-hidden />}
              label="Créer un aliment"
            />
            <Shortcut
              wide
              to={`/nutrition/kitchen/ideas?day=${day}&meal=${meal}`}
              icon={<Refrigerator size={24} aria-hidden />}
              label="Idées avec mon frigo"
            />
          </div>
          {recents && recents.length > 0 ? (
            <Section title="Récents">
              <FoodList items={recents} onPick={setPicked} />
            </Section>
          ) : (
            <p className="px-1 text-[14px] text-ink-3">
              {frenchSpacing(
                'Cherche parmi plus de 3 000 aliments de la table Ciqual, ou scanne le code-barres d’un produit.',
              )}
            </p>
          )}
        </>
      ) : ciqual.state.status === 'error' ? (
        <EmptyState
          title="Liste des aliments indisponible"
          text="Vérifie ta connexion puis réessaie."
          action={<Button onClick={ciqual.retry}>Réessayer</Button>}
        />
      ) : results === null ? (
        <p role="status" className="px-1 text-[14px] text-ink-3">
          Recherche…
        </p>
      ) : results.length === 0 ? (
        <EmptyState
          icon={<SearchX size={36} aria-hidden />}
          title="Aucun aliment trouvé"
          text="Essaie un autre mot, ou crée cet aliment avec ses valeurs."
          action={
            <Link to={newFoodPath({ name: query1, day, meal })} className="font-medium text-accent-text">
              {frenchSpacing(`Créer « ${query1} »`)}
            </Link>
          }
        />
      ) : (
        <FoodList items={results} onPick={setPicked} />
      )}
      {picked && (
        <QuantitySheet
          key={picked.id}
          item={picked}
          day={day}
          meal={meal}
          onClose={() => {
            setPicked(null)
          }}
          onAdded={onAdded}
        />
      )}
      {quick && (
        <QuickSheet
          day={day}
          meal={meal}
          onClose={() => {
            setQuick(false)
          }}
          onAdded={onAdded}
        />
      )}
    </Page>
  )
}
