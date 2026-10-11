import type { CalendarEvent, EventSeries, Program, ProgramSession, Workout } from '@/db/types'
import { profile } from '@/test/fixtures'
import {
  buildAgenda,
  climbingDaysSeries,
  CLIMBING_DAYS_SERIES_ID,
  firstOccurrence,
  itemKind,
  itemTitle,
  nextPlannedSession,
  seriesOccursOn,
  type Agenda,
  type AgendaItem,
  type AgendaSources,
} from './agenda'

const session = (id: string, weekdays: ProgramSession['weekdays']): ProgramSession => ({
  id,
  name: `Séance ${id}`,
  emphasis: 'full',
  weekdays,
  blocks: [],
})

function program(patch: Partial<Program> = {}): Program {
  return {
    id: 'p1',
    name: 'Force',
    active: true,
    source: 'generated',
    focuses: ['strength'],
    locationId: null,
    // A le lundi et le jeudi, B le mercredi ; le programme commence le mercredi 14 octobre 2026.
    sessions: [session('A', [1, 4]), session('B', [3])],
    startDate: '2026-10-14',
    deloadEveryWeeks: null,
    rationale: [],
    notes: '',
    createdAt: '2026-10-10T08:00:00.000Z',
    updatedAt: '2026-10-10T08:00:00.000Z',
    ...patch,
  }
}

function workout(id: string, date: string, sessionId: string | null, patch: Partial<Workout> = {}): Workout {
  return {
    id,
    date,
    startedAt: `${date}T17:00:00.000Z`,
    endedAt: `${date}T18:00:00.000Z`,
    title: sessionId ? `Séance ${sessionId}` : 'Séance libre',
    programId: sessionId ? 'p1' : null,
    programSessionId: sessionId,
    plannedFor: null,
    eventId: null,
    exercises: [],
    rpe: null,
    notes: '',
    status: 'done',
    deload: false,
    progression: [],
    ...patch,
  }
}

function event(id: string, date: string, patch: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    date,
    time: null,
    kind: 'cardio',
    title: 'Course à pied',
    durationMin: null,
    programId: null,
    programSessionId: null,
    seriesId: null,
    status: 'planned',
    workoutId: null,
    climbingSessionId: null,
    energyKcal: null,
    distanceKm: null,
    notes: '',
    createdAt: '2026-10-10T08:00:00.000Z',
    updatedAt: '2026-10-10T08:00:00.000Z',
    ...patch,
  }
}

function series(id: string, patch: Partial<EventSeries> = {}): EventSeries {
  return {
    id,
    kind: 'custom',
    title: 'Yoga',
    weekdays: [2],
    intervalWeeks: 1,
    startDate: '2026-10-13',
    endDate: null,
    time: null,
    durationMin: 45,
    notes: '',
    createdAt: '2026-10-10T08:00:00.000Z',
    updatedAt: '2026-10-10T08:00:00.000Z',
    ...patch,
  }
}

function sources(patch: Partial<AgendaSources>): AgendaSources {
  return { today: '2026-10-28', program: null, series: [], events: [], workouts: [], ...patch }
}

/** Le contenu d'une journée, en clair : « type:titre:statut[:détail] ». */
function dayLines(agenda: Agenda, date: string): string[] {
  return (agenda.get(date) ?? []).map((item: AgendaItem) => {
    const base = `${item.type}:${itemTitle(item)}:${item.status}`
    if (item.type === 'program') return item.workout ? `${base}:${item.workout.id}` : base
    if (item.type === 'workout') return item.countsFor ? `${base}:pour ${item.countsFor}` : base
    return base
  })
}

describe('séries répétées', () => {
  it('tombe les bons jours, une semaine sur N, entre le début et la fin', () => {
    const on = (date: string) =>
      seriesOccursOn(
        { weekdays: [2, 4], intervalWeeks: 2, startDate: '2026-10-13', endDate: '2026-11-10' },
        date,
      )
    expect(on('2026-10-13')).toBe(true)
    expect(on('2026-10-15')).toBe(true)
    expect(on('2026-10-14')).toBe(false) // mercredi
    expect(on('2026-10-20')).toBe(false) // semaine sautée
    expect(on('2026-10-27')).toBe(true)
    expect(on('2026-11-10')).toBe(true) // dernier jour compris
    expect(on('2026-11-12')).toBe(false) // après la fin
    expect(on('2026-10-06')).toBe(false) // avant le début

    // Commencée un mercredi : le lundi suivant est déjà la deuxième semaine.
    const monday = (intervalWeeks: number, date: string) =>
      seriesOccursOn({ weekdays: [1], intervalWeeks, startDate: '2026-10-14', endDate: null }, date)
    expect(monday(1, '2026-10-12')).toBe(false)
    expect(monday(1, '2026-10-19')).toBe(true)
    expect(monday(2, '2026-10-19')).toBe(false)
    expect(monday(2, '2026-10-26')).toBe(true)
  })

  it('trouve le premier jour d’une série', () => {
    const tuesdays: Parameters<typeof firstOccurrence>[0] = {
      weekdays: [2],
      intervalWeeks: 2,
      startDate: '2026-10-14',
      endDate: null,
    }
    expect(firstOccurrence({ ...tuesdays, weekdays: [2, 5] })).toBe('2026-10-16')
    expect(firstOccurrence(tuesdays)).toBe('2026-10-27') // la semaine suivante est sautée
    expect(firstOccurrence({ ...tuesdays, startDate: '2026-10-13' })).toBe('2026-10-13')
    expect(firstOccurrence({ ...tuesdays, intervalWeeks: 4, startDate: '2026-10-18' })).toBe('2026-11-10')
    expect(firstOccurrence({ ...tuesdays, endDate: '2026-10-26' })).toBeNull()
    expect(firstOccurrence({ ...tuesdays, weekdays: [] })).toBeNull()
  })

  it('suit les jours d’escalade du profil, sauf si l’escalade est masquée', () => {
    const climbing = climbingDaysSeries(profile({ climbingDays: [6] }), { hiddenModules: [] })
    expect(climbing).toMatchObject({
      id: CLIMBING_DAYS_SERIES_ID,
      kind: 'climbing',
      title: 'Escalade',
      weekdays: [6],
      startDate: '2026-10-10',
    })
    expect(climbingDaysSeries(profile({ climbingDays: [] }), { hiddenModules: [] })).toBeNull()
    expect(climbingDaysSeries(profile({ climbingDays: [6] }), { hiddenModules: ['climbing'] })).toBeNull()
  })
})

describe('agenda', () => {
  it('relie chaque séance faite à la séance du programme la plus proche', () => {
    const agenda = buildAgenda(
      '2026-10-12',
      '2026-10-25',
      sources({
        program: program(),
        workouts: [
          workout('w1', '2026-10-15', 'A'), // le jour même
          workout('w2', '2026-10-20', 'A'), // rattrape celle du lundi 19
          workout('w3', '2026-10-24', 'A'), // à égale distance du jeudi 22 et du lundi 26 : rattrapage
          workout('w4', '2026-10-17', 'B'), // rattrape celle du mercredi 14 (3 jours)
          workout('w5', '2026-10-18', null), // séance libre
          workout('w6', '2026-10-21', 'B'),
          workout('w7', '2026-10-21', 'B', { startedAt: '2026-10-21T19:00:00.000Z' }), // refaite le soir
        ],
      }),
    )
    expect(dayLines(agenda, '2026-10-12')).toEqual([]) // avant le début du programme
    expect(dayLines(agenda, '2026-10-14')).toEqual(['program:Séance B:done:w4'])
    expect(dayLines(agenda, '2026-10-15')).toEqual(['program:Séance A:done:w1'])
    expect(dayLines(agenda, '2026-10-17')).toEqual(['workout:Séance B:done:pour 2026-10-14'])
    expect(dayLines(agenda, '2026-10-18')).toEqual(['workout:Séance libre:done'])
    expect(dayLines(agenda, '2026-10-19')).toEqual(['program:Séance A:done:w2'])
    expect(dayLines(agenda, '2026-10-20')).toEqual(['workout:Séance A:done:pour 2026-10-19'])
    expect(dayLines(agenda, '2026-10-21')).toEqual(['program:Séance B:done:w6', 'workout:Séance B:done'])
    expect(dayLines(agenda, '2026-10-22')).toEqual(['program:Séance A:done:w3'])
    expect(dayLines(agenda, '2026-10-24')).toEqual(['workout:Séance A:done:pour 2026-10-22'])
    expect([...agenda.keys()]).toHaveLength(14)
  })

  it('compte une séance faite en avance pour le jour prévu', () => {
    // Faite le dimanche, la séance du lundi est remplie ; la suivante reste à faire.
    const agenda = buildAgenda(
      '2026-10-18',
      '2026-10-22',
      sources({ today: '2026-10-18', program: program(), workouts: [workout('w1', '2026-10-18', 'A')] }),
    )
    expect(dayLines(agenda, '2026-10-18')).toEqual(['workout:Séance A:done:pour 2026-10-19'])
    expect(dayLines(agenda, '2026-10-19')).toEqual(['program:Séance A:done:w1'])
    expect(nextPlannedSession(agenda, '2026-10-18')).toMatchObject({
      date: '2026-10-21',
      session: { id: 'B' },
    })
  })

  it('distingue séances prévues, manquées, passées et en cours', () => {
    const agenda = buildAgenda(
      '2026-10-12',
      '2026-10-26',
      sources({
        today: '2026-10-21',
        program: program({ startDate: '2026-10-12' }),
        events: [
          event('skip1', '2026-10-14', { kind: 'program', status: 'skipped', programSessionId: 'B' }),
          event('skip2', '2026-10-19', { kind: 'program', status: 'skipped', programSessionId: 'A' }),
        ],
        workouts: [
          workout('w1', '2026-10-19', 'A'), // passée puis faite quand même : faite
          workout('w2', '2026-10-21', 'B', { status: 'active', endedAt: null }),
        ],
      }),
    )
    expect(dayLines(agenda, '2026-10-12')).toEqual(['program:Séance A:missed'])
    expect(dayLines(agenda, '2026-10-14')).toEqual(['program:Séance B:skipped'])
    expect(dayLines(agenda, '2026-10-19')).toEqual(['program:Séance A:done:w1'])
    expect(dayLines(agenda, '2026-10-21')).toEqual(['program:Séance B:active:w2'])
    expect(dayLines(agenda, '2026-10-22')).toEqual(['program:Séance A:planned'])
    expect(nextPlannedSession(agenda, '2026-10-21')).toMatchObject({ date: '2026-10-22' })
    expect(nextPlannedSession(agenda, '2026-10-26')).toBeNull()
  })

  it('remplit la séance choisie en la commençant', () => {
    const agenda = buildAgenda(
      '2026-10-19',
      '2026-10-25',
      sources({
        today: '2026-10-23',
        program: program({ startDate: '2026-10-12' }),
        workouts: [
          // Le mardi, on fait celle du jeudi plutôt que de rattraper celle du lundi.
          workout('w1', '2026-10-20', 'A', { plannedFor: '2026-10-22' }),
          // Pas de séance B le mardi (programme modifié depuis) : elle remplit la plus proche.
          workout('w2', '2026-10-21', 'B', { plannedFor: '2026-10-20' }),
          // Celle du jeudi est déjà remplie : la plus proche ensuite, celle du lundi suivant.
          workout('w3', '2026-10-23', 'A', { plannedFor: '2026-10-22' }),
        ],
      }),
    )
    expect(dayLines(agenda, '2026-10-19')).toEqual(['program:Séance A:missed'])
    expect(dayLines(agenda, '2026-10-20')).toEqual(['workout:Séance A:done:pour 2026-10-22'])
    expect(dayLines(agenda, '2026-10-21')).toEqual(['program:Séance B:done:w2'])
    expect(dayLines(agenda, '2026-10-22')).toEqual(['program:Séance A:done:w1'])
    expect(dayLines(agenda, '2026-10-23')).toEqual(['workout:Séance A:done:pour 2026-10-26'])
  })

  it('ne remplit une séance passée qu’en dernier recours', () => {
    const sourcesWith = (sessions: ProgramSession[]) =>
      sources({
        today: '2026-10-20',
        program: program({ startDate: '2026-10-12', sessions }),
        events: [event('skip', '2026-10-19', { kind: 'program', status: 'skipped', programSessionId: 'A' })],
        workouts: [workout('w1', '2026-10-20', 'A')],
      })
    // Le lundi 19 est passé : la séance A faite le mardi 20 compte pour le jeudi 22.
    const agenda = buildAgenda('2026-10-19', '2026-10-25', sourcesWith([session('A', [1, 4])]))
    expect(dayLines(agenda, '2026-10-19')).toEqual(['program:Séance A:skipped'])
    expect(dayLines(agenda, '2026-10-20')).toEqual(['workout:Séance A:done:pour 2026-10-22'])
    expect(dayLines(agenda, '2026-10-22')).toEqual(['program:Séance A:done:w1'])
    // Pas d'autre séance A à moins de trois jours : elle rattrape celle du lundi.
    const mondays = buildAgenda('2026-10-19', '2026-10-25', sourcesWith([session('A', [1])]))
    expect(dayLines(mondays, '2026-10-19')).toEqual(['program:Séance A:done:w1'])
  })

  it('montre les séances perso, les séries et les jours d’escalade', () => {
    const climbing = climbingDaysSeries(profile({ climbingDays: [6] }), { hiddenModules: [] })
    const yoga = series('s1', { time: '07:30', endDate: '2026-10-27' })
    const agenda = buildAgenda(
      '2026-10-12',
      '2026-10-25',
      sources({
        today: '2026-10-21',
        program: program({ startDate: '2026-10-12', sessions: [session('A', [2])] }),
        series: climbing ? [yoga, climbing] : [yoga],
        events: [
          event('e1', '2026-10-20', { seriesId: 's1', kind: 'custom', title: 'Yoga', status: 'done' }),
          event('e2', '2026-10-21', { seriesId: 's1', status: 'skipped' }), // plus dans la série : rien
          event('e3', '2026-10-22', { seriesId: 's1', title: 'Yoga déplacé' }), // ponctuel désormais
          event('e4', '2026-10-18', { status: 'done' }),
          event('e5', '2026-10-16', { title: 'Vélo' }), // prévue, passée sans être notée
          event('e6', '2026-10-23', { title: 'Natation' }),
          event('e7', '2026-10-13', { title: 'Réveil musculaire', time: '06:00', kind: 'custom' }),
          event('e8', '2026-10-17', {
            seriesId: CLIMBING_DAYS_SERIES_ID,
            kind: 'climbing',
            title: 'Escalade',
            status: 'done',
          }),
        ],
      }),
    )
    // Sans heure d'abord (comme « toute la journée »), puis par heure.
    expect(dayLines(agenda, '2026-10-13')).toEqual([
      'program:Séance A:missed',
      'event:Réveil musculaire:missed',
      'occurrence:Yoga:missed',
    ])
    expect(dayLines(agenda, '2026-10-16')).toEqual(['event:Vélo:missed'])
    expect(dayLines(agenda, '2026-10-17')).toEqual(['event:Escalade:done'])
    expect(dayLines(agenda, '2026-10-18')).toEqual(['event:Course à pied:done'])
    expect(dayLines(agenda, '2026-10-20')).toEqual(['program:Séance A:missed', 'event:Yoga:done'])
    expect(dayLines(agenda, '2026-10-21')).toEqual([])
    expect(dayLines(agenda, '2026-10-22')).toEqual(['event:Yoga déplacé:planned'])
    expect(dayLines(agenda, '2026-10-23')).toEqual(['event:Natation:planned'])
    expect(dayLines(agenda, '2026-10-24')).toEqual(['occurrence:Escalade:planned'])

    const done = agenda.get('2026-10-20')?.[1]
    expect(done?.type === 'event' ? done.series?.id : null).toBe('s1')
    expect(done && itemKind(done)).toBe('custom')
    const climb = agenda.get('2026-10-24')?.[0]
    expect(climb && itemKind(climb)).toBe('climbing')
  })

  it('montre toutes les séances faites quand il n’y a pas de programme', () => {
    const agenda = buildAgenda(
      '2026-10-19',
      '2026-10-25',
      sources({ workouts: [workout('w1', '2026-10-19', 'A'), workout('w2', '2026-10-20', null)] }),
    )
    expect(dayLines(agenda, '2026-10-19')).toEqual(['workout:Séance A:done'])
    expect(dayLines(agenda, '2026-10-20')).toEqual(['workout:Séance libre:done'])
    const first = agenda.get('2026-10-19')?.[0]
    expect(first && itemKind(first)).toBe('program')
  })
})
