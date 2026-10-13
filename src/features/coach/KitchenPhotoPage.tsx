import { useEffect, useId, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Camera, ImageOff, Sparkles } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { useGoBack } from '@/app/useGoBack'
import type { AiProblem } from '@/content/ai/client'
import { PANTRY_NAME_MAX, PANTRY_QUANTITY_MAX, readPantryPhoto } from '@/content/coach/kitchen'
import { applyPantryChanges } from '@/db/coach'
import type { PantryPlace } from '@/db/types'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { AiProblemNote } from '@/features/ai/AiProblemNote'
import { recordCallUsage } from '@/features/ai/ai-usage'
import { CostHint } from '@/features/ai/CostHint'
import { KeyNeeded } from '@/features/ai/KeyNeeded'
import { useAbortable } from '@/features/ai/useAbortable'
import { useAiKey } from '@/features/ai/useAiKey'
import { preparePhoto, UnreadablePhotoError } from '@/features/nutrition/photo'
import { Button } from '@/ui/Button'
import { Segmented } from '@/ui/Controls'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { useToast } from '@/ui/toast-context'
import {
  FROM_IDEAS,
  keptNames,
  modeHint,
  pantrySavedText,
  replaceLabel,
  reviewItems,
  savePantryLabel,
  type ReviewItem,
} from './kitchen-view'
import { PlacePicker } from './PantryItemSheet'

type Phase =
  | { kind: 'ready' }
  | { kind: 'analyzing' }
  | { kind: 'review'; items: ReviewItem[] }
  /** La photo ne s'ouvre pas : rien n'est envoyé. */
  | { kind: 'photoError'; text: string }
  /** Claude ne voit ni frigo ni aliments. */
  | { kind: 'unreadable'; reason: string }
  | { kind: 'problem'; problem: AiProblem }

type Mode = 'merge' | 'replace'

const INLINE_INPUT =
  'min-w-0 rounded-lg bg-surface-2 px-2.5 py-2 text-[16px] text-ink placeholder:text-ink-3 outline-none focus:ring-2 focus:ring-accent'

/** Photographier son frigo ou ses placards : Claude note les aliments, à vérifier avant de les enregistrer. */
export function KitchenPhotoPage() {
  const settings = useSettings()
  const apiKey = useAiKey()
  const toast = useToast()
  const [params] = useSearchParams()
  // Ouverte depuis les idées de repas : le retour (et l'enregistrement) y ramène.
  const fromIdeas = params.get('depuis') === FROM_IDEAS
  const goBack = useGoBack(fromIdeas ? '/nutrition/kitchen/ideas' : '/nutrition/kitchen')
  const { begin, cancel } = useAbortable()
  const inputId = useId()
  const [place, setPlace] = useState<PantryPlace>('fridge')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' })
  const [mode, setMode] = useState<Mode>('merge')
  const [saving, setSaving] = useState(false)
  // L'adresse de l'aperçu, libérée en quittant l'écran.
  const previewUrl = useRef<string | null>(null)
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    },
    [],
  )

  const choose = (chosen: File | undefined) => {
    if (!chosen) return
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = URL.createObjectURL(chosen)
    setPreview(previewUrl.current)
    setFile(chosen)
    setPhase({ kind: 'ready' })
  }

  const analyze = async () => {
    if (!file || !apiKey) return
    const signal = begin()
    // Relu après chaque attente : la demande a pu être annulée entre-temps.
    const stopped = () => signal.aborted
    setPhase({ kind: 'analyzing' })
    let imageBase64: string
    try {
      imageBase64 = await preparePhoto(file)
    } catch (e) {
      if (stopped()) return
      const text =
        e instanceof UnreadablePhotoError ? e.message : userMessage(e, 'Cette photo ne s’ouvre pas.')
      setPhase({ kind: 'photoError', text: frenchSpacing(text) })
      return
    }
    if (stopped()) return
    const model = settings.aiModel
    const result = await readPantryPhoto({ apiKey, model, imageBase64, place, signal })
    // Compté avant d'afficher le résultat, même inutilisable : la réponse est facturée.
    await recordCallUsage(result.usage, model)
    if (stopped()) return
    if (result.status === 'ok') setPhase({ kind: 'review', items: reviewItems(result.items) })
    else if (result.status === 'unreadable') {
      setPhase({ kind: 'unreadable', reason: frenchSpacing(result.reason) })
    } else setPhase({ kind: 'problem', problem: result.problem })
  }

  const stop = () => {
    cancel()
    setPhase({ kind: 'ready' })
  }

  const updateItem = (id: string, patch: Partial<ReviewItem>) => {
    setPhase((current) =>
      current.kind === 'review'
        ? { ...current, items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) }
        : current,
    )
  }

  const save = async (items: readonly ReviewItem[]) => {
    setSaving(true)
    try {
      const added = await applyPantryChanges({ place, names: keptNames(items), mode })
      toast(pantrySavedText(added, place))
      goBack()
    } catch (e) {
      setSaving(false)
      toast(userMessage(e, 'Enregistrement impossible, réessaie.'), 'error')
    }
  }

  const pageProps = {
    title: 'Photo du frigo',
    back: true,
    onBack: goBack,
    backLabel: fromIdeas ? 'Idées' : 'Frigo',
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
        <KeyNeeded />
      </Page>
    )
  }

  const picker = (label: string) => (
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
        {label}
      </label>
    </>
  )
  const choosePhoto = picker(file ? 'Changer de photo' : 'Prendre ou choisir une photo')
  const kept = phase.kind === 'review' ? keptNames(phase.items).length : 0

  return (
    <Page
      {...pageProps}
      footer={
        phase.kind === 'review' ? (
          <Button block size="lg" disabled={saving || kept === 0} onClick={() => void save(phase.items)}>
            {savePantryLabel(kept)}
          </Button>
        ) : undefined
      }
    >
      <div className="mb-4">
        <PlacePicker value={place} onChange={setPlace} />
      </div>

      {phase.kind !== 'review' &&
        (preview ? (
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
                'Ouvre la porte en grand et photographie les étagères d’assez près : Claude note ce qu’il reconnaît.',
              )}
            </p>
          </div>
        ))}

      {phase.kind === 'analyzing' && (
        <div className="flex flex-col gap-3">
          <p role="status" className="px-1 text-[15px] text-ink-2">
            Claude regarde ta photo…
          </p>
          <Button variant="secondary" onClick={stop}>
            Annuler
          </Button>
        </div>
      )}

      {phase.kind === 'ready' && (
        <div className="flex flex-col gap-3">
          {choosePhoto}
          {file && (
            <div>
              <Button
                block
                size="lg"
                icon={<Sparkles size={18} aria-hidden />}
                onClick={() => void analyze()}
              >
                Analyser la photo
              </Button>
              <CostHint action="fridge" />
            </div>
          )}
        </div>
      )}

      {phase.kind === 'photoError' && (
        <div className="flex flex-col gap-3">
          <p role="alert" className="px-1 text-[15px] text-danger">
            {phase.text}
          </p>
          {choosePhoto}
        </div>
      )}

      {phase.kind === 'unreadable' && (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface px-6 py-6 text-center">
          <ImageOff size={32} className="mb-1 text-ink-3" aria-hidden />
          <h2 className="text-[17px] font-semibold text-ink">Aucun aliment reconnu</h2>
          <p className="text-[14px] text-ink-2">{phase.reason}</p>
          <div className="mt-3 flex w-full flex-col gap-2">{picker('Reprendre une photo')}</div>
        </div>
      )}

      {phase.kind === 'problem' && (
        <div className="flex flex-col gap-3">
          <AiProblemNote problem={phase.problem} task="fridge" onRetry={() => void analyze()} />
          {choosePhoto}
        </div>
      )}

      {phase.kind === 'review' && (
        <>
          <Section title="Aliments vus">
            <ul
              aria-label="Aliments vus"
              className="divide-y divide-line overflow-hidden rounded-2xl bg-surface"
            >
              {phase.items.map((item, index) => {
                const label = item.name.trim() || `Aliment ${String(index + 1)}`
                return (
                  <li key={item.id}>
                    <div role="group" aria-label={label} className="flex items-center gap-3 py-2 pr-3 pl-4">
                      <input
                        type="checkbox"
                        checked={item.keep}
                        aria-label={`Garder ${label}`}
                        className="size-5 shrink-0 accent-accent"
                        onChange={(e) => {
                          updateItem(item.id, { keep: e.target.checked })
                        }}
                      />
                      <input
                        aria-label="Nom"
                        value={item.name}
                        maxLength={PANTRY_NAME_MAX}
                        autoCapitalize="sentences"
                        className={
                          item.keep
                            ? `${INLINE_INPUT} flex-[3]`
                            : `${INLINE_INPUT} flex-[3] text-ink-3 line-through`
                        }
                        onChange={(e) => {
                          updateItem(item.id, { name: e.target.value })
                        }}
                      />
                      <input
                        aria-label="Quantité"
                        placeholder="Quantité"
                        value={item.quantity}
                        maxLength={PANTRY_QUANTITY_MAX}
                        className={`${INLINE_INPUT} flex-[2]`}
                        onChange={(e) => {
                          updateItem(item.id, { quantity: e.target.value })
                        }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 px-1 text-[13px] text-ink-3">
              {frenchSpacing('Décoche ce qui n’y est pas, corrige un nom ou une quantité si besoin.')}
            </p>
          </Section>
          <Section title="Enregistrement">
            <Segmented
              label="Enregistrement"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'merge', label: 'Ajouter à la liste' },
                { value: 'replace', label: replaceLabel(place) },
              ]}
            />
            <p className="mt-2 px-1 text-[13px] text-ink-3">{modeHint(mode, place)}</p>
          </Section>
          {picker('Changer de photo')}
        </>
      )}
    </Page>
  )
}
