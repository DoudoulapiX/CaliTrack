import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { HardDriveDownload, History, Share, Trash2 } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { useGoBack } from '@/app/useGoBack'
import {
  collectBackup,
  createSnapshot,
  describeSnapshot,
  resetAllData,
  restoreSnapshot,
  stampBackup,
} from '@/db/backup'
import { db } from '@/db/db'
import { updateSettings } from '@/db/settings'
import type { Snapshot } from '@/db/types'
import { nowISO, today } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { ChoiceChips } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { ConfirmSheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { BACKUP_REMINDER_OPTIONS, backupReminderLabel } from '@/features/settings/settings-view'
import { describeContents, lastBackupLine } from './describe'
import { backupFile, deliverFile } from './export'
import { ImportBackupButton } from './ImportBackupButton'

function Note({ children }: { children: string }) {
  return <p className="mt-2 px-1 text-[13px] text-ink-3">{frenchSpacing(children)}</p>
}

function sizeLabel(bytes: number): string {
  return bytes < 1_000_000
    ? `${String(Math.max(1, Math.round(bytes / 1000)))} ko`
    : `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} Mo`
}

/** Sauvegarde dans Fichiers, rappel, restauration, copies de sécurité internes et remise à zéro. */
export function BackupPage() {
  const settings = useSettings()
  const toast = useToast()
  const goBack = useGoBack('/more')
  // Préparée d'avance : sur iPhone, le partage doit partir tout de suite après le toucher.
  const prepared = useLiveQuery(() => collectBackup(), [])
  const snapshots = useLiveQuery(() => db.snapshots.orderBy('createdAt').reverse().toArray(), [])
  const [busy, setBusy] = useState(false)
  const [restoring, setRestoring] = useState<Snapshot | null>(null)
  const [erasing, setErasing] = useState(false)

  const save = () => {
    if (!prepared) return
    const backup = stampBackup(prepared, nowISO())
    setBusy(true)
    deliverFile(backupFile(backup))
      .then(async (result) => {
        if (result === 'cancelled') return
        await updateSettings({ lastBackupAt: backup.exportedAt })
        toast(result === 'shared' ? 'Sauvegarde enregistrée' : 'Sauvegarde téléchargée', 'success')
      })
      .catch((error: unknown) => {
        toast(userMessage(error, 'Sauvegarde impossible, réessaie.'), 'error')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const copyNow = () => {
    createSnapshot('manual').then(
      () => {
        toast('Copie de sécurité faite')
      },
      (error: unknown) => {
        toast(userMessage(error, 'Copie impossible, réessaie.'), 'error')
      },
    )
  }

  return (
    <Page title="Sauvegarde" back onBack={goBack} backLabel="Plus" large>
      <Section>
        <div className="rounded-2xl bg-surface p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
              <HardDriveDownload size={22} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">
                Dernière sauvegarde
              </p>
              <p className="mt-0.5 text-[17px] font-semibold text-ink">
                {lastBackupLine(settings.lastBackupAt, today())}
              </p>
              {prepared && <p className="mt-0.5 text-[14px] text-ink-3">{describeContents(prepared)}</p>}
            </div>
          </div>
          <Button
            block
            size="lg"
            className="mt-4"
            disabled={!prepared || busy}
            icon={<Share size={20} aria-hidden />}
            onClick={save}
          >
            Enregistrer dans Fichiers
          </Button>
        </div>
        <Note>
          Un fichier avec toutes tes données. Sur iPhone, choisis « Enregistrer dans Fichiers », de préférence
          dans iCloud Drive : tu le retrouveras même en changeant de téléphone.
        </Note>
      </Section>

      <Section title="Rappel sur l’accueil">
        <ChoiceChips
          label="Rappel de sauvegarde"
          value={String(settings.backupReminderDays)}
          options={BACKUP_REMINDER_OPTIONS.map((days) => ({
            value: String(days),
            label: backupReminderLabel(days),
          }))}
          onChange={(value) => {
            updateSettings({ backupReminderDays: Number(value) }).catch((error: unknown) => {
              toast(userMessage(error, 'Enregistrement impossible, réessaie.'), 'error')
            })
          }}
        />
      </Section>

      <Section title="Restaurer">
        <ImportBackupButton />
        <Note>
          Remplace les données de l’appli par celles d’un fichier de sauvegarde. Une copie de sécurité de
          l’état actuel est gardée avant.
        </Note>
      </Section>

      <Section title="Copies de sécurité">
        {snapshots && snapshots.length > 0 && (
          <ListGroup className="mb-3">
            {snapshots.map((snapshot) => (
              <ListRow
                key={snapshot.id}
                leading={<History size={20} aria-hidden />}
                title={describeSnapshot(snapshot)}
                subtitle={sizeLabel(snapshot.sizeBytes)}
                onClick={() => {
                  setRestoring(snapshot)
                }}
              />
            ))}
          </ListGroup>
        )}
        <Button variant="secondary" block onClick={copyNow}>
          Faire une copie maintenant
        </Button>
        <Note>
          Gardées dans l’appli, sur cet iPhone : les trois dernières. Une copie est faite avant chaque
          restauration.
        </Note>
      </Section>

      <Section>
        <ListGroup>
          <ListRow
            leading={<Trash2 size={20} className="text-danger" aria-hidden />}
            title="Tout effacer"
            danger
            chevron={false}
            onClick={() => {
              setErasing(true)
            }}
          />
        </ListGroup>
      </Section>

      <ConfirmSheet
        open={restoring !== null}
        onClose={() => {
          setRestoring(null)
        }}
        title={frenchSpacing('Revenir à cette copie ?')}
        message={
          restoring
            ? `${describeSnapshot(restoring)}. Elle remplace les données actuelles, qui sont gardées dans une nouvelle copie.`
            : ''
        }
        confirmLabel="Revenir à cette copie"
        danger={false}
        onConfirm={() => {
          if (!restoring) return
          restoreSnapshot(restoring.id).then(
            () => {
              toast('Copie restaurée', 'success')
            },
            (error: unknown) => {
              toast(userMessage(error, 'Restauration impossible'), 'error')
            },
          )
        }}
      />
      <ConfirmSheet
        open={erasing}
        onClose={() => {
          setErasing(false)
        }}
        title={frenchSpacing('Tout effacer ?')}
        message="Séances, programmes, objectifs, escalade, réglages et copies de sécurité disparaissent de cet iPhone. Enregistre une sauvegarde avant si tu veux pouvoir les retrouver."
        confirmLabel="Tout effacer"
        onConfirm={() => {
          resetAllData().then(
            () => {
              toast('Données effacées')
            },
            (error: unknown) => {
              toast(userMessage(error, 'Effacement impossible'), 'error')
            },
          )
        }}
      />
    </Page>
  )
}
