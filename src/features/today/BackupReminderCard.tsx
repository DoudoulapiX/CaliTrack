import { HardDriveDownload } from 'lucide-react'
import { frenchSpacing } from '@/lib/typography'
import { ButtonLink } from '@/ui/Button'
import { Card } from '@/ui/Card'
import type { BackupReminder } from '@/features/backup/describe'

/** Rappel de sauvegarde, en haut de l'accueil, quand la dernière date d'un moment. */
export function BackupReminderCard({ reminder }: { reminder: BackupReminder }) {
  return (
    <Card className="mb-6 flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
        <HardDriveDownload size={20} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-semibold text-ink">Pense à sauvegarder</p>
        <p className="mt-0.5 text-[14px] text-ink-3">
          {reminder.daysSince === null
            ? frenchSpacing('Tes données ne sont que sur cet iPhone : garde-en une copie dans Fichiers.')
            : `Dernière sauvegarde il y a ${String(reminder.daysSince)} jours.`}
        </p>
        <ButtonLink to="/more/backup" variant="soft" size="sm" className="mt-3">
          Sauvegarder
        </ButtonLink>
      </div>
    </Card>
  )
}
