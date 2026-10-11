import { useState } from 'react'

interface Typed {
  value: number | null
  /** Enregistrements encore en cours pour cette saisie. */
  writes: number
}

/**
 * Nombre saisi pendant la séance, enregistré à chaque touche (rien ne se perd si l'appli se ferme).
 * La valeur tapée reste affichée tant que la base n'a pas rattrapé la frappe : une réponse en retard
 * (« 1 » alors qu'on a déjà tapé « 12 ») n'efface pas la saisie. Ensuite, la base fait foi.
 */
export function useSavedNumber(
  stored: number | null,
  save: (value: number | null) => Promise<unknown>,
): [number | null, (value: number | null) => void] {
  const [typed, setTyped] = useState<Typed | null>(null)
  if (typed && typed.writes === 0 && typed.value === stored) setTyped(null)

  const change = (value: number | null) => {
    setTyped((current) => ({ value, writes: (current?.writes ?? 0) + 1 }))
    save(value).then(
      () => {
        setTyped((current) => current && { ...current, writes: current.writes - 1 })
      },
      () => {
        // Échec (signalé par `save`) : on revient à la valeur enregistrée.
        setTyped(null)
      },
    )
  }

  return [typed ? typed.value : stored, change]
}
