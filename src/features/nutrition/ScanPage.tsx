import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { PackageSearch, ScanBarcode } from 'lucide-react'
import { isMealKey, mealAt } from '@/content/nutrition/meals'
import { isValidBarcode, lookupBarcode, type OffLookup } from '@/content/nutrition/off'
import { foodByBarcode, saveFood } from '@/db/nutrition'
import type { MealKey } from '@/db/types'
import { nowISO, today as todayISO } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button, ButtonLink } from '@/ui/Button'
import { TextField } from '@/ui/Field'
import { Page } from '@/ui/Page'
import { useToast } from '@/ui/toast-context'
import {
  addFoodPath,
  afterFoodSaved,
  CAMERA_PROBLEM_TEXT,
  dayFromParam,
  newFoodPath,
  scanProblemText,
} from './nutrition-view'
import { useBarcodeScanner } from './useBarcodeScanner'

type Phase =
  | { kind: 'scan' }
  | { kind: 'looking'; code: string }
  | { kind: 'problem'; code: string; lookup: Exclude<OffLookup, { status: 'found' }> }

/** Scanner le code-barres d'un produit : il est cherché dans mes aliments, puis sur Open Food Facts. */
export function ScanPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const today = todayISO()
  const day = dayFromParam(params.get('day'), today)
  const mealParam = params.get('meal')
  const meal: MealKey = isMealKey(mealParam) ? mealParam : mealAt(new Date())
  const [phase, setPhase] = useState<Phase>({ kind: 'scan' })
  const [typed, setTyped] = useState('')
  const [typedError, setTypedError] = useState<string | null>(null)

  const search = async (code: string) => {
    setPhase({ kind: 'looking', code })
    try {
      // Déjà connu (créé à la main ou déjà scanné) : pas besoin d'internet.
      const known = await foodByBarcode(code)
      if (known) {
        void navigate(afterFoodSaved(known.id, day, meal), { replace: true })
        return
      }
      const lookup = await lookupBarcode(code, nowISO())
      if (lookup.status === 'found') {
        const saved = await saveFood(lookup.food)
        toast('Produit trouvé')
        void navigate(afterFoodSaved(saved.id, day, meal), { replace: true })
        return
      }
      setPhase({ kind: 'problem', code, lookup })
    } catch (e) {
      toast(userMessage(e, 'Recherche impossible, réessaie.'), 'error')
      setPhase({ kind: 'scan' })
    }
  }
  const { videoRef, state } = useBarcodeScanner(phase.kind === 'scan', (code) => void search(code))

  const submitTyped = () => {
    const code = typed.replace(/\s/g, '')
    if (!isValidBarcode(code)) {
      setTypedError(frenchSpacing('Ce code-barres n’est pas valable : vérifie les chiffres sous les barres.'))
      return
    }
    void search(code)
  }

  const problem = phase.kind === 'problem' ? scanProblemText(phase.lookup) : null
  const cameraProblem = state === 'denied' || state === 'unavailable' || state === 'error' ? state : null

  return (
    <Page title="Scanner un produit" back backTo={addFoodPath(day, meal)} backLabel="Ajouter" noTabBar>
      {phase.kind === 'problem' && problem ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface px-6 py-8 text-center">
          <PackageSearch size={36} className="mb-1 text-ink-3" aria-hidden />
          <h2 className="text-[17px] font-semibold text-ink">{problem.title}</h2>
          <p className="text-[14px] text-ink-2">{problem.text}</p>
          <p className="text-[13px] text-ink-3 tabular">Code {phase.code}</p>
          <div className="mt-3 flex w-full flex-col gap-2">
            {phase.lookup.status === 'offline' && (
              <Button block onClick={() => void search(phase.code)}>
                Réessayer
              </Button>
            )}
            <ButtonLink
              block
              variant={phase.lookup.status === 'offline' ? 'secondary' : 'primary'}
              replace
              to={newFoodPath({
                name: phase.lookup.status === 'incomplete' ? phase.lookup.name : undefined,
                brand: phase.lookup.status === 'incomplete' ? phase.lookup.brand : undefined,
                barcode: phase.code,
                day,
                meal,
              })}
            >
              {phase.lookup.status === 'incomplete' ? 'Compléter le produit' : 'Créer le produit'}
            </ButtonLink>
            <Button
              block
              variant="ghost"
              icon={<ScanBarcode size={18} aria-hidden />}
              onClick={() => {
                setTyped('')
                setPhase({ kind: 'scan' })
              }}
            >
              Scanner un autre produit
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              className="size-full object-cover"
              playsInline
              muted
              aria-label="Image de la caméra"
            />
            {/* Le cadre où placer le code-barres. */}
            <div
              className="pointer-events-none absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80"
              aria-hidden
            />
          </div>
          <p role="status" className="mb-6 px-1 text-[14px] text-ink-2">
            {phase.kind === 'looking'
              ? 'Recherche du produit…'
              : cameraProblem
                ? CAMERA_PROBLEM_TEXT[cameraProblem]
                : state === 'scanning'
                  ? 'Vise le code-barres du produit, bien à plat et éclairé.'
                  : 'Ouverture de la caméra…'}
          </p>
          <form
            className="flex flex-col gap-3 rounded-2xl bg-surface p-4"
            onSubmit={(e) => {
              e.preventDefault()
              submitTyped()
            }}
          >
            <TextField
              label="Ou tape le code"
              value={typed}
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              placeholder="Ex. 3017620422003"
              error={typedError}
              onChange={(value) => {
                setTyped(value)
                setTypedError(null)
              }}
            />
            <Button type="submit" variant="secondary" disabled={phase.kind === 'looking'}>
              Chercher
            </Button>
          </form>
        </>
      )}
      <p className="mt-6 px-1 text-[12px] text-ink-3">
        {frenchSpacing('Produits et valeurs : Open Food Facts, base libre et collaborative (licence ODbL).')}
      </p>
    </Page>
  )
}
