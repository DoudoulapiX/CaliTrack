import { EMPTY_FILTER, type ExerciseFilter } from '@/content/exercises/catalog'

/** Nombre de lignes affichées d'un coup ; les suivantes arrivent en faisant défiler. */
export const LIBRARY_PAGE_SIZE = 80

/*
 * État de la liste d'exercices, gardé tant que l'appli est ouverte :
 * en revenant d'une fiche, on retrouve sa recherche, ses filtres et sa position.
 */
let saved: ExerciseFilter = EMPTY_FILTER
let savedLimit = LIBRARY_PAGE_SIZE

export function savedLibraryFilter(): ExerciseFilter {
  return saved
}

export function saveLibraryFilter(filter: ExerciseFilter): void {
  saved = filter
}

export function savedLibraryLimit(): number {
  return savedLimit
}

export function saveLibraryLimit(limit: number): void {
  savedLimit = limit
}
