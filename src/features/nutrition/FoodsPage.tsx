import { Plus, Salad } from 'lucide-react'
import { ButtonLink } from '@/ui/Button'
import { EmptyState } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { Page } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { per100Line } from './nutrition-view'
import { useFoods } from './useNutrition'

/** Mes aliments : ceux que j'ai créés et les produits scannés, à corriger ou supprimer. */
export function FoodsPage() {
  const foods = useFoods()
  if (foods === undefined) return <PageSpinner />
  return (
    <Page
      title="Mes aliments"
      back
      backTo="/nutrition"
      backLabel="Nutrition"
      actions={
        <ButtonLink to="/nutrition/foods/new" variant="ghost" size="sm" icon={<Plus size={18} aria-hidden />}>
          Créer
        </ButtonLink>
      }
    >
      {foods.length === 0 ? (
        <EmptyState
          icon={<Salad size={36} aria-hidden />}
          title="Aucun aliment perso"
          text="Crée un aliment avec ses valeurs, ou scanne un produit : il s’ajoute ici."
          action={<ButtonLink to="/nutrition/foods/new">Créer un aliment</ButtonLink>}
        />
      ) : (
        <ListGroup>
          {foods.map((food) => (
            <ListRow
              key={food.id}
              title={food.name}
              subtitle={[food.brand, per100Line(food.per100)].filter(Boolean).join(' · ')}
              to={`/nutrition/foods/${encodeURIComponent(food.id)}`}
            />
          ))}
        </ListGroup>
      )}
    </Page>
  )
}
