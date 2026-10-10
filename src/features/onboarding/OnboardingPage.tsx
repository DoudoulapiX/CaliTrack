import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CalendarDays, Dumbbell, Mountain, Target } from 'lucide-react'
import { useProfile, useSettings } from '@/app/data-context'
import { useSyncedDraft } from '@/app/useSyncedDraft'
import { draftFromProfile, profileDraftError, type ProfileDraft } from '@/db/profile'
import { EMPTY_LEVEL_TEST, hasAnyResult, overallLevel, type LevelTestValues } from '@/content/level-test'
import { today } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'
import { ImportBackupButton } from '@/features/backup/ImportBackupButton'
import {
  ExperiencePicker,
  GoalFields,
  IdentityFields,
  PlanningFields,
} from '@/features/profile/ProfileFields'
import { LevelTestForm, LevelTestResult } from '@/features/profile/LevelTestForm'
import { Button } from '@/ui/Button'
import { Segmented } from '@/ui/Controls'
import { Page, Section } from '@/ui/Page'
import { useToast } from '@/ui/toast-context'
import { completeOnboarding, type PlaceDraft } from './complete'
import { PlacesStep } from './PlacesStep'
import { userMessage } from '@/lib/errors'

const STEPS = ['welcome', 'you', 'goals', 'planning', 'places', 'level'] as const
type Step = (typeof STEPS)[number]

const TITLE: Record<Step, string> = {
  welcome: 'Bienvenue',
  you: 'Toi',
  goals: 'Tes objectifs',
  planning: 'Ton planning',
  places: 'Ton matériel',
  level: 'Ton niveau',
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
        {icon}
      </span>
      <span>
        <span className="block text-[16px] font-semibold text-ink">{title}</span>
        <span className="block text-[14px] text-ink-3">{text}</span>
      </span>
    </li>
  )
}

/** Premier lancement : quelques questions pour préparer le profil, le matériel et le niveau. */
export function OnboardingPage() {
  const profile = useProfile()
  const settings = useSettings()
  const toast = useToast()
  const [index, setIndex] = useState(0)
  const saved = useMemo(() => draftFromProfile(profile), [profile])
  const [draft, setDraft] = useSyncedDraft<ProfileDraft>(saved)
  const [places, setPlaces] = useState<PlaceDraft[]>([])
  const [levelMode, setLevelMode] = useState<'test' | 'manual'>('test')
  const [test, setTest] = useState<LevelTestValues>(EMPTY_LEVEL_TEST)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const step: Step = STEPS[index] ?? 'welcome'

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [index])

  const patch = (next: Partial<ProfileDraft>) => {
    setDraft((current) => ({ ...current, ...next }))
    setError(null)
  }

  const stepError = (): string | null => {
    if (step === 'goals' && draft.focuses.length === 0) return 'Choisis au moins un objectif.'
    if (step === 'planning' && draft.trainingDays.length === 0)
      return 'Choisis au moins un jour d’entraînement.'
    return null
  }

  const finish = async () => {
    const tested = levelMode === 'test' && hasAnyResult(test)
    const final: ProfileDraft = {
      ...draft,
      experience: tested ? (overallLevel(test) ?? draft.experience) : draft.experience,
      levelTest: tested ? { date: today(), ...test } : draft.levelTest,
    }
    const problem = profileDraftError(final)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    try {
      await completeOnboarding(final, places)
      // L'appli quitte l'accueil d'elle-même dès que le réglage est enregistré.
      toast(frenchSpacing('Tout est prêt, bon entraînement !'), 'success')
    } catch (e) {
      setSaving(false)
      setError(
        userMessage(e, frenchSpacing('Enregistrement impossible : vérifie tes réponses puis réessaie.')),
      )
    }
  }

  const next = () => {
    const problem = stepError()
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    if (step === 'level') void finish()
    else setIndex(index + 1)
  }

  const footer = (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="px-1 text-center text-[14px] font-medium text-danger">
          {error}
        </p>
      )}
      <Button block size="lg" onClick={next} disabled={saving}>
        {step === 'welcome' ? 'Commencer' : step === 'level' ? 'Terminer' : 'Continuer'}
      </Button>
    </div>
  )

  return (
    <Page
      key={step}
      title={TITLE[step]}
      eyebrow={step === 'welcome' ? 'CaliTrack' : `Étape ${index} sur ${STEPS.length - 1}`}
      large
      noTabBar
      onBack={
        index > 0
          ? () => {
              setError(null)
              setIndex(index - 1)
            }
          : undefined
      }
      footer={footer}
    >
      {step === 'welcome' && (
        <div className="flex flex-col gap-6">
          <p className="text-[17px] text-ink-2">
            Ton coach de poche pour la calisthénie et l’escalade. Quelques questions pour tout préparer&nbsp;:
            tes réponses restent sur ton iPhone.
          </p>
          <ul className="flex flex-col gap-4">
            <Feature
              icon={<Dumbbell size={20} aria-hidden />}
              title="Un programme à ton niveau"
              text="Il progresse avec toi, séance après séance."
            />
            <Feature
              icon={<Target size={20} aria-hidden />}
              title="Tes objectifs en vue"
              text="Muscle-up, front lever, planche… étape par étape."
            />
            <Feature
              icon={<CalendarDays size={20} aria-hidden />}
              title="Ton calendrier"
              text="Programme, escalade et séances perso au même endroit."
            />
            <Feature
              icon={<Mountain size={20} aria-hidden />}
              title={`Escalade à ${settings.climbingGym}`}
              text="Tes blocs par couleur et ta progression."
            />
          </ul>
          <div className="flex flex-col gap-2 border-t border-line pt-5">
            <p className="px-1 text-[13px] text-ink-3">Tu as déjà une sauvegarde CaliTrack&nbsp;?</p>
            <ImportBackupButton label="Restaurer une sauvegarde" />
          </div>
        </div>
      )}

      {step === 'you' && (
        <div className="flex flex-col gap-4">
          <p className="px-1 text-[15px] text-ink-2">
            Tout est facultatif. Ton poids sert à suivre ta progression et, plus tard, tes besoins en
            calories.
          </p>
          <IdentityFields draft={draft} onChange={patch} weightUnit={settings.weightUnit} />
        </div>
      )}

      {step === 'goals' && <GoalFields draft={draft} onChange={patch} titled={false} />}

      {step === 'planning' && <PlanningFields draft={draft} onChange={patch} />}

      {step === 'places' && <PlacesStep places={places} onChange={setPlaces} />}

      {step === 'level' && (
        <div className="flex flex-col gap-5">
          <Segmented
            label="Comment évaluer ton niveau"
            value={levelMode}
            options={[
              { value: 'test', label: 'Faire le test' },
              { value: 'manual', label: 'Choisir moi-même' },
            ]}
            onChange={(mode) => {
              setLevelMode(mode)
              setError(null)
            }}
          />
          {levelMode === 'test' ? (
            <>
              <LevelTestForm
                values={test}
                onChange={setTest}
                available={new Set(places.flatMap((place) => place.kinds))}
              />
              <LevelTestResult values={test} />
              {!hasAnyResult(test) && (
                <p className="px-1 text-[13px] text-ink-3">
                  Sans résultat, tu commences au niveau débutant&nbsp;: tu pourras faire le test plus tard.
                </p>
              )}
            </>
          ) : (
            <Section title="Ton niveau actuel">
              <ExperiencePicker
                value={draft.experience}
                onChange={(experience) => {
                  patch({ experience })
                }}
              />
            </Section>
          )}
        </div>
      )}
    </Page>
  )
}
