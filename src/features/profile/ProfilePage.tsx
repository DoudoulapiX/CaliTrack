import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ClipboardCheck } from 'lucide-react'
import { useProfile, useSettings } from '@/app/data-context'
import { useGoBack } from '@/app/useGoBack'
import { useSyncedDraft } from '@/app/useSyncedDraft'
import { frenchSpacing } from '@/lib/typography'
import {
  draftFromProfile,
  normalizeProfileDraft,
  profileDraftError,
  saveProfile,
  type ProfileDraft,
} from '@/db/profile'
import { Button, ButtonLink } from '@/ui/Button'
import { Page, Section } from '@/ui/Page'
import { useToast } from '@/ui/toast-context'
import { LevelTestResult } from './LevelTestForm'
import { FROM_NEW_PROGRAM } from './links'
import { ExperiencePicker, GoalFields, IdentityFields, PlanningFields } from './ProfileFields'

function sameDraft(a: ProfileDraft, b: ProfileDraft): boolean {
  return JSON.stringify(normalizeProfileDraft(a)) === JSON.stringify(normalizeProfileDraft(b))
}

export function ProfilePage() {
  const profile = useProfile()
  const settings = useSettings()
  const toast = useToast()
  const [params] = useSearchParams()
  const fromNewProgram = params.get('depuis') === FROM_NEW_PROGRAM
  const goBack = useGoBack(fromNewProgram ? '/training/new' : '/more')
  const saved = useMemo(() => draftFromProfile(profile), [profile])
  // Le profil peut changer pendant que l'écran est ouvert (test de niveau tout juste enregistré).
  const [draft, setDraft] = useSyncedDraft<ProfileDraft>(saved)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dirty = !sameDraft(draft, saved)

  const patch = (next: Partial<ProfileDraft>) => {
    setDraft((current) => ({ ...current, ...next }))
    setError(null)
  }

  const save = async () => {
    const problem = profileDraftError(draft)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    try {
      await saveProfile(draft)
      toast('Profil enregistré')
    } catch {
      setError(frenchSpacing('Enregistrement impossible : vérifie les valeurs saisies.'))
    } finally {
      setSaving(false)
    }
  }

  const { levelTest } = profile
  return (
    <Page
      title="Profil et niveau"
      back
      onBack={goBack}
      backLabel={fromNewProgram ? 'Retour' : 'Plus'}
      noTabBar
      className="pt-2"
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="px-1 text-center text-[14px] font-medium text-danger">
              {error}
            </p>
          )}
          <Button block size="lg" disabled={!dirty || saving} onClick={() => void save()}>
            Enregistrer
          </Button>
        </div>
      }
    >
      <Section title="Toi">
        <IdentityFields draft={draft} onChange={patch} weightUnit={settings.weightUnit} />
      </Section>
      <GoalFields draft={draft} onChange={patch} />
      <PlanningFields draft={draft} onChange={patch} />
      <Section title="Niveau">
        <ExperiencePicker
          value={draft.experience}
          onChange={(experience) => {
            patch({ experience })
          }}
        />
      </Section>
      <Section title="Test de niveau">
        <div className="flex flex-col gap-3">
          {levelTest ? (
            <LevelTestResult values={levelTest} date={levelTest.date} />
          ) : (
            <p className="px-1 text-[14px] text-ink-3">
              Pompes, tractions, dips, squats, gainage et suspension&nbsp;: six tests simples pour régler ton
              programme.
            </p>
          )}
          <ButtonLink
            to="/more/profile/test"
            variant="secondary"
            block
            icon={<ClipboardCheck size={18} aria-hidden />}
          >
            {levelTest ? 'Refaire le test' : 'Faire le test'}
          </ButtonLink>
        </div>
      </Section>
    </Page>
  )
}
