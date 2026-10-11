import { backupFileName, serializeBackup, type BackupFile } from '@/db/backup'
import { localDateOf } from '@/lib/dates'

export type DeliveryResult = 'shared' | 'downloaded' | 'cancelled'

/** Le fichier de sauvegarde, prêt à partager (préparé d'avance : le partage doit suivre le toucher). */
export function backupFile(backup: BackupFile): File {
  return new File([serializeBackup(backup)], backupFileName(localDateOf(backup.exportedAt)), {
    type: 'application/json',
  })
}

function download(file: File): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // Le temps que Safari lise le fichier.
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 60_000)
}

/**
 * Propose le fichier à la feuille de partage de l'iPhone (« Enregistrer dans Fichiers »), ou le
 * télécharge quand le partage de fichiers n'existe pas (ordinateur) ou est refusé.
 */
export async function deliverFile(file: File): Promise<DeliveryResult> {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // Partage refusé par le navigateur : on passe au téléchargement.
    }
  }
  download(file)
  return 'downloaded'
}
