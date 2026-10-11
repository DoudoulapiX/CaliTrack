import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import { deleteFood, MAX_GRAMS, saveFood } from '@/db/nutrition'
import type { Food } from '@/db/types'
import { nowISO } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { newId } from '@/lib/ids'
import { frenchSpacing, NBSP } from '@/lib/typography'
import { Button, IconButton } from '@/ui/Button'
import { EmptyState } from '@/ui/Controls'
import { NumberField, TextField } from '@/ui/Field'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { ConfirmSheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { foodFromForm, formFromFood, type FoodForm } from './food-form'
import { MacroFields } from './MacroFields'
import { afterFoodSaved } from './nutrition-view'
import { FOOD_NAME_MAX } from './QuickSheet'

function FoodEditor({ food, initial }: { food: Food | null; initial: FoodForm }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const toast = useToast()
  const [form, setForm] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const set =
    <K extends keyof FoodForm>(key: K) =>
    (value: FoodForm[K]) => {
      setForm((current) => ({ ...current, [key]: value }))
      setError(null)
    }

  const save = async () => {
    const result = foodFromForm(form, food, newId(), nowISO())
    if (!result.ok) {
      setError(result.error)
      return
    }
    setBusy(true)
    try {
      const saved = await saveFood(result.food)
      toast(food ? 'Aliment modifié' : 'Aliment créé')
      if (food) void navigate(-1)
      else void navigate(afterFoodSaved(saved.id, params.get('day'), params.get('meal')), { replace: true })
    } catch (e) {
      setBusy(false)
      setError(userMessage(e, 'Enregistrement impossible, réessaie.'))
    }
  }

  const remove = async () => {
    if (!food) return
    try {
      await deleteFood(food.id)
      toast('Aliment supprimé')
      void navigate('/nutrition/foods', { replace: true })
    } catch (e) {
      setError(userMessage(e, 'Suppression impossible, réessaie.'))
    }
  }

  return (
    <Page
      title={food ? 'Modifier l’aliment' : 'Nouvel aliment'}
      back
      backLabel="Annuler"
      noTabBar
      actions={
        food ? (
          <IconButton
            label="Supprimer l’aliment"
            onClick={() => {
              setConfirming(true)
            }}
          >
            <Trash2 size={20} aria-hidden />
          </IconButton>
        ) : undefined
      }
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-[14px] font-medium text-danger">
              {error}
            </p>
          )}
          <Button block size="lg" disabled={busy} onClick={() => void save()}>
            Enregistrer
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {food?.source === 'off' && (
          <p className="mb-4 rounded-xl bg-surface px-4 py-3 text-[14px] text-ink-2">
            {frenchSpacing('Fiche venue d’Open Food Facts : tes corrections remplaceront ses valeurs.')}
          </p>
        )}
        <Section>
          <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
            <TextField
              label="Nom"
              value={form.name}
              maxLength={FOOD_NAME_MAX}
              autoCapitalize="sentences"
              placeholder="Ex. Granola maison"
              onChange={set('name')}
            />
            <TextField
              label="Marque (facultatif)"
              value={form.brand}
              maxLength={FOOD_NAME_MAX}
              autoCapitalize="words"
              onChange={set('brand')}
            />
          </div>
        </Section>
        <Section title="Valeurs nutritionnelles">
          <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
            <p className="px-1 text-[14px] text-ink-2">{`Pour 100${NBSP}g, comme sur l’étiquette.`}</p>
            <MacroFields value={form.macros} onChange={set('macros')} />
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Fibres"
                value={form.fiber}
                decimal
                min={0}
                max={100}
                suffix="g"
                placeholder="—"
                onChange={set('fiber')}
              />
              <NumberField
                label="Dont sucres"
                value={form.sugars}
                decimal
                min={0}
                max={100}
                suffix="g"
                placeholder="—"
                onChange={set('sugars')}
              />
              <NumberField
                label="Dont saturés"
                value={form.satFat}
                decimal
                min={0}
                max={100}
                suffix="g"
                placeholder="—"
                onChange={set('satFat')}
              />
              <NumberField
                label="Sel"
                value={form.salt}
                decimal
                min={0}
                max={100}
                suffix="g"
                placeholder="—"
                onChange={set('salt')}
              />
            </div>
          </div>
        </Section>
        <Section>
          <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
            <NumberField
              label="Portion habituelle (facultatif)"
              value={form.servingG}
              decimal
              min={1}
              max={MAX_GRAMS}
              suffix="g"
              hint="Proposée en un geste quand tu notes cet aliment."
              onChange={set('servingG')}
            />
            <TextField
              label="Code-barres (facultatif)"
              value={form.barcode}
              inputMode="numeric"
              maxLength={14}
              autoComplete="off"
              hint="Pour le retrouver en scannant le produit."
              onChange={set('barcode')}
            />
          </div>
        </Section>
      </form>
      <ConfirmSheet
        open={confirming}
        onClose={() => {
          setConfirming(false)
        }}
        onConfirm={() => void remove()}
        title="Supprimer cet aliment ?"
        message="Les repas où tu l’as déjà noté le gardent."
        confirmLabel="Supprimer"
      />
    </Page>
  )
}

/** Créer un aliment perso, ou corriger un aliment perso ou un produit scanné. */
export function FoodEditPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const food = useLiveQuery(async () => (id ? ((await db.foods.get(id)) ?? null) : null), [id])
  if (food === undefined) return <PageSpinner />
  if (id && food === null) {
    return (
      <Page title="Aliment" back backTo="/nutrition/foods" backLabel="Mes aliments">
        <EmptyState title="Aliment introuvable" text="Il a peut-être été supprimé." />
      </Page>
    )
  }
  const prefill = {
    name: params.get('name') ?? undefined,
    brand: params.get('brand') ?? undefined,
    barcode: params.get('barcode') ?? undefined,
  }
  return <FoodEditor key={food?.id ?? 'new'} food={food} initial={formFromFood(food, prefill)} />
}
