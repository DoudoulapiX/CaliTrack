import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, Pencil, Trash2, Trophy } from 'lucide-react'
import { useGoBack } from '@/app/useGoBack'
import { fontOf } from '@/content/climbing/labels'
import { recordsBeaten, summarize, type ClimbRecord } from '@/content/climbing/stats'
import { deleteClimb } from '@/db/climbing'
import type { ClimbingSession, GradeScale } from '@/db/types'
import { userMessage } from '@/lib/errors'
import { frenchSpacing, lowerFirst } from '@/lib/typography'
import { Button, IconButton } from '@/ui/Button'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { ConfirmSheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { ClimbingGoalAdvances } from '@/features/goals/GoalAdvances'
import { StatTiles } from '@/features/workout/StatTiles'
import { rpeLabel } from '@/features/workout/workout-view'
import { BoulderLog } from './BoulderLog'
import { ClimbInfoSheet } from './ClimbInfoSheet'
import { climbDateLine, climbTiles } from './climb-view'
import { useClimbs, useGradeScales } from './useClimbing'

function recordTitle(record: ClimbRecord): string {
  if (record.kind === 'hardest') return record.previous ? 'Niveau le plus dur réussi' : 'Premier bloc réussi'
  return record.previous ? 'Flash le plus dur' : 'Premier flash'
}

function recordLine(record: ClimbRecord): string {
  const font = fontOf(record.grade)
  const grade = font ? `${record.grade.label} (${font})` : record.grade.label
  return record.previous ? frenchSpacing(`${grade} · avant : ${lowerFirst(record.previous.label)}`) : grade
}

interface ContentProps {
  session: ClimbingSession
  scale: GradeScale | null
  climbs: readonly ClimbingSession[]
  scales: readonly GradeScale[]
  /** Les blocs se modifient (historique) ou se lisent seulement (bilan juste après la séance). */
  editable: boolean
}

function SummaryContent({ session, scale, climbs, scales, editable }: ContentProps) {
  const records = scale ? recordsBeaten(session, climbs, scale) : []
  const feeling = rpeLabel(session.rpe)
  return (
    <>
      <StatTiles
        items={climbTiles(summarize(session.boulders, scale), session.durationMin)}
        className="mb-6"
      />

      {records.length > 0 && (
        <Section title="Records battus">
          <ListGroup>
            {records.map((record) => (
              <ListRow
                key={record.kind}
                leading={<Trophy size={20} className="text-warning" aria-hidden />}
                title={recordTitle(record)}
                subtitle={recordLine(record)}
              />
            ))}
          </ListGroup>
        </Section>
      )}

      <ClimbingGoalAdvances session={session} climbs={climbs} scales={scales} />

      <BoulderLog session={session} scale={scale} palette={editable ? 'toggle' : 'none'} showTime={false} />

      {(feeling !== null || session.notes !== '') && (
        <Section title="Ressenti">
          <div className="rounded-2xl bg-surface p-4">
            {feeling && <p className="text-[16px] font-semibold text-ink">{feeling}</p>}
            {session.notes && (
              <p className="mt-1 text-[15px] whitespace-pre-line text-ink-2 first:mt-0">{session.notes}</p>
            )}
          </div>
        </Section>
      )}
    </>
  )
}

/** Bilan juste après la séance. */
function FinishedClimb(props: Omit<ContentProps, 'editable'>) {
  const navigate = useNavigate()
  const { session } = props
  // Le bilan s'affiche à la place de la séance : on le montre depuis le haut.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  return (
    <Page
      title="Bilan"
      large={false}
      noTabBar
      footer={
        <Button block size="lg" onClick={() => void navigate('/climbing', { replace: true })}>
          Terminé
        </Button>
      }
    >
      <div className="mb-6 flex flex-col items-center gap-1 pt-2 text-center">
        <span className="mb-2 flex size-16 items-center justify-center rounded-full bg-success/15 text-success">
          <Check size={34} strokeWidth={2.6} aria-hidden />
        </span>
        <p className="text-[24px] font-bold text-ink">Séance terminée</p>
        {session.gym !== '' && <p className="text-[15px] text-ink-3">{session.gym}</p>}
        <p className="text-[14px] text-ink-3">{climbDateLine(session)}</p>
      </div>
      <SummaryContent {...props} editable={false} />
    </Page>
  )
}

/** Une séance de l'historique : on corrige ses blocs, sa durée, ou on la supprime. */
function HistoryClimb(props: Omit<ContentProps, 'editable'>) {
  const navigate = useNavigate()
  const toast = useToast()
  const goBack = useGoBack('/climbing/history')
  const [sheet, setSheet] = useState<'info' | 'delete' | null>(null)
  const { session, scales } = props
  const close = () => {
    setSheet(null)
  }

  const remove = async () => {
    // On quitte l'écran avant : la séance va disparaître.
    await navigate('/climbing/history', { replace: true })
    try {
      await deleteClimb(session.id)
      toast('Séance supprimée')
    } catch (error) {
      toast(userMessage(error, 'Suppression impossible.'), 'error')
    }
  }

  return (
    <Page
      title={session.gym === '' ? 'Escalade' : session.gym}
      large={false}
      onBack={goBack}
      backLabel="Séances"
      actions={
        <IconButton
          label="Modifier la séance"
          onClick={() => {
            setSheet('info')
          }}
        >
          <Pencil size={20} aria-hidden />
        </IconButton>
      }
    >
      <p className="mb-4 px-1 pt-1 text-[14px] text-ink-3">{climbDateLine(session)}</p>
      <SummaryContent {...props} editable />
      <Button
        variant="ghost"
        block
        className="text-danger"
        icon={<Trash2 size={18} aria-hidden />}
        onClick={() => {
          setSheet('delete')
        }}
      >
        Supprimer la séance
      </Button>
      {sheet === 'info' && <ClimbInfoSheet session={session} scales={scales} onClose={close} />}
      <ConfirmSheet
        open={sheet === 'delete'}
        onClose={close}
        title={frenchSpacing('Supprimer la séance ?')}
        message="Elle disparaît de l’historique, avec ses blocs. Tes statistiques et tes objectifs sont recalculés."
        confirmLabel="Supprimer"
        onConfirm={() => void remove()}
      />
    </Page>
  )
}

/** Bilan d'une séance d'escalade terminée : juste après la séance, ou depuis l'historique. */
export function ClimbSummary({ session, mode }: { session: ClimbingSession; mode: 'finished' | 'history' }) {
  const climbs = useClimbs()
  const scales = useGradeScales()
  if (!climbs || !scales) return <PageSpinner />
  const scale = scales.find((s) => s.id === session.scaleId) ?? null
  const props = { session, scale, climbs, scales }
  return mode === 'finished' ? <FinishedClimb {...props} /> : <HistoryClimb {...props} />
}
