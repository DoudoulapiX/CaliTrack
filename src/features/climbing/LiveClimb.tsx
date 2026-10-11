import { useState } from 'react'
import { useNavigate } from 'react-router'
import { SlidersHorizontal } from 'lucide-react'
import { useGoBack } from '@/app/useGoBack'
import { finishedSession } from '@/content/climbing/session'
import { summarize } from '@/content/climbing/stats'
import { deleteClimb, updateClimb } from '@/db/climbing'
import type { ClimbingSession } from '@/db/types'
import { formatTimeOf, nowISO } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { Button, IconButton } from '@/ui/Button'
import { Page } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { useToast } from '@/ui/toast-context'
import { useNow } from '@/features/workout/useNow'
import { formatElapsed } from '@/features/workout/workout-view'
import { BoulderLog } from './BoulderLog'
import { ClimbInfoSheet } from './ClimbInfoSheet'
import { sendsLine } from './climb-view'
import { FinishClimbSheet, type FinishClimbValues } from './FinishClimbSheet'
import { useGradeScales } from './useClimbing'

/** Début, chrono et blocs réussis, sous le titre. */
function LiveStrip({ session }: { session: ClimbingSession }) {
  const now = useNow(1000)
  return (
    <div className="flex items-center justify-between gap-3 text-[14px] text-ink-2">
      <span>
        Depuis {formatTimeOf(session.startedAt)} ·{' '}
        <span className="font-semibold text-ink tabular">
          {formatElapsed((now - Date.parse(session.startedAt)) / 1000)}
        </span>
      </span>
      <span className="truncate">{sendsLine(summarize(session.boulders, null))}</span>
    </div>
  )
}

/** Séance d'escalade en cours : une touche sur la couleur d'un bloc pour le noter. */
export function LiveClimb({ session }: { session: ClimbingSession }) {
  const navigate = useNavigate()
  const toast = useToast()
  const scales = useGradeScales()
  const goBack = useGoBack('/climbing')
  const [sheet, setSheet] = useState<'finish' | 'info' | null>(null)
  const [busy, setBusy] = useState(false)
  if (!scales) return <PageSpinner />
  const scale = scales.find((s) => s.id === session.scaleId) ?? null
  const close = () => {
    setSheet(null)
  }

  const finish = async (values: FinishClimbValues) => {
    setBusy(true)
    try {
      await updateClimb(session.id, (s) => finishedSession(s, { ...values, endedAt: nowISO() }))
      toast('Séance enregistrée')
    } catch (error) {
      setBusy(false)
      toast(userMessage(error, 'Impossible d’enregistrer la séance.'), 'error')
    }
  }

  const abandon = async () => {
    // On quitte l'écran avant : la séance va disparaître.
    await navigate('/climbing', { replace: true })
    try {
      await deleteClimb(session.id)
      toast('Séance abandonnée')
    } catch (error) {
      toast(userMessage(error, 'Impossible d’abandonner la séance.'), 'error')
    }
  }

  return (
    <Page
      title={session.gym === '' ? 'Escalade' : session.gym}
      noTabBar
      large={false}
      onBack={goBack}
      backLabel="Escalade"
      actions={
        <IconButton
          label="Modifier la séance"
          onClick={() => {
            setSheet('info')
          }}
        >
          <SlidersHorizontal size={22} aria-hidden />
        </IconButton>
      }
      toolbar={<LiveStrip session={session} />}
      footer={
        <Button
          block
          size="lg"
          onClick={() => {
            setSheet('finish')
          }}
        >
          Terminer la séance
        </Button>
      }
      className="pt-2"
    >
      <BoulderLog session={session} scale={scale} palette="shown" showTime />

      {sheet === 'finish' && (
        <FinishClimbSheet
          session={session}
          scale={scale}
          busy={busy}
          onClose={close}
          onFinish={(values) => void finish(values)}
          onAbandon={() => void abandon()}
        />
      )}
      {sheet === 'info' && (
        <ClimbInfoSheet session={session} scales={scales} onClose={close} onAbandon={() => void abandon()} />
      )}
    </Page>
  )
}
