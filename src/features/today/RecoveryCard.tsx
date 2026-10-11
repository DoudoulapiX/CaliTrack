import { Link2 } from 'lucide-react'
import type { ISODate } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'
import { ButtonLink } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Badge, ProgressBar } from '@/ui/Controls'
import { Section } from '@/ui/Page'
import {
  OURA_PROBLEM_TEXT,
  OURA_SETTINGS_PATH,
  ouraDayLabel,
  readinessAdvice,
  readinessLabel,
  readinessTone,
  recoveryTiles,
  syncLine,
} from '@/features/oura/oura-view'
import { useOura, useOuraAutoSync, useOuraSyncing } from '@/features/oura/useOura'
import { SectionLink } from './SectionLink'

/** La récupération de la nuit d'après la bague Oura, ou de quoi la connecter. */
export function RecoveryCard({ day }: { day: ISODate }) {
  const oura = useOura()
  const syncing = useOuraSyncing()
  useOuraAutoSync(oura)
  if (!oura) return null

  if (oura.connection !== 'connected') {
    const expired = oura.connection === 'expired'
    return (
      <Section title="Récupération">
        <Card>
          <p className="text-[14px] text-ink-2">
            {expired
              ? OURA_PROBLEM_TEXT.expired
              : frenchSpacing(
                  'Connecte ta bague Oura : ton sommeil et ta récupération s’afficheront ici chaque matin.',
                )}
          </p>
          <ButtonLink
            to={OURA_SETTINGS_PATH}
            block
            variant="secondary"
            className="mt-4"
            icon={<Link2 size={18} aria-hidden />}
          >
            {expired ? 'Reconnecter ma bague' : 'Connecter ma bague Oura'}
          </ButtonLink>
        </Card>
      </Section>
    )
  }

  const latest = oura.latest
  const score = latest?.readinessScore ?? null
  const tiles = latest ? recoveryTiles(latest) : []
  return (
    <Section
      title="Récupération"
      action={
        <SectionLink to={OURA_SETTINGS_PATH} label="Réglages Oura">
          Oura
        </SectionLink>
      }
    >
      <Card>
        {latest ? (
          <>
            <div className="flex items-end gap-3">
              <p className="text-[34px] leading-none font-bold text-ink tabular">
                {score === null ? '—' : score}
              </p>
              <div className="min-w-0 flex-1 pb-0.5">
                {score !== null && <Badge tone={readinessTone(score)}>{readinessLabel(score)}</Badge>}
                <p className="mt-1 text-[13px] text-ink-3">{ouraDayLabel(latest.date, day)}</p>
              </div>
            </div>
            {score !== null && (
              <>
                <ProgressBar value={score} label="Score de récupération" className="mt-3" />
                {latest.date === day && (
                  <p className="mt-3 text-[14px] text-ink-2">{frenchSpacing(readinessAdvice(score))}</p>
                )}
              </>
            )}
            {tiles.length > 0 && (
              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3">
                {tiles.map((tile) => (
                  <div key={tile.label} className="flex flex-col-reverse">
                    <dt className="text-[12px] text-ink-3">{tile.label}</dt>
                    <dd className="text-[16px] font-semibold text-ink tabular">{tile.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        ) : (
          <p className="text-[14px] text-ink-2">
            {frenchSpacing(
              'Pas encore de données : ouvre l’appli Oura pour synchroniser ta bague, puis reviens ici.',
            )}
          </p>
        )}
        <p className="mt-3 text-[12px] text-ink-3">
          {syncing ? 'Synchronisation…' : syncLine(oura.lastSync, day)}
        </p>
      </Card>
    </Section>
  )
}
