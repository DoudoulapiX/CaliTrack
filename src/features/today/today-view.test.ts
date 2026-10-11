import { buildAgenda, climbingDaysSeries, type AgendaSources } from '@/content/calendar/agenda'
import { defaultGradeScales } from '@/content/grades'
import type { BodyMetric } from '@/db/types'
import { frenchSpacing, keepTogether } from '@/lib/typography'
import { climbHistoryPath, climbLivePath } from '@/features/climbing/climb-view'
import { historyPath, workoutPath } from '@/features/workout/useWorkouts'
import { calendarEvent, climbSession, doneWorkout, profile, testProgram } from '@/test/fixtures'
import {
  climbingPlanned,
  extrasLines,
  programLine,
  recentRecords,
  rowPath,
  sparklinePoints,
  todayRows,
  trendLine,
  weekCounts,
  weighInsOf,
  weightSource,
  weightTrend,
} from './today-view'

// Le mercredi 21 octobre 2026 : séance B du programme ; A le lundi 19 et le jeudi 22.
const TODAY = '2026-10-21'
const WEEK = [
  '2026-10-19',
  '2026-10-20',
  '2026-10-21',
  '2026-10-22',
  '2026-10-23',
  '2026-10-24',
  '2026-10-25',
]

function agendaOf(patch: Partial<AgendaSources>) {
  return buildAgenda(WEEK[0] ?? TODAY, WEEK[6] ?? TODAY, {
    today: TODAY,
    program: testProgram(),
    series: [],
    events: [],
    workouts: [],
    climbs: [],
    ...patch,
  })
}

const titles = (items: readonly { key: string }[]) => items.map((item) => item.key)

describe('carte « Au programme »', () => {
  it('liste le reste de la journée sous la séance du programme à faire', () => {
    const items =
      agendaOf({
        events: [calendarEvent('run', TODAY)],
        workouts: [doneWorkout('libre', TODAY)],
      }).get(TODAY) ?? []
    expect(titles(todayRows(items, { hasProgram: true, workoutActive: false }))).toEqual([
      'seance-libre',
      'perso-run',
    ])
  })

  it('laisse la séance faite à la carte du jour quand il ne reste rien à faire', () => {
    const items =
      agendaOf({
        events: [calendarEvent('run', TODAY)],
        workouts: [
          doneWorkout('b', TODAY, [], { programId: 'p1', programSessionId: 'B' }),
          doneWorkout('libre', TODAY, [], { startedAt: `${TODAY}T18:00:00.000Z` }),
        ],
      }).get(TODAY) ?? []
    expect(titles(todayRows(items, { hasProgram: true, workoutActive: false }))).toEqual(['perso-run'])
    // Une séance en cours prend la carte : les séances faites reviennent dans la liste.
    expect(titles(todayRows(items, { hasProgram: true, workoutActive: true }))).toEqual([
      'seance-libre',
      'perso-run',
    ])
  })

  it('sans programme, liste les séances faites mais pas celle en cours', () => {
    const items =
      agendaOf({
        program: null,
        workouts: [
          doneWorkout('libre', TODAY),
          doneWorkout('encours', TODAY, [], { status: 'active', endedAt: null }),
        ],
      }).get(TODAY) ?? []
    expect(titles(todayRows(items, { hasProgram: false, workoutActive: true }))).toEqual(['seance-libre'])
  })

  it('ouvre chaque ligne au bon endroit', () => {
    const climbing = climbingDaysSeries(profile({ climbingDays: [3] }), { hiddenModules: [] })
    const done = climbSession('c1', TODAY)
    const items =
      agendaOf({
        program: null,
        series: climbing ? [climbing] : [],
        events: [calendarEvent('run', TODAY)],
        workouts: [doneWorkout('libre', TODAY), doneWorkout('encours', TODAY, [], { status: 'active' })],
        climbs: [done, climbSession('c2', TODAY, [], { status: 'active', endedAt: null })],
      }).get(TODAY) ?? []
    expect(items.map(rowPath)).toEqual(
      expect.arrayContaining([
        historyPath('libre'),
        workoutPath('encours'),
        '/calendar?jour=2026-10-21',
        climbHistoryPath('c1'),
        climbLivePath('c2'),
      ]),
    )
  })

  it('repère l’escalade prévue et pas encore notée', () => {
    const climbing = climbingDaysSeries(profile({ climbingDays: [3] }), { hiddenModules: [] })
    const series = climbing ? [climbing] : []
    expect(climbingPlanned(agendaOf({ series }).get(TODAY) ?? [])).toBe(true)
    expect(climbingPlanned(agendaOf({ series, climbs: [climbSession('c1', TODAY)] }).get(TODAY) ?? [])).toBe(
      false,
    )
    expect(climbingPlanned(agendaOf({}).get(TODAY) ?? [])).toBe(false)
  })
})

describe('carte « Ma semaine »', () => {
  it('compte les séances du programme faites et le reste', () => {
    const agenda = agendaOf({
      workouts: [
        doneWorkout('a', '2026-10-19', [], { programId: 'p1', programSessionId: 'A' }),
        doneWorkout('libre', '2026-10-20'),
      ],
      events: [calendarEvent('run', '2026-10-19', { status: 'done' }), calendarEvent('velo', '2026-10-23')],
      climbs: [climbSession('c1', '2026-10-20')],
    })
    const counts = weekCounts(agenda, WEEK)
    expect(counts).toEqual({ planned: 3, done: 1, free: 1, climbs: 1, other: 1 })
    expect(programLine(counts)).toBe('1 séance faite sur 3')
    expect(extrasLines(counts)).toEqual(['1 séance libre', '1 séance d’escalade', '1 autre activité'])
  })

  it('accorde les nombres et se tait sans programme', () => {
    expect(programLine({ planned: 4, done: 2 })).toBe('2 séances faites sur 4')
    expect(programLine({ planned: 0, done: 0 })).toBeNull()
    expect(extrasLines({ free: 2, climbs: 3, other: 2 })).toEqual([
      '2 séances libres',
      '3 séances d’escalade',
      '2 autres activités',
    ])
    expect(extrasLines({ free: 0, climbs: 0, other: 0 })).toEqual([])
  })

  it('ne compte pas deux fois une séance faite en avance pour un jour de la semaine', () => {
    // La séance A du jeudi 22, faite le mardi 20.
    const agenda = agendaOf({
      workouts: [doneWorkout('a', '2026-10-20', [], { programId: 'p1', programSessionId: 'A' })],
    })
    expect(weekCounts(agenda, WEEK)).toMatchObject({ planned: 3, done: 1, free: 0 })
  })
})

const metric = (date: string, weightKg: number | null): BodyMetric => ({
  id: `m-${date}`,
  date,
  weightKg,
  bodyFatPct: null,
  waistCm: weightKg === null ? 80 : null,
  note: '',
  createdAt: `${date}T07:00:00.000Z`,
})

describe('carte « Poids »', () => {
  const points = weighInsOf([
    metric('2026-10-20', 73.3),
    metric('2026-09-10', 75),
    metric('2026-10-10', 73.9),
    metric('2026-10-12', null),
    metric('2026-09-25', 74.5),
  ])

  it('garde les pesées dans l’ordre, sans les mensurations seules', () => {
    expect(points.map((p) => p.date)).toEqual(['2026-09-10', '2026-09-25', '2026-10-10', '2026-10-20'])
  })

  it('donne l’évolution depuis la première pesée des 30 derniers jours', () => {
    const trend = weightTrend(points, TODAY)
    expect(trend?.since).toBe('2026-09-25')
    expect(trend?.deltaKg).toBeCloseTo(-1.2)
    // Le poids et la date ne se coupent pas en fin de ligne.
    expect(trend && trendLine(trend, 'kg', TODAY)).toBe(
      `−${keepTogether('1,2 kg')} depuis le ${keepTogether('25 septembre')}`,
    )
    expect(trend && trendLine(trend, 'lb', TODAY)).toBe(
      `−${keepTogether('2,6 lb')} depuis le ${keepTogether('25 septembre')}`,
    )
    expect(trendLine({ deltaKg: 0.4, since: '2026-10-01' }, 'kg', TODAY)).toBe(
      '+0,4\u00a0kg depuis le 1\u00a0octobre',
    )
    expect(trendLine({ deltaKg: 0.02, since: '2025-12-01' }, 'kg', TODAY)).toBe(
      `Stable depuis le ${keepTogether('1 décembre 2025')}`,
    )
    // Une seule pesée dans la période, ou aucune : pas d'évolution.
    expect(weightTrend(points, '2026-11-15')).toBeNull()
    expect(weightTrend(points, '2027-01-01')).toBeNull()
    expect(weightTrend([], TODAY)).toBeNull()
  })

  it('dit d’où vient le poids affiché', () => {
    expect(weightSource({ date: TODAY, kg: 73 }, 72, TODAY)).toBe(
      frenchSpacing('Dernière pesée : aujourd’hui'),
    )
    expect(weightSource({ date: '2026-10-17', kg: 73 }, 72, TODAY)).toBe(
      frenchSpacing(`Dernière pesée : ${keepTogether('samedi 17 octobre')}`),
    )
    expect(weightSource(null, 72, TODAY)).toBe('Poids de ton profil, aucune pesée notée')
    expect(weightSource(null, null, TODAY)).toBe('Aucune pesée notée')
  })

  it('trace la courbe des pesées de la période', () => {
    expect(sparklinePoints(points, '2026-09-21', TODAY, 100, 32)).toBe('13.3,0 63.3,16 96.7,32')
    expect(
      sparklinePoints(
        [
          { date: '2026-10-01', kg: 70 },
          { date: '2026-10-21', kg: 70 },
        ],
        '2026-09-21',
        TODAY,
        100,
        32,
      ),
    ).toBe('33.3,16 100,16')
    expect(sparklinePoints(points, '2026-10-15', TODAY, 100, 32)).toBeNull()
  })
})

describe('carte « Records récents »', () => {
  const scales = defaultGradeScales()
  const workouts = [
    doneWorkout('w1', '2026-10-01', [['pullup', [8, 8]]]),
    doneWorkout('w2', '2026-10-10', [['pullup', [10]]]),
    doneWorkout('w3', '2026-10-15', [
      ['pullup', [12]],
      ['dip', [10]],
    ]),
  ]
  const climbs = [
    climbSession('c1', '2026-10-02', [['bleu', 'flash']]),
    climbSession('c2', '2026-10-12', [['rouge', 'sent']]),
    climbSession('c3', '2026-10-14', [['noir', 'flash']]),
    // En cours, ou sur une échelle supprimée : ignorées.
    climbSession('c4', '2026-10-16', [['violet', 'flash']], { status: 'active', endedAt: null }),
    climbSession('c5', '2026-10-16', [['violet', 'flash']], { scaleId: 'supprimee' }),
  ]
  const lines = (from: string) =>
    recentRecords(workouts, climbs, scales, from).map((r) =>
      r.type === 'workout'
        ? `${r.date} ${r.hit.exerciseId} ${r.hit.kind} ${String(r.hit.previous.value)}→${String(r.hit.entry.value)}`
        : `${r.date} escalade ${r.record.kind} ${r.record.previous?.key ?? '-'}→${r.record.grade.key}`,
    )

  it('garde le dernier record de chaque sorte, le plus récent d’abord', () => {
    expect(lines('2026-10-05')).toEqual([
      '2026-10-15 pullup reps 10→12',
      '2026-10-14 escalade hardest rouge→noir',
      '2026-10-14 escalade hardestFlash bleu→noir',
    ])
    expect(lines('2026-10-15')).toEqual(['2026-10-15 pullup reps 10→12'])
    expect(lines('2026-10-20')).toEqual([])
  })
})
