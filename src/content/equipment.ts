import type { EquipmentKind, LocationIcon } from '@/db/types'

export interface EquipmentPreset {
  kind: EquipmentKind
  label: string
  group: 'calisthenics' | 'weights' | 'climbing' | 'home' | 'gym'
  /** Le matériel a des charges (haltères 2 kg, 5 kg…). */
  hasWeights: boolean
  /** Le matériel a des niveaux de résistance (élastiques). */
  hasLevels: boolean
  hint: string
}

export const EQUIPMENT_GROUP_LABEL: Record<EquipmentPreset['group'], string> = {
  calisthenics: 'Calisthénie',
  weights: 'Charges',
  climbing: 'Escalade',
  home: 'Maison',
  gym: 'Salle de sport',
}

export const EQUIPMENT_PRESETS: EquipmentPreset[] = [
  {
    kind: 'pullupBar',
    label: 'Barre de traction',
    group: 'calisthenics',
    hasWeights: false,
    hasLevels: false,
    hint: 'Tractions, suspensions, relevés de jambes',
  },
  {
    kind: 'rings',
    label: 'Anneaux',
    group: 'calisthenics',
    hasWeights: false,
    hasLevels: false,
    hint: 'Dips, tractions, rowing, muscle-up',
  },
  {
    kind: 'dipBars',
    label: 'Barres parallèles (dips)',
    group: 'calisthenics',
    hasWeights: false,
    hasLevels: false,
    hint: 'Dips, L-sit, rowing',
  },
  {
    kind: 'parallettes',
    label: 'Parallettes',
    group: 'calisthenics',
    hasWeights: false,
    hasLevels: false,
    hint: 'L-sit, planche, pompes profondes',
  },
  {
    kind: 'lowBar',
    label: 'Barre basse',
    group: 'calisthenics',
    hasWeights: false,
    hasLevels: false,
    hint: 'Tractions australiennes (rowing)',
  },
  {
    kind: 'bands',
    label: 'Élastiques',
    group: 'calisthenics',
    hasWeights: false,
    hasLevels: true,
    hint: 'Assistance aux tractions et dips, renforcement',
  },
  {
    kind: 'weightVest',
    label: 'Gilet lesté',
    group: 'weights',
    hasWeights: true,
    hasLevels: false,
    hint: 'Ajouter de la charge aux exercices au poids du corps',
  },
  {
    kind: 'dumbbells',
    label: 'Haltères',
    group: 'weights',
    hasWeights: true,
    hasLevels: false,
    hint: 'Indique les charges que tu as (ex. 2 kg, 5 kg)',
  },
  { kind: 'kettlebell', label: 'Kettlebell', group: 'weights', hasWeights: true, hasLevels: false, hint: '' },
  {
    kind: 'barbell',
    label: 'Barre de musculation',
    group: 'weights',
    hasWeights: false,
    hasLevels: false,
    hint: '',
  },
  { kind: 'ezBar', label: 'Barre EZ', group: 'weights', hasWeights: false, hasLevels: false, hint: '' },
  { kind: 'plates', label: 'Disques', group: 'weights', hasWeights: true, hasLevels: false, hint: '' },
  {
    kind: 'medicineBall',
    label: 'Médecine-ball',
    group: 'weights',
    hasWeights: true,
    hasLevels: false,
    hint: '',
  },
  {
    kind: 'hangboard',
    label: 'Poutre d’escalade',
    group: 'climbing',
    hasWeights: false,
    hasLevels: false,
    hint: 'Suspensions pour la force des doigts',
  },
  { kind: 'bench', label: 'Banc', group: 'home', hasWeights: false, hasLevels: false, hint: '' },
  { kind: 'chair', label: 'Chaise solide', group: 'home', hasWeights: false, hasLevels: false, hint: '' },
  {
    kind: 'table',
    label: 'Table solide',
    group: 'home',
    hasWeights: false,
    hasLevels: false,
    hint: 'Rowing sous la table',
  },
  { kind: 'box', label: 'Box / marche', group: 'home', hasWeights: false, hasLevels: false, hint: '' },
  { kind: 'mat', label: 'Tapis', group: 'home', hasWeights: false, hasLevels: false, hint: '' },
  {
    kind: 'jumpRope',
    label: 'Corde à sauter',
    group: 'home',
    hasWeights: false,
    hasLevels: false,
    hint: '',
  },
  { kind: 'abWheel', label: 'Roue abdominale', group: 'home', hasWeights: false, hasLevels: false, hint: '' },
  {
    kind: 'trx',
    label: 'Sangles de suspension (TRX)',
    group: 'home',
    hasWeights: false,
    hasLevels: false,
    hint: '',
  },
  {
    kind: 'foamRoller',
    label: 'Rouleau de massage',
    group: 'home',
    hasWeights: false,
    hasLevels: false,
    hint: '',
  },
  { kind: 'swissBall', label: 'Swiss ball', group: 'home', hasWeights: false, hasLevels: false, hint: '' },
  {
    kind: 'cableMachine',
    label: 'Poulies',
    group: 'gym',
    hasWeights: false,
    hasLevels: false,
    hint: '',
  },
  {
    kind: 'gymMachines',
    label: 'Machines guidées',
    group: 'gym',
    hasWeights: false,
    hasLevels: false,
    hint: '',
  },
  {
    kind: 'smithMachine',
    label: 'Smith machine',
    group: 'gym',
    hasWeights: false,
    hasLevels: false,
    hint: '',
  },
  { kind: 'sled', label: 'Traîneau', group: 'gym', hasWeights: false, hasLevels: false, hint: '' },
  { kind: 'other', label: 'Autre matériel', group: 'gym', hasWeights: false, hasLevels: false, hint: '' },
]

/** Toujours disponibles, quel que soit le lieu. */
export const ALWAYS_AVAILABLE: readonly EquipmentKind[] = ['floor', 'wall']

export const EQUIPMENT_LABEL: Record<EquipmentKind, string> = {
  ...(Object.fromEntries(EQUIPMENT_PRESETS.map((p) => [p.kind, p.label])) as Record<EquipmentKind, string>),
  floor: 'Sol',
  wall: 'Mur',
}

export function presetFor(kind: EquipmentKind): EquipmentPreset | undefined {
  return EQUIPMENT_PRESETS.find((p) => p.kind === kind)
}

export const LOCATION_ICON_LABEL: Record<LocationIcon, string> = {
  home: 'Maison',
  gym: 'Salle de sport',
  park: 'Parc / street workout',
  climb: "Salle d'escalade",
  other: 'Autre',
}

export const DEFAULT_BAND_LEVELS = ['Léger', 'Moyen', 'Fort', 'Très fort']
