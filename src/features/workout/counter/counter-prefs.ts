import { z } from 'zod'
import type { CountedMovement } from '@/content/reps/types'
import type { Facing } from '@/lib/camera'
import type { Delegate } from './pose-engine'

/*
 * Préférences du compteur caméra, propres au téléphone (jamais dans les sauvegardes) : conseils déjà vus,
 * caméra choisie, infos de réglage, calcul sur la puce graphique. Le stockage peut manquer (navigation privée)
 * ou être abîmé : on retombe alors sur les valeurs par défaut.
 */

export interface CounterPrefs {
  /** Mouvements dont les conseils de placement ont déjà été vus. */
  readonly guides: readonly CountedMovement[]
  readonly facing: Facing
  /** « Infos de réglage » affichées. */
  readonly debug: boolean
  /** Calcul du squelette, pris en compte à la prochaine ouverture du compteur. */
  readonly delegate: Delegate
}

export const DEFAULT_COUNTER_PREFS: CounterPrefs = {
  guides: [],
  facing: 'user',
  debug: false,
  delegate: 'CPU',
}

const KEY = 'calitrack.counter'

const prefsSchema = z.object({
  guides: z.array(z.enum(['squat', 'pushup', 'dip', 'pullup', 'curl'])),
  facing: z.enum(['user', 'environment']),
  debug: z.boolean(),
  delegate: z.enum(['CPU', 'GPU']),
})

export function readCounterPrefs(): CounterPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return DEFAULT_COUNTER_PREFS
    const parsed = prefsSchema.partial().safeParse(JSON.parse(raw))
    if (!parsed.success) return DEFAULT_COUNTER_PREFS
    return { ...DEFAULT_COUNTER_PREFS, ...parsed.data }
  } catch {
    return DEFAULT_COUNTER_PREFS
  }
}

/**
 * Change quelques préférences de `prefs` (celles en cours) et rend le tout, gardé si le stockage le permet. On part
 * de celles en cours, pas de ce qui est gardé : un stockage qui refuse d'écrire ne ramène pas les autres aux valeurs
 * par défaut (la caméra de face en pleine série).
 */
export function writeCounterPrefs(prefs: CounterPrefs, patch: Partial<CounterPrefs>): CounterPrefs {
  const merged = { ...prefs, ...patch }
  const next: CounterPrefs = { ...merged, guides: [...new Set(merged.guides)] }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Stockage plein ou interdit : les préférences valent pour cette ouverture seulement.
  }
  return next
}
