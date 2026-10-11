import type { CalendarEvent, EventSeries } from '@/db/types'
import { sequentialIds } from '@/test/fixtures'
import {
  draftError,
  draftFromEvent,
  draftFromSeries,
  eventFromDraft,
  isSuggestedTitle,
  newEventDraft,
  occurrenceEvent,
  seriesFromDraft,
  withDate,
  withKind,
  type EventDraft,
} from './event-form'

const TODAY = '2026-10-21' // un mercredi
const NOW = '2026-10-21T18:00:00.000Z'

describe('formulaire d’une séance perso', () => {
  it('propose une course faite aujourd’hui, prévue plus tard', () => {
    expect(newEventDraft(TODAY, TODAY)).toEqual({
      kind: 'cardio',
      title: 'Course à pied',
      date: TODAY,
      time: '',
      durationMin: null,
      distanceKm: null,
      energyKcal: null,
      notes: '',
      status: 'done',
      repeat: false,
      weekdays: [3],
      intervalWeeks: 1,
      endDate: '',
    })
    expect(newEventDraft('2026-10-19', TODAY).status).toBe('done')
    expect(newEventDraft('2026-10-24', TODAY, 'climbing')).toMatchObject({
      kind: 'climbing',
      title: 'Escalade',
      status: 'planned',
      weekdays: [6],
    })
  })

  it('change le nom avec le genre, sauf s’il a été personnalisé', () => {
    const draft = newEventDraft(TODAY, TODAY)
    expect(withKind(draft, 'climbing').title).toBe('Escalade')
    expect(withKind({ ...draft, title: 'Vélo' }, 'rest').title).toBe('Repos')
    expect(withKind({ ...draft, title: 'Sortie longue' }, 'custom').title).toBe('Sortie longue')
    expect(isSuggestedTitle('  ')).toBe(true)
    expect(isSuggestedTitle('Natation')).toBe(true)
    expect(isSuggestedTitle('Foot')).toBe(false)
  })

  it('change de jour : une séance à venir n’est pas encore faite, la série suit le jour', () => {
    const draft = newEventDraft(TODAY, TODAY)
    const later = withDate(draft, '2026-10-23', TODAY)
    expect(later).toMatchObject({ date: '2026-10-23', status: 'planned', weekdays: [5] })
    // Plusieurs jours choisis : on n'y touche pas.
    const several = withDate({ ...draft, weekdays: [1, 3] }, '2026-10-23', TODAY)
    expect(several.weekdays).toEqual([1, 3])
    // Saisie en cours (jour incomplet) : rien d'autre ne bouge.
    expect(withDate(draft, '2026-10', TODAY)).toMatchObject({
      date: '2026-10',
      status: 'done',
      weekdays: [3],
    })
  })

  it('refuse ce qui ne tient pas debout', () => {
    const draft = newEventDraft(TODAY, TODAY)
    const error = (patch: Partial<EventDraft>) => draftError({ ...draft, ...patch }, TODAY)
    expect(error({})).toBeNull()
    expect(error({ title: '  ' })).toBe('Donne un nom à cette séance.')
    expect(error({ date: '' })).toBe('Choisis un jour.')
    expect(error({ time: '25:00' })).toBe('L’heure n’est pas valide.')
    expect(error({ time: '07:30' })).toBeNull()
    expect(error({ date: '2026-10-22' })).toBe('Une séance à venir ne peut pas être déjà faite.')
    expect(error({ repeat: true, weekdays: [] })).toBe('Choisis au moins un jour de la semaine.')
    expect(error({ repeat: true, endDate: '2026-10-20' })).toBe(
      'La date de fin doit venir après le premier jour.',
    )
    expect(error({ repeat: true, endDate: '2026-12-31', date: '2026-10-22' })).toBeNull()
  })

  it('enregistre une séance ponctuelle, sans valeurs qui ne la concernent pas', () => {
    const ids = sequentialIds('ev')
    const draft: EventDraft = {
      ...newEventDraft(TODAY, TODAY),
      title: ' Footing ',
      time: '07:15',
      durationMin: 40,
      distanceKm: 7.5,
      energyKcal: 480,
      notes: ' Bords de Loire ',
    }
    const run = eventFromDraft(draft, null, NOW, ids)
    expect(run).toEqual({
      id: 'ev-1',
      date: TODAY,
      time: '07:15',
      kind: 'cardio',
      title: 'Footing',
      durationMin: 40,
      programId: null,
      programSessionId: null,
      seriesId: null,
      status: 'done',
      workoutId: null,
      climbingSessionId: null,
      energyKcal: 480,
      distanceKm: 7.5,
      notes: 'Bords de Loire',
      createdAt: NOW,
      updatedAt: NOW,
    })
    expect(eventFromDraft({ ...draft, kind: 'custom' }, null, NOW, ids)).toMatchObject({
      distanceKm: null,
      energyKcal: 480,
      durationMin: 40,
    })
    expect(eventFromDraft({ ...draft, kind: 'rest' }, null, NOW, ids)).toMatchObject({
      distanceKm: null,
      energyKcal: null,
      durationMin: null,
    })

    // Modifier garde l'identité et le lien avec la série.
    const base: CalendarEvent = { ...run, seriesId: 's1', createdAt: '2026-10-01T08:00:00.000Z' }
    const edited = eventFromDraft({ ...draftFromEvent(base), time: '' }, base, NOW, ids)
    expect(edited).toMatchObject({ id: 'ev-1', seriesId: 's1', time: null, createdAt: base.createdAt })
  })

  it('enregistre une série, et la relit', () => {
    const ids = sequentialIds('serie')
    const draft: EventDraft = {
      ...newEventDraft('2026-10-24', TODAY, 'climbing'),
      repeat: true,
      weekdays: [6, 2, 6],
      intervalWeeks: 9,
      time: '18:30',
      durationMin: 120,
      distanceKm: 3,
    }
    const climbing = seriesFromDraft(draft, null, NOW, ids)
    expect(climbing).toEqual({
      id: 'serie-1',
      kind: 'climbing',
      title: 'Escalade',
      weekdays: [2, 6],
      intervalWeeks: 4,
      startDate: '2026-10-24',
      endDate: null,
      time: '18:30',
      durationMin: 120,
      notes: '',
      createdAt: NOW,
      updatedAt: NOW,
    })
    const back = draftFromSeries(climbing)
    expect(back).toMatchObject({
      repeat: true,
      weekdays: [2, 6],
      intervalWeeks: 4,
      time: '18:30',
      endDate: '',
    })
    const until: EventSeries = seriesFromDraft({ ...back, endDate: '2026-12-19' }, climbing, NOW, ids)
    expect(until).toMatchObject({ id: 'serie-1', endDate: '2026-12-19' })
  })

  it('note un jour d’une série avec ses valeurs', () => {
    const yoga = seriesFromDraft(
      {
        ...newEventDraft(TODAY, TODAY, 'custom'),
        title: 'Yoga',
        repeat: true,
        time: '07:00',
        durationMin: 45,
      },
      null,
      NOW,
      () => 's1',
    )
    expect(occurrenceEvent(yoga, '2026-10-28', 'skipped', NOW, () => 'e1')).toMatchObject({
      id: 'e1',
      date: '2026-10-28',
      seriesId: 's1',
      kind: 'custom',
      title: 'Yoga',
      time: '07:00',
      durationMin: 45,
      status: 'skipped',
    })
  })
})
