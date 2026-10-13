import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Camera, ChevronRight, ImageOff, Sparkles } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { estimateMealPhoto } from '@/content/ai/meal-photo'
import { isMealKey, mealAt } from '@/content/nutrition/meals'
import { addEntries, entryFromEstimate } from '@/db/nutrition'
import type { MealKey } from '@/db/types'
import { today as todayISO } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { AI_PROBLEM_TEXT, AI_SETTINGS_PATH, canRetry, needsAiSettings } from '@/features/ai/ai-view'
import { recordCallUsage } from '@/features/ai/ai-usage'
import { useAiKey } from '@/features/ai/useAiKey'
import { Button, ButtonLink } from '@/ui/Button'
import { EmptyState } from '@/ui/Controls'
import { TextField } from '@/ui/Field'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { useToast } from '@/ui/toast-context'
import { MealPicker } from './MealPicker'
import { NutrientTiles } from './NutrientTiles'
import { addFoodPath, dayFromParam, journalPath } from './nutrition-view'
import { preparePhoto, UnreadablePhotoError } from './photo'
import {
  addItemsLabel,
  itemsAddedText,
  keptTotal,
  photoItemLine,
  photoItems,
  type PhotoItem,
} from './photo-view'
import { PhotoItemSheet } from './PhotoItemSheet'

/** Longueur maximale des précisions données à Claude. */
const NOTE_MAX = 200

type Phase =
  | { kind: 'ready' }
  | { kind: 'analyzing' }
  | { kind: 'result'; items: PhotoItem[] }
  | { kind: 'problem'; title: string; text: string; retry: boolean; settings: boolean }

/** Photographier son repas : Claude reconnaît les aliments et estime leurs valeurs, à vérifier avant l'ajout. */
export function PhotoPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const settings = useSettings()
  const apiKey = useAiKey()
  const inputId = useId()
  const today = todayISO()
  const day = dayFromParam(params.get('day'), today)
  const mealParam = params.get('meal')
  const [meal, setMeal] = useState<MealKey>(isMealKey(mealParam) ? mealParam : mealAt(new Date()))
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' })
  const [editing, setEditing] = useState<PhotoItem | null>(null)
  const [saving, setSaving] = useState(false)
  // L'analyse en cours et l'adresse de l'aperçu, arrêtée et libérée en quittant l'écran.
  const live = useRef<{ analysis: AbortController | null; previewUrl: string | null }>({
    analysis: null,
    previewUrl: null,
  })
  useEffect(() => {
    const current = live.current
    return () => {
      current.analysis?.abort()
      if (current.previewUrl) URL.revokeObjectURL(current.previewUrl)
    }
  }, [])

  const choose = (chosen: File | undefined) => {
    if (!chosen) return
    if (live.current.previewUrl) URL.revokeObjectURL(live.current.previewUrl)
    live.current.previewUrl = URL.createObjectURL(chosen)
    setPreview(live.current.previewUrl)
    setFile(chosen)
    setPhase({ kind: 'ready' })
  }

  const analyze = async () => {
    if (!file || !apiKey) return
    const controller = new AbortController()
    live.current.analysis = controller
    setPhase({ kind: 'analyzing' })
    let imageBase64: string
    try {
      imageBase64 = await preparePhoto(file)
    } catch (e) {
      const text =
        e instanceof UnreadablePhotoError ? e.message : userMessage(e, 'Cette photo ne s’ouvre pas.')
      setPhase({
        kind: 'problem',
        title: 'Photo illisible',
        text: frenchSpacing(text),
        retry: false,
        settings: false,
      })
      return
    }
    const result = await estimateMealPhoto({
      apiKey,
      model: settings.aiModel,
      imageBase64,
      note,
      signal: controller.signal,
    })
    // Compté avant d'afficher le résultat, même si l'analyse est annulée ou inutilisable : elle est facturée.
    await recordCallUsage(result.usage, settings.aiModel)
    if (controller.signal.aborted) return
    if (result.status === 'ok') setPhase({ kind: 'result', items: photoItems(result.items) })
    else if (result.status === 'notMeal') {
      setPhase({
        kind: 'problem',
        title: 'Aucun repas reconnu',
        text: frenchSpacing(result.reason),
        retry: false,
        settings: false,
      })
    } else {
      setPhase({
        kind: 'problem',
        title: 'Analyse impossible',
        text: AI_PROBLEM_TEXT[result.problem],
        retry: canRetry(result.problem),
        settings: needsAiSettings(result.problem),
      })
    }
  }

  const cancel = () => {
    live.current.analysis?.abort()
    setPhase({ kind: 'ready' })
  }

  const updateItems = (update: (items: PhotoItem[]) => PhotoItem[]) => {
    setPhase((current) =>
      current.kind === 'result' ? { ...current, items: update(current.items) } : current,
    )
  }

  const add = async (items: PhotoItem[]) => {
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

  const pageProps = {
    title: 'Photo du repas',
    back: true,
    backTo: addFoodPath(day, meal),
    backLabel: 'Ajouter',
    noTabBar: true,
  } as const

  if (apiKey === undefined) {
    return (
      <Page {...pageProps}>
        <PageSpinner />
      </Page>
    )
  }
  if (apiKey === null) {
    return (
      <Page {...pageProps}>
        <EmptyState
          icon={<Sparkles size={36} aria-hidden />}
          title="Ajoute ta clé Claude"
          text="L’analyse des photos passe par Claude, avec ta propre clé, gardée sur cet iPhone."
          action={<ButtonLink to={AI_SETTINGS_PATH}>Ajouter ma clé</ButtonLink>}
        />
      </Page>
    )
  }

  const picker = (
    <>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          choose(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <label
        htmlFor={inputId}
        className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 text-[16px] font-semibold text-accent-text focus-within:outline-2"
      >
        <Camera size={20} aria-hidden />
        {file ? 'Changer de photo' : 'Prendre ou choisir une photo'}
      </label>
    </>
  )

  return (
    <Page
      {...pageProps}
      footer={
        phase.kind === 'result' ? (
          <div className="flex flex-col gap-2">
            <Button
              block
              size="lg"
              disabled={saving || phase.items.every((item) => !item.keep)}
              onClick={() => void add(phase.items)}
            >
              {addItemsLabel(phase.items.filter((item) => item.keep).length, meal)}
            </Button>
          </div>
        ) : undefined
      }
    >
      {preview ? (
        <img
          src={preview}
          alt="Ta photo"
          className="mb-4 aspect-[4/3] w-full rounded-2xl bg-surface object-cover"
        />
      ) : (
        <div className="mb-4 flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl bg-surface px-6 text-center">
          <Camera size={36} className="text-ink-3" aria-hidden />
          <p className="text-[14px] text-ink-2">
            {frenchSpacing(
              'Photographie ton assiette d’assez près, avec les couverts : ils aident à estimer les quantités.',
            )}
          </p>
        </div>
      )}

      {phase.kind === 'analyzing' && (
        <div className="flex flex-col gap-3">
          <p role="status" className="px-1 text-[15px] text-ink-2">
            Claude regarde ton assiette…
          </p>
          <Button variant="secondary" onClick={cancel}>
            Annuler
          </Button>
        </div>
      )}

      {phase.kind === 'ready' && (
        <div className="flex flex-col gap-3">
          {picker}
          {file && (
            <>
              <TextField
                label="Précisions (facultatif)"
                value={note}
                maxLength={NOTE_MAX}
                autoCapitalize="sentences"
                placeholder="Ex. cuit au beurre, sauce à part"
                onChange={setNote}
              />
              <Button size="lg" icon={<Sparkles size={18} aria-hidden />} onClick={() => void analyze()}>
                Analyser la photo
              </Button>
            </>
          )}
        </div>
      )}

      {phase.kind === 'problem' && (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface px-6 py-6 text-center">
          <ImageOff size={32} className="mb-1 text-ink-3" aria-hidden />
          <h2 className="text-[17px] font-semibold text-ink">{phase.title}</h2>
          <p className="text-[14px] text-ink-2">{phase.text}</p>
          <div className="mt-3 flex w-full flex-col gap-2">
            {phase.retry && (
              <Button block onClick={() => void analyze()}>
                Réessayer
              </Button>
            )}
            {phase.settings && (
              <ButtonLink block to={AI_SETTINGS_PATH}>
                Réglages de l’IA
              </ButtonLink>
            )}
            {picker}
          </div>
        </div>
      )}

      {phase.kind === 'result' && (
        <>
          <Section title="Aliments reconnus" className="mt-2">
            <ul
              aria-label="Aliments reconnus"
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
                    onClick={() => setEditing(item)}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={
                          item.keep
                            ? 'block text-[16px] text-ink'
                            : 'block text-[16px] text-ink-3 line-through'
                        }
                      >
                        {item.name}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-ink-3">{photoItemLine(item)}</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 px-1 text-[13px] text-ink-3">
              {frenchSpacing(
                'Ce sont des estimations : touche un aliment pour corriger sa quantité ou ses valeurs.',
              )}
            </p>
          </Section>
          <Section title="Total">
            <div className="rounded-2xl bg-surface px-2 py-3">
              <NutrientTiles nutrients={keptTotal(phase.items)} />
            </div>
          </Section>
          <MealPicker value={meal} onChange={setMeal} />
          <div className="mt-4">{picker}</div>
        </>
      )}

      {editing && (
        <PhotoItemSheet
          item={editing}
          onClose={() => setEditing(null)}
          onSave={(saved) => {
            updateItems((items) => items.map((i) => (i.id === saved.id ? saved : i)))
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
