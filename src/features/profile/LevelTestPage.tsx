import { useState } from 'react'
import { useProfile } from '@/app/data-context'
import { useGoBack } from '@/app/useGoBack'
import { saveLevelTest } from '@/db/profile'
import { EMPTY_LEVEL_TEST, hasAnyResult, overallLevel, type LevelTestValues } from '@/content/level-test'
import { EXPERIENCE_LABEL } from '@/content/profile'
import { useAvailableKinds } from '@/features/equipment/useAvailableKinds'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { Page } from '@/ui/Page'
import { useToast } from '@/ui/toast-context'
import { LevelTestForm, LevelTestResult } from './LevelTestForm'

export function LevelTestPage() {
  const profile = useProfile()
  const equipment = useAvailableKinds(null)
  const goBack = useGoBack('/more/profile')
  const toast = useToast()
  const [values, setValues] = useState<LevelTestValues>(EMPTY_LEVEL_TEST)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await saveLevelTest(values)
      const level = overallLevel(values)
      toast(level ? frenchSpacing(`Test enregistré : niveau ${EXPERIENCE_LABEL[level]}`) : 'Test enregistré')
      goBack()
    } catch {
      setSaving(false)
      toast('Enregistrement impossible', 'error')
    }
  }

  return (
    <Page
      title="Test de niveau"
      back
      backTo="/more/profile"
      backLabel="Profil"
      noTabBar
      className="pt-2"
      footer={
        <Button block size="lg" disabled={!hasAnyResult(values) || saving} onClick={() => void save()}>
          Enregistrer le test
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <LevelTestForm
          values={values}
          onChange={setValues}
          available={equipment.loading ? undefined : equipment.kinds}
          previous={profile.levelTest}
        />
        <LevelTestResult values={values} />
      </div>
    </Page>
  )
}
