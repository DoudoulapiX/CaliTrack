import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { parseBackup, restoreBackup, type BackupFile } from '@/db/backup'
import { cn } from '@/lib/cn'
import { frenchSpacing } from '@/lib/typography'
import { buttonClass } from '@/ui/button-class'
import { ConfirmSheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { describeBackup } from './describe'
import { userMessage } from '@/lib/errors'

/**
 * Choisit un fichier de sauvegarde (app Fichiers sur iPhone), le vérifie, puis remplace les
 * données après confirmation. Une copie de sécurité de l'état actuel est gardée dans l'appli.
 */
export function ImportBackupButton({
  label = 'Restaurer une sauvegarde',
  className,
}: {
  label?: string
  className?: string
}) {
  const [pending, setPending] = useState<BackupFile | null>(null)
  const toast = useToast()

  const read = async (file: File) => {
    const result = parseBackup(await file.text())
    if (result.ok) setPending(result.backup)
    else toast(result.error, 'error')
  }

  return (
    <>
      {/* Le libellé ouvre le sélecteur de fichiers : fiable sur iPhone, et accessible. */}
      <label className={cn(buttonClass('secondary', 'lg', true), 'cursor-pointer', className)}>
        <FolderOpen size={20} aria-hidden />
        {label}
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void read(file)
          }}
        />
      </label>
      <ConfirmSheet
        open={pending !== null}
        onClose={() => {
          setPending(null)
        }}
        title={frenchSpacing('Restaurer cette sauvegarde ?')}
        message={
          pending && (
            <>
              <p>{describeBackup(pending)}</p>
              <p className="mt-2">
                Elle remplace les données de l’appli. Une copie de sécurité de l’état actuel est gardée.
              </p>
            </>
          )
        }
        confirmLabel="Restaurer"
        danger={false}
        onConfirm={() => {
          if (!pending) return
          restoreBackup(pending).then(
            () => {
              toast('Sauvegarde restaurée', 'success')
            },
            (error: unknown) => {
              toast(userMessage(error, 'Restauration impossible'), 'error')
            },
          )
        }}
      />
    </>
  )
}
