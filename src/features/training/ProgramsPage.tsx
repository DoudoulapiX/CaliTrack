import { useNavigate } from 'react-router'
import { Dumbbell, Plus } from 'lucide-react'
import { ButtonLink, IconButton } from '@/ui/Button'
import { Badge, EmptyState } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { formatDayShort, localDateOf } from '@/lib/dates'
import { usePrograms } from './useTraining'

/** Tous les programmes : celui que l'on suit et les anciens. */
export function ProgramsPage() {
  const programs = usePrograms()
  const navigate = useNavigate()
  if (!programs) return <PageSpinner />
  return (
    <Page
      title="Mes programmes"
      back
      backTo="/training"
      backLabel="Entraînement"
      className="pt-2"
      actions={
        <IconButton
          label="Nouveau programme"
          onClick={() => {
            void navigate('/training/new')
          }}
        >
          <Plus size={24} aria-hidden />
        </IconButton>
      }
    >
      {programs.length === 0 ? (
        <EmptyState
          icon={<Dumbbell size={36} aria-hidden />}
          title="Aucun programme"
          action={<ButtonLink to="/training/new">Créer mon programme</ButtonLink>}
        />
      ) : (
        <Section>
          <ListGroup>
            {programs.map((program) => (
              <ListRow
                key={program.id}
                title={program.name}
                subtitle={`${program.sessions.length} séance${program.sessions.length > 1 ? 's' : ''} · créé le ${formatDayShort(localDateOf(program.createdAt))}`}
                trailing={program.active ? <Badge tone="accent">Suivi</Badge> : undefined}
                to={`/training/programs/${program.id}`}
              />
            ))}
          </ListGroup>
        </Section>
      )}
    </Page>
  )
}
