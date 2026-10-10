import { useState, type Dispatch, type SetStateAction } from 'react'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Fusionne une nouvelle version enregistrée dans un brouillon : les champs que l'utilisateur n'a
 * pas touchés (identiques à la version de départ) prennent la nouvelle valeur, les autres restent.
 */
export function mergeUntouched<T extends object>(draft: T, base: T, saved: T): T {
  const merged = { ...draft }
  for (const key of Object.keys(saved) as (keyof T)[]) {
    if (same(draft[key], base[key])) merged[key] = saved[key]
  }
  return merged
}

/**
 * Brouillon d'un formulaire branché sur des données enregistrées qui peuvent changer ailleurs
 * (un autre écran vient d'écrire, la lecture de la base arrive après l'ouverture) : le brouillon
 * suit ces changements sans perdre la saisie en cours. `saved` doit garder la même référence tant
 * que les données ne changent pas (useMemo).
 */
export function useSyncedDraft<T extends object>(saved: T): [T, Dispatch<SetStateAction<T>>] {
  const [draft, setDraft] = useState(saved)
  const [base, setBase] = useState(saved)
  if (base !== saved) {
    setBase(saved)
    setDraft((current) => mergeUntouched(current, base, saved))
  }
  return [draft, setDraft]
}
