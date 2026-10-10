import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CalendarCheck, Copy, Plus, Settings2, Trash2 } from 'lucide-react'
import { addSession, duplicateProgram, newSession, overlappingDays } from '@/content/programs/edit'
import { isDeloadWeek, programWeek } from '@/content/programs/schedule'
import { activateProgram, deleteProgram, saveProgram, updateProgram } from '@/db/programs'
import type { Program } from '@/db/types'
import { frenchSpacing, joinFrench } from '@/lib/typography'
import { newId } from '@/lib/ids'
import { nowISO, today, WEEKDAY_LONG } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { Button, IconButton } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Badge, EmptyState } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { ConfirmSheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { useCatalog } from '@/features/library/catalog-context'
import { NotFound } from '@/app/NotFound'
import { daysLabel, locationLabel, sessionSummary } from './program-view'
import { ProgramSettingsSheet } from './ProgramSettingsSheet'
import { RationaleList } from './RationaleList'
import { SessionSheet } from './SessionSheet'
import { useInventory, useProgram } from './useTraining'

function ProgramContent({ program }: { program: Program }) {
  const catalog = useCatalog()
  const inventory = useInventory()
  const navigate = useNavigate()
  const toast = useToast()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const day = today()
  const week = programWeek(program, day)
  const overlaps = overlappingDays(program)
  const takenDays = [...new Set(program.sessions.flatMap((s) => s.weekdays))]

  const run = async (action: () => Promise<unknown>, failure: string) => {
    try {
      await action()
    } catch (e) {
      toast(userMessage(e, failure), 'error')
    }
  }

  return (
    <Page
      title={program.name}
      back
      backTo="/training"
      backLabel="Entraînement"
      className="pt-2"
      actions={
        <IconButton
          label="Réglages du programme"
          onClick={() => {
            setSettingsOpen(true)
          }}
        >
          <Settings2 size={22} aria-hidden />
        </IconButton>
      }
    >
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {program.active ? (
            <Badge tone="accent">Programme suivi</Badge>
          ) : (
            <Badge>Pas suivi en ce moment</Badge>
          )}
          {program.active && week >= 1 && <Badge>Semaine {week}</Badge>}
          {program.active && isDeloadWeek(program, day) && <Badge tone="success">Semaine allégée</Badge>}
        </div>
        <p className="mt-2 text-[14px] text-ink-3">
          Matériel&nbsp;: {inventory ? locationLabel(program, inventory.locations) : '…'}
          {program.deloadEveryWeeks !== null &&
            ` · semaine allégée toutes les ${program.deloadEveryWeeks} semaines`}
        </p>
        {program.notes && <p className="mt-2 text-[14px] whitespace-pre-line text-ink-2">{program.notes}</p>}
        {!program.active && (
          <Button
            className="mt-4"
            block
            icon={<CalendarCheck size={18} aria-hidden />}
            onClick={() =>
              void run(async () => {
                await activateProgram(program.id)
                toast('C’est ton programme désormais', 'success')
              }, 'Impossible de suivre ce programme.')
            }
          >
            Suivre ce programme
          </Button>
        )}
      </Card>

      <Section
        title="Séances"
        action={
          program.sessions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus size={16} aria-hidden />}
              aria-label="Ajouter une séance"
              onClick={() => {
                setAdding(true)
              }}
            >
              Ajouter
            </Button>
          )
        }
      >
        {program.sessions.length === 0 ? (
          <EmptyState
            title="Aucune séance"
            text="Ajoute une séance, choisis ses jours, puis ses exercices."
            action={
              <Button
                icon={<Plus size={18} aria-hidden />}
                onClick={() => {
                  setAdding(true)
                }}
              >
                Ajouter une séance
              </Button>
            }
          />
        ) : (
          <ListGroup>
            {program.sessions.map((session) => (
              <ListRow
                key={session.id}
                title={session.name}
                subtitle={`${daysLabel(session.weekdays)} · ${sessionSummary(session, catalog.byId)}`}
                to={`/training/programs/${program.id}/sessions/${session.id}`}
              />
            ))}
          </ListGroup>
        )}
        {overlaps.length > 0 && (
          <p className="mt-2 px-1 text-[13px] text-ink-3">
            Plusieurs séances le {joinFrench(overlaps.map((d) => WEEKDAY_LONG[d]))}&nbsp;: elles se suivront
            ce jour-là.
          </p>
        )}
      </Section>

      {program.rationale.length > 0 && (
        <Section title="Pourquoi ce programme">
          <RationaleList lines={program.rationale} />
        </Section>
      )}

      <Section>
        <ListGroup>
          <ListRow
            title="Dupliquer le programme"
            leading={<Copy size={20} aria-hidden />}
            onClick={() =>
              void run(async () => {
                const copy = await saveProgram(duplicateProgram(program, nowISO(), newId))
                toast('Copie créée')
                void navigate(`/training/programs/${copy.id}`)
              }, 'Copie impossible.')
            }
            chevron={false}
          />
          <ListRow
            title="Supprimer le programme"
            leading={<Trash2 size={20} aria-hidden />}
            danger
            chevron={false}
            onClick={() => {
              setDeleting(true)
            }}
          />
        </ListGroup>
      </Section>

      <ProgramSettingsSheet
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false)
        }}
        program={program}
        locations={inventory?.locations ?? []}
        onSave={(settings) =>
          run(async () => {
            await updateProgram(program.id, (current) => ({ ...current, ...settings }))
            setSettingsOpen(false)
            toast('Programme enregistré')
          }, 'Enregistrement impossible.')
        }
      />

      <SessionSheet
        open={adding}
        onClose={() => {
          setAdding(false)
        }}
        takenDays={takenDays}
        onSave={(draft) =>
          run(async () => {
            const session = newSession(draft.name, draft.weekdays, newId)
            await updateProgram(program.id, (current) => addSession(current, session))
            setAdding(false)
            void navigate(`/training/programs/${program.id}/sessions/${session.id}`)
          }, 'Création impossible.')
        }
      />

      <ConfirmSheet
        open={deleting}
        onClose={() => {
          setDeleting(false)
        }}
        title={frenchSpacing('Supprimer le programme ?')}
        message={
          program.active
            ? frenchSpacing(
                'C’est le programme que tu suis : tu n’auras plus de séances prévues. Tes séances déjà faites restent dans l’historique.',
              )
            : 'Tes séances déjà faites restent dans l’historique.'
        }
        confirmLabel="Supprimer"
        onConfirm={() =>
          void run(async () => {
            // On quitte l'écran avant : le programme va disparaître.
            void navigate('/training/programs', { replace: true })
            await deleteProgram(program.id)
            toast('Programme supprimé')
          }, 'Suppression impossible.')
        }
      />
    </Page>
  )
}

/** Un programme : ses séances, ses réglages, et de quoi le suivre, le copier ou le supprimer. */
export function ProgramPage() {
  const { id } = useParams()
  const program = useProgram(id)
  if (program === undefined) return <PageSpinner />
  if (program === null) return <NotFound />
  return <ProgramContent program={program} />
}
