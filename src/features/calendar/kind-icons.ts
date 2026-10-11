import {
  Bike,
  Coffee,
  Dumbbell,
  Footprints,
  HeartPulse,
  Mountain,
  Sailboat,
  TreePine,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { EventKind } from '@/db/types'

/** Icône de chaque genre de séance. */
export const KIND_ICON: Record<EventKind, LucideIcon> = {
  program: Dumbbell,
  climbing: Mountain,
  cardio: HeartPulse,
  custom: Zap,
  rest: Coffee,
}

/** Icône propre à quelques activités cardio (d'après le nom de la séance). */
export const CARDIO_ICON: Partial<Record<string, LucideIcon>> = {
  'Course à pied': Footprints,
  Vélo: Bike,
  Natation: Waves,
  Marche: Footprints,
  Randonnée: TreePine,
  Rameur: Sailboat,
}
