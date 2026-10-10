import { Dumbbell, House, MapPin, Mountain, Trees, type LucideIcon } from 'lucide-react'
import type { EquipmentItem, Location, LocationIcon } from '@/db/types'
import { COMMON_WEIGHTS_KG, LOCATION_ICON_LABEL, LOCATION_PRESETS } from '@/content/equipment'
import { formatWeight, kgToUnit, unitToKg, type WeightUnit } from '@/lib/units'

export const LOCATION_ICON_ORDER: readonly LocationIcon[] = ['home', 'gym', 'park', 'climb', 'other']

export const LOCATION_ICON_COMPONENT: Record<LocationIcon, LucideIcon> = {
  home: House,
  gym: Dumbbell,
  park: Trees,
  climb: Mountain,
  other: MapPin,
}

/** Nom court d'un type de lieu (« Parc » plutôt que « Parc / street workout »). */
export function locationTypeLabel(icon: LocationIcon): string {
  return LOCATION_PRESETS.find((preset) => preset.icon === icon)?.name ?? LOCATION_ICON_LABEL[icon]
}

/** Nom proposé pour un nouveau lieu de ce type (à saisir pour « Autre »). */
export function defaultLocationName(icon: LocationIcon): string {
  return icon === 'other' ? '' : locationTypeLabel(icon)
}

/** Premier type de lieu pas encore utilisé, pour préremplir un nouveau lieu. */
export function nextLocationIcon(locations: readonly Location[]): LocationIcon {
  return LOCATION_ICON_ORDER.find((icon) => !locations.some((l) => l.icon === icon)) ?? 'other'
}

/**
 * Lieux d'un nouvel objet : le lieu actuel s'il est choisi, le seul lieu s'il n'y en a qu'un,
 * sinon aucun (disponible partout).
 */
export function defaultLocationIds(
  locations: readonly Location[],
  currentLocationId: string | null,
): string[] {
  if (currentLocationId !== null && locations.some((l) => l.id === currentLocationId))
    return [currentLocationId]
  const only = locations.length === 1 ? locations[0] : undefined
  return only ? [only.id] : []
}

const byName = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base' })

/** Lieux dans un ordre stable : maison, salle, parc, escalade, autres, puis par nom. */
export function sortLocations(locations: readonly Location[]): Location[] {
  return [...locations].sort(
    (a, b) =>
      LOCATION_ICON_ORDER.indexOf(a.icon) - LOCATION_ICON_ORDER.indexOf(b.icon) || byName(a.name, b.name),
  )
}

export function sortEquipment(items: readonly EquipmentItem[]): EquipmentItem[] {
  return [...items].sort((a, b) => byName(a.name, b.name))
}

/** Matériel utilisable dans un lieu : rangé là ou disponible partout. */
export function equipmentAt(items: readonly EquipmentItem[], locationId: string): EquipmentItem[] {
  return items.filter((item) => item.locationIds.length === 0 || item.locationIds.includes(locationId))
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`
}

/** Charges d'un objet en quelques mots : « 2 kg, 5 kg » ou « 2 à 20 kg (6 charges) ». */
export function weightsSummary(weightsKg: readonly number[], unit: WeightUnit): string {
  const first = weightsKg[0]
  const last = weightsKg.at(-1)
  if (first === undefined || last === undefined) return ''
  if (weightsKg.length <= 3) return weightsKg.map((kg) => formatWeight(kg, unit)).join(', ')
  const low = formatWeight(first, unit).replace(` ${unit}`, '')
  return `${low} à ${formatWeight(last, unit)} (${plural(weightsKg.length, 'charge', 'charges')})`
}

/** Résumé affiché sous le nom d'un objet : charges ou niveaux, puis lieux. */
export function equipmentSummary(
  item: EquipmentItem,
  locations: readonly Location[],
  unit: WeightUnit,
): string {
  const parts: string[] = []
  if (item.weightsKg.length > 0) parts.push(weightsSummary(item.weightsKg, unit))
  if (item.bandLevels.length > 0) parts.push(plural(item.bandLevels.length, 'niveau', 'niveaux'))
  if (locations.length > 0) {
    const names = sortLocations(locations)
      .filter((location) => item.locationIds.includes(location.id))
      .map((location) => location.name)
    parts.push(names.length > 0 ? names.join(', ') : 'Partout')
  }
  return parts.join(' · ')
}

/** Charges proposées d'un tap, dans l'unité choisie. */
const COMMON_WEIGHTS_LB = [5, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70]

export function commonWeights(unit: WeightUnit): readonly number[] {
  return unit === 'kg' ? COMMON_WEIGHTS_KG : COMMON_WEIGHTS_LB
}

/** Charge en kg affichée dans l'unité choisie, au centième. */
export function shownWeight(kg: number, unit: WeightUnit): number {
  return Math.round(kgToUnit(kg, unit) * 100) / 100
}

/**
 * Remplace les charges par celles choisies dans l'unité affichée, en gardant la valeur exacte en kg
 * de celles déjà enregistrées (pas d'écart d'arrondi en livres).
 */
export function weightsFromShown(
  shown: readonly number[],
  current: readonly number[],
  unit: WeightUnit,
): number[] {
  return shown.map(
    (value) => current.find((kg) => Math.abs(shownWeight(kg, unit) - value) < 0.01) ?? unitToKg(value, unit),
  )
}
