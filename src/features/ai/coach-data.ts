import { buildAgenda, climbingDaysSeries, itemTitle, AGENDA_MARGIN_DAYS } from '@/content/calendar/agenda'
import type { CoachData } from '@/content/coach/context'
import { buildCatalog, exerciseName, loadFedbExercises, type Catalog } from '@/content/exercises/catalog'
import { roundNutrients, sumNutrients } from '@/content/nutrition/nutrients'
import { computeTargets } from '@/content/nutrition/targets'
import { formatPrescription } from '@/content/programs/format'
import { isDeloadWeek, programWeek } from '@/content/programs/schedule'
import { db, type CaliTrackDB } from '@/db/db'
import { defaultNutritionGoals, defaultProfile, defaultSettings } from '@/db/defaults'
import type { FoodEntry, PantryPlace, Program, WorkoutSet } from '@/db/types'
import { addDaysISO, type ISODate } from '@/lib/dates'
import { climbSubtitle } from '@/features/climbing/climb-view'
import { weighInsOf } from '@/features/today/today-view'

/** Jours d'historique donnés au coach. */
const WORKOUT_DAYS = 14
const OURA_DAYS = 7
const WEIGHT_DAYS = 30
const AGENDA_DAYS = 7

const PLACE_ORDER: readonly PantryPlace[] = ['fridge', 'freezer', 'cupboard']
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })

/** Une série faite, en peu de caractères : « 8 », « 30 s », « 6 à 10 kg ». */
function setText(set: Pick<WorkoutSet, 'reps' | 'durationSec' | 'loadKg'>): string {
  const amount =
    set.reps !== null ? String(set.reps) : set.durationSec !== null ? `${String(set.durationSec)} s` : '?'
  return set.loadKg === null ? amount : `${amount} à ${String(set.loadKg)} kg`
}

/**
 * Un exercice d'une séance faite, pour le coach : son nom et ses séries faites (« Tractions : 8, 7, 6 »).
 * null quand aucune série n'a été faite.
 */
export function workoutExerciseLine(
  name: string,
  sets: readonly Pick<WorkoutSet, 'reps' | 'durationSec' | 'loadKg' | 'done'>[],
): string | null {
  const done = sets.filter((set) => set.done)
  return done.length === 0 ? null : `${name} : ${done.map(setText).join(', ')}`
}

/** Les séances du programme et leurs exercices prescrits, pour le coach (charges en kilos). */
function programOf(program: Program, date: ISODate, catalog: Catalog): CoachData['program'] {
  return {
    name: program.name,
    week: programWeek(program, date),
    deload: isDeloadWeek(program, date),
    sessions: program.sessions.map((session) => ({
      name: session.name,
      exercises: session.blocks.flatMap((block) =>
        block.slots.map((slot) => {
          const exercise = catalog.byId.get(slot.exerciseId)
          return `${exerciseName(catalog, slot.exerciseId)} : ${formatPrescription(slot, exercise, 'kg')}`
        }),
      ),
    })),
  }
}

/** La moyenne des jours où des repas ont été notés ; null : aucun. */
function dailyAverage(entries: readonly FoodEntry[]): CoachData['nutrition']['last7Avg'] {
  const days = new Set(entries.map((entry) => entry.date)).size
  if (days === 0) return null
  const total = sumNutrients(entries.map((entry) => entry.nutrients))
  return roundNutrients({
    ...total,
    kcal: total.kcal / days,
    protein: total.protein / days,
    carbs: total.carbs / days,
    fat: total.fat / days,
    fiber: total.fiber === null ? null : total.fiber / days,
    sugars: total.sugars === null ? null : total.sugars / days,
    satFat: total.satFat === null ? null : total.satFat / days,
    salt: total.salt === null ? null : total.salt / days,
  })
}

/**
 * Tout ce que le coach sait de l'utilisateur ce jour-là, lu directement dans la base (sans suivi en
 * direct) : à appeler au moment de la demande à Claude, jamais au rendu.
 */
export async function loadCoachData(date: ISODate, database: CaliTrackDB = db): Promise<CoachData> {
  const [profile, settings, goals] = await Promise.all([
    database.profile.get('me').then((row) => row ?? defaultProfile()),
    database.settings.get('app').then((row) => row ?? defaultSettings()),
    database.nutritionGoals.get('me').then((row) => row ?? defaultNutritionGoals()),
  ])
  const agendaEnd = addDaysISO(date, AGENDA_DAYS - 1)
  const historyStart = addDaysISO(date, -(WORKOUT_DAYS - 1))
  const [
    program,
    fedb,
    customExercises,
    events,
    series,
    workouts,
    climbs,
    ouraDays,
    metrics,
    entries,
    reviews,
    pantry,
  ] = await Promise.all([
    database.programs.filter((row) => row.active).first(),
    loadFedbExercises(),
    database.customExercises.toArray(),
    database.events.where('date').between(date, agendaEnd, true, true).toArray(),
    database.eventSeries.toArray(),
    database.workouts
      .where('date')
      .between(
        addDaysISO(historyStart, -AGENDA_MARGIN_DAYS),
        addDaysISO(agendaEnd, AGENDA_MARGIN_DAYS),
        true,
        true,
      )
      .toArray(),
    database.climbingSessions.where('date').between(historyStart, agendaEnd, true, true).toArray(),
    database.ouraDays
      .where('date')
      .between(addDaysISO(date, -(OURA_DAYS - 1)), date, true, true)
      .toArray(),
    database.bodyMetrics.where('date').belowOrEqual(date).toArray(),
    database.foodEntries.where('date').between(addDaysISO(date, -7), date, true, true).toArray(),
    database.bodyReviews.where('date').belowOrEqual(date).toArray(),
    database.pantryItems.toArray(),
  ])
  const catalog = buildCatalog(fedb, customExercises)

  const climbing = climbingDaysSeries(profile, settings)
  const agenda = buildAgenda(date, agendaEnd, {
    today: date,
    program: program ?? null,
    series: climbing ? [...series, climbing] : series,
    events,
    workouts,
    climbs: climbs.filter((session) => session.date >= date),
  })

  const weighIns = weighInsOf(metrics)
  const weightKg = weighIns.at(-1)?.kg ?? profile.weightKg
  const year = Number(date.slice(0, 4))
  const targets = computeTargets(profile, weightKg, goals, year)
  const review = reviews.sort((a, b) => a.date.localeCompare(b.date)).at(-1)

  return {
    date,
    profile: {
      sex: profile.sex,
      age: profile.birthYear === null ? null : year - profile.birthYear,
      heightCm: profile.heightCm,
      weightKg,
      experience: profile.experience,
      focuses: [...profile.focuses],
      targetSkills: [...profile.targetSkills],
      sessionsPerWeek: profile.sessionsPerWeek,
      sessionMinutes: profile.sessionMinutes,
      trainingDays: [...profile.trainingDays],
      climbingDays: [...profile.climbingDays],
    },
    program: program ? programOf(program, date, catalog) : null,
    agenda: [...agenda.entries()].flatMap(([day, items]) =>
      items.map((item) => ({ date: day, label: itemTitle(item), status: item.status })),
    ),
    workouts: workouts
      .filter((workout) => workout.status === 'done' && workout.date >= historyStart && workout.date <= date)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt))
      .map((workout) => ({
        date: workout.date,
        title: workout.title,
        rpe: workout.rpe,
        exercises: workout.exercises.flatMap((exercise) => {
          const line = workoutExerciseLine(exerciseName(catalog, exercise.exerciseId), exercise.sets)
          return line === null ? [] : [line]
        }),
      })),
    climbing: climbs
      .filter((session) => session.status === 'done' && session.date <= date)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt))
      .map((session) => ({ date: session.date, summary: climbSubtitle(session) })),
    oura: ouraDays
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => ({
        date: row.date,
        readinessScore: row.readinessScore,
        sleepScore: row.sleepScore,
        sleepMin: row.sleepMin,
        hrvMs: row.hrvMs,
        totalKcal: row.totalKcal,
        activeKcal: row.activeKcal,
        steps: row.steps,
      })),
    weights: weighIns.filter((weighIn) => weighIn.date >= addDaysISO(date, -(WEIGHT_DAYS - 1))),
    nutrition: {
      phase: goals.phase,
      targets: targets.ok ? targets.targets : null,
      today: roundNutrients(
        sumNutrients(entries.filter((entry) => entry.date === date).map((entry) => entry.nutrients)),
      ),
      last7Avg: dailyAverage(entries.filter((entry) => entry.date < date)),
    },
    bodyReview: review ? { date: review.date, phase: review.phase, bodyFat: review.bodyFat } : null,
    pantry: pantry
      .sort(
        (a, b) =>
          PLACE_ORDER.indexOf(a.place) - PLACE_ORDER.indexOf(b.place) || collator.compare(a.name, b.name),
      )
      .map((item) => ({ place: item.place, name: item.name, quantity: item.quantity })),
  }
}
