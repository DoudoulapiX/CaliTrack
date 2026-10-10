export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * Propose le fichier via la feuille de partage (iPhone : « Enregistrer dans Fichiers »),
 * sinon le télécharge. À appeler directement depuis un geste de l'utilisateur.
 */
export async function shareOrDownload(file: File): Promise<SaveOutcome> {
  if ('share' in navigator && 'canShare' in navigator && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // Partage refusé par le navigateur : on bascule sur le téléchargement.
    }
  }
  downloadFile(file)
  return 'downloaded'
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 30_000)
}

export function jsonFile(name: string, content: string): File {
  return new File([content], name, { type: 'application/json' })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
}
