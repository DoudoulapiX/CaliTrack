import type { Catalog } from '@/content/exercises/catalog'
import type { CoachCheckIn, ProgramSession, ProgramSlot } from '@/db/types'
import { coachChange, coachDay, testCatalog, testProgram } from '@/test/fixtures'
import { ouraDay } from '@/test/oura'
import {
  changeLine,
  checkInDraft,
  checkInOf,
  DECISION_LABEL,
  formLines,
  headlineBesides,
  ignoreLabel,
  newestDay,
  NO_SESSION_TEXT,
  ouraNight,
  restLabel,
  SESSION_STATUS_TEXT,
  TIPS_LABEL,
  TODAY_COACH_TEXT,
  todayCoachState,
} from './coach-today-view'

// La carte de l'accueil passe par ce module : il ne doit jamais charger le SDK de Claude (lourd, et
// inutile tant qu'on ne demande rien). S'il l'importait, ce fichier de tests ne se chargerait pas.
vi.mock('@anthropic-ai/sdk', () => {
  throw new Error('Le SDK de Claude ne doit pas être chargé par la carte de la séance du jour')
})

const DATE = '2026-10-21'
/** Les espaces (insécables comprises) ramenées à des espaces normales, pour lire les textes. */
const plain = (text: string) => text.replace(/\s/g, ' ')

const SLOT: ProgramSlot = {
  id: 'slot-1',
  ladderId: 'pullV',
  exerciseId: 'pullup',
  sets: 4,
  target: { kind: 'reps', min: 5, max: 8 },
  loadKg: null,
  restSec: 120,
  note: '',
  successStreak: 0,
  failStreak: 0,
}

const SESSION: ProgramSession = {
  id: 'B',
  name: 'Séance B',
  emphasis: 'full',
  weekdays: [3],
  blocks: [{ id: 'b1', kind: 'strength', title: 'Renforcement', slots: [SLOT] }],
}
const PROGRAM = testProgram({ sessions: [SESSION] })
const PULLUP_CHANGE = coachChange({ plannedExerciseId: 'pullup', exerciseId: 'pullup' })

describe('le coach sur la carte de la séance du jour', () => {
  const state = (day: Parameters<typeof todayCoachState>[0]['day'], hasKey = true) =>
    todayCoachState({ day, program: PROGRAM, session: SESSION, date: DATE, hasKey })

  it('rien sans clé, même avec un conseil', () => {
    expect(state(coachDay({ decision: 'rest' }), false)).toEqual({ kind: 'off' })
    expect(state(null, false)).toEqual({ kind: 'off' })
  })

  it('propose de demander tant qu’il n’y a pas de conseil valable pour cette séance', () => {
    expect(state(undefined)).toEqual({ kind: 'ask' })
    expect(state(null)).toEqual({ kind: 'ask' })
    expect(state(coachDay({ date: '2026-10-20' }))).toEqual({ kind: 'ask' })
    expect(state(coachDay({ programSessionId: 'A' }))).toEqual({ kind: 'ask' })
    expect(state(coachDay({ decision: 'rest', ignored: true }))).toEqual({ kind: 'ask' })
    expect(state(coachDay({ decision: null, programId: null, programSessionId: null }))).toEqual({
      kind: 'ask',
    })
  })

  it('montre le conseil : séance prévue, allégée ou repos', () => {
    expect(state(coachDay())).toEqual({
      kind: 'asPlanned',
      plan: { decision: 'asPlanned', changes: [], headline: 'Séance prévue validée' },
    })
    expect(state(coachDay({ decision: 'lighter', changes: [PULLUP_CHANGE], headline: 'Allège' }))).toEqual({
      kind: 'lighter',
      plan: { decision: 'lighter', changes: [PULLUP_CHANGE], headline: 'Allège' },
    })
    expect(state(coachDay({ decision: 'rest', headline: 'Repos' }))).toEqual({
      kind: 'rest',
      plan: { decision: 'rest', changes: [], headline: 'Repos' },
    })
  })

  it('une séance allégée dont l’exercice a changé depuis redevient la séance prévue', () => {
    // coachChange() vise « pull-up », qui n'est plus l'exercice du créneau.
    expect(state(coachDay({ decision: 'lighter', changes: [coachChange()] })).kind).toBe('asPlanned')
  })
})

describe('textes du coach du jour', () => {
  it('ne parlent jamais de « cette nuit »', () => {
    const texts = [
      ...Object.values(TODAY_COACH_TEXT),
      ...Object.values(DECISION_LABEL),
      ...Object.values(SESSION_STATUS_TEXT),
      TIPS_LABEL,
      NO_SESSION_TEXT,
      ignoreLabel(true),
      ignoreLabel(false),
      ...formLines(ouraDay(DATE), ouraDay('2026-10-20')),
      ...formLines(null, null),
    ]
    for (const text of texts) expect(text).not.toMatch(/cette\s+nuit/i)
  })

  it('ne répète pas le badge dans le titre du conseil', () => {
    expect(headlineBesides('Repos conseillé', 'Repos conseillé')).toBeNull()
    expect(headlineBesides('  repos conseillé !', 'Repos conseillé')).toBeNull()
    expect(headlineBesides('Séance allégée.', 'Séance allégée')).toBeNull()
    expect(headlineBesides('   ', 'Séance allégée')).toBeNull()
    expect(headlineBesides('  Nuit courte : on allège  ', 'Allégée par le coach')).toBe(
      'Nuit courte : on allège',
    )
  })

  it('le bouton du conseil mis de côté, et celui du repos', () => {
    expect(ignoreLabel(false)).toBe('Revenir à la séance prévue')
    expect(ignoreLabel(true)).toBe('Reprendre le conseil du coach')
    expect(restLabel(false)).toBe('Prendre ma journée de repos')
    expect(restLabel(true)).toBe('Annuler le repos')
  })

  it('met une espace insécable avant les deux-points', () => {
    expect(NO_SESSION_TEXT).toBe(
      'Pas de séance prévue aujourd’hui\u00a0: le coach te donne des conseils pour la journée.',
    )
  })
})

describe('un exercice changé, avant → après', () => {
  let catalog: Catalog
  beforeAll(async () => {
    catalog = await testCatalog()
  })
  const line = (...args: Parameters<typeof changeLine>) => plain(changeLine(...args))

  it('moins de séries, sans couper une prescription', () => {
    const text = changeLine(PULLUP_CHANGE, SLOT, false, catalog.byId, 'kg')
    expect(text).toBe(
      'Tractions · 4\u00a0×\u00a05\u00a0à\u00a08\u00a0rép. → 3\u00a0×\u00a05\u00a0à\u00a08\u00a0rép.',
    )
  })

  it('compte les séries d’avant sur la semaine allégée', () => {
    expect(line(coachChange({ ...PULLUP_CHANGE, sets: 1 }), SLOT, true, catalog.byId, 'kg')).toBe(
      'Tractions · 2 × 5 à 8 rép. → 5 à 8 rép.',
    )
  })

  it('une charge plus légère, dans l’unité choisie', () => {
    const loaded = { ...SLOT, loadKg: 8 }
    const change = coachChange({ ...PULLUP_CHANGE, sets: 4, loadKg: 6 })
    expect(line(change, loaded, false, catalog.byId, 'kg')).toBe(
      'Tractions · 4 × 5 à 8 rép. · 8 kg → 4 × 5 à 8 rép. · 6 kg',
    )
    expect(line(change, loaded, false, catalog.byId, 'lb')).toBe(
      'Tractions · 4 × 5 à 8 rép. · 17,5 lb → 4 × 5 à 8 rép. · 13 lb',
    )
  })

  it('une version plus facile, ou l’exercice retiré', () => {
    const swap = coachChange({
      ...PULLUP_CHANGE,
      action: 'swap',
      exerciseId: 'pullup-negative',
      target: { kind: 'reps', min: 3, max: 5 },
    })
    expect(line(swap, SLOT, false, catalog.byId, 'kg')).toBe(
      'Tractions · 4 × 5 à 8 rép. → Tractions négatives · 3 × 3 à 5 rép.',
    )
    const skip = coachChange({ ...PULLUP_CHANGE, action: 'skip', sets: 4 })
    expect(line(skip, SLOT, false, catalog.byId, 'kg')).toBe('Tractions · 4 × 5 à 8 rép. → pas aujourd’hui')
  })

  it('sans la prescription d’avant quand le programme a changé, et sans planter sur un exercice disparu', () => {
    expect(line(PULLUP_CHANGE, undefined, false, catalog.byId, 'kg')).toBe('Tractions → 3 × 5 à 8 rép.')
    expect(line(PULLUP_CHANGE, { ...SLOT, exerciseId: 'pullup-archer' }, false, catalog.byId, 'kg')).toBe(
      'Tractions → 3 × 5 à 8 rép.',
    )
    const gone = coachChange({ plannedExerciseId: 'perdu', exerciseId: 'perdu', action: 'swap' })
    expect(line(gone, undefined, false, catalog.byId, 'kg')).toBe(
      'Exercice supprimé → Exercice supprimé · 3 × 5 à 8 rép.',
    )
  })
})

describe('le conseil affiché', () => {
  const live = coachDay({ updatedAt: '2026-10-21T09:00:00.000Z', headline: 'En base' })
  const saved = coachDay({ updatedAt: '2026-10-21T10:00:00.000Z', headline: 'Enregistré' })

  it('prend le plus récent de la base et de celui qu’on vient d’enregistrer', () => {
    expect(newestDay(undefined, null, DATE)).toBeNull()
    expect(newestDay(null, null, DATE)).toBeNull()
    expect(newestDay(live, null, DATE)).toBe(live)
    expect(newestDay(undefined, saved, DATE)).toBe(saved)
    expect(newestDay(null, saved, DATE)).toBe(saved)
    expect(newestDay(live, saved, DATE)).toBe(saved)
    const later = { ...live, updatedAt: '2026-10-21T11:00:00.000Z' }
    expect(newestDay(later, saved, DATE)).toBe(later)
    expect(newestDay({ ...saved }, saved, DATE)?.headline).toBe('Enregistré')
  })

  it('oublie celui d’un autre jour (l’écran est resté ouvert après minuit)', () => {
    expect(newestDay(null, { ...saved, date: '2026-10-20' }, DATE)).toBeNull()
    expect(newestDay(live, { ...saved, date: '2026-10-20' }, DATE)).toBe(live)
  })
})

describe('la forme du jour', () => {
  it('prend la nuit de la bague seulement si elle date d’aujourd’hui et a des mesures', () => {
    const today = ouraDay(DATE)
    expect(ouraNight(today, DATE)).toBe(today)
    expect(ouraNight(undefined, DATE)).toBeNull()
    expect(ouraNight(null, DATE)).toBeNull()
    expect(ouraNight(ouraDay('2026-10-20'), DATE)).toBeNull()
    const empty = ouraDay(DATE, { readinessScore: null, sleepScore: null, sleepMin: null })
    expect(ouraNight(empty, DATE)).toBeNull()
    const onlyScore = ouraDay(DATE, { readinessScore: null, sleepMin: null })
    expect(ouraNight(onlyScore, DATE)).toBe(onlyScore)
  })

  it('montre le sommeil, la récupération et la dépense complète d’hier', () => {
    const lines = formLines(ouraDay(DATE), ouraDay('2026-10-20', { totalKcal: 2650.4 }))
    expect(lines.map(plain)).toEqual([
      'Sommeil 7 h 32 · score 84',
      'Récupération 86',
      'Hier : 2 650 kcal dépensées',
    ])
    expect(lines[2]).toMatch(/^Hier\u00a0: 2\s650\u00a0kcal/)
    expect(lines[0]).toBe('Sommeil 7\u00a0h\u00a032 · score 84')
  })

  it('montre seulement ce que la bague a mesuré', () => {
    expect(formLines(ouraDay(DATE, { sleepMin: null, readinessScore: null }), null).map(plain)).toEqual([
      'Score de sommeil 84',
    ])
    expect(formLines(ouraDay(DATE, { sleepScore: null }), null).map(plain)).toEqual([
      'Sommeil 7 h 32',
      'Récupération 86',
    ])
    expect(
      formLines(
        ouraDay(DATE, { sleepScore: null, sleepMin: null }),
        ouraDay('2026-10-20', { totalKcal: null }),
      ),
    ).toEqual(['Récupération 86'])
    expect(formLines(null, null)).toEqual(['Pas de données Oura aujourd’hui.'])
    expect(formLines(null, ouraDay('2026-10-20')).map(plain)).toEqual([
      'Pas de données Oura aujourd’hui.',
      'Hier : 2 230 kcal dépensées',
    ])
  })
})

describe('le ressenti', () => {
  const last: CoachCheckIn = {
    sleep: null,
    energy: 'high',
    soreness: 'strong',
    zones: ['legs', 'back'],
    note: 'Genou sensible',
  }

  it('part du formulaire vide, ou de la dernière demande', () => {
    expect(checkInDraft()).toEqual({ sleep: 'ok', energy: 'ok', soreness: 'none', zones: [], note: '' })
    expect(checkInDraft(null)).toEqual(checkInDraft())
    const draft = checkInDraft(last)
    expect(draft).toEqual({
      sleep: 'ok',
      energy: 'high',
      soreness: 'strong',
      zones: ['legs', 'back'],
      note: 'Genou sensible',
    })
    expect(draft.zones).not.toBe(last.zones)
    expect(checkInDraft({ ...last, sleep: 'bad' }).sleep).toBe('bad')
  })

  it('envoie le sommeil seulement quand la bague ne l’a pas noté, et les zones dans l’ordre de l’écran', () => {
    const draft = { ...checkInDraft(last), sleep: 'good' as const, note: '  Genou sensible  ' }
    expect(checkInOf(draft, true)).toEqual({
      sleep: 'good',
      energy: 'high',
      soreness: 'strong',
      zones: ['back', 'legs'],
      note: 'Genou sensible',
    })
    expect(checkInOf(draft, false).sleep).toBeNull()
  })

  it('oublie les zones sans courbatures, et coupe une note trop longue', () => {
    const draft = { ...checkInDraft(last), soreness: 'none' as const, note: 'x'.repeat(400) }
    const checkIn = checkInOf(draft, false)
    expect(checkIn.zones).toEqual([])
    expect(checkIn.note).toHaveLength(300)
    expect(checkIn.note.endsWith('…')).toBe(true)
  })
})
