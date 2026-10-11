import { eventFromDraft, newEventDraft, seriesFromDraft } from '@/content/calendar/event-form'
import { resetDb } from '@/test/db'
import { sequentialIds } from '@/test/fixtures'
import {
  deleteEvent,
  deleteSeries,
  saveEvent,
  saveSeries,
  setOccurrenceStatus,
  setProgramSessionSkipped,
} from './calendar'
import { db } from './db'

const TODAY = '2026-10-21'
const NOW = '2026-10-21T18:00:00.000Z'

beforeEach(resetDb)

describe('calendrier enregistré', () => {
  it('enregistre, vérifie et supprime une séance perso', async () => {
    const run = eventFromDraft(newEventDraft(TODAY, TODAY), null, NOW, () => 'e1')
    await saveEvent(run)
    expect(await db.events.get('e1')).toMatchObject({ title: 'Course à pied', status: 'done' })
    await expect(saveEvent({ ...run, date: '21/10/2026' })).rejects.toThrow()
    await deleteEvent('e1')
    expect(await db.events.count()).toBe(0)
  })

  it('note un jour d’une série une seule fois, puis le modifie', async () => {
    const yoga = await saveSeries(
      seriesFromDraft(
        { ...newEventDraft(TODAY, TODAY, 'custom'), title: 'Yoga', repeat: true },
        null,
        NOW,
        () => 's1',
      ),
    )
    await setOccurrenceStatus(yoga, '2026-10-28', 'done')
    await setOccurrenceStatus(yoga, '2026-10-28', 'skipped')
    const days = await db.events.where('seriesId').equals('s1').toArray()
    expect(days).toHaveLength(1)
    expect(days[0]).toMatchObject({ date: '2026-10-28', status: 'skipped', title: 'Yoga' })
  })

  it('supprime une série en gardant les jours faits', async () => {
    const ids = sequentialIds()
    const yoga = await saveSeries(
      seriesFromDraft({ ...newEventDraft(TODAY, TODAY, 'custom'), repeat: true }, null, NOW, () => 's1'),
    )
    await setOccurrenceStatus(yoga, '2026-10-21', 'done')
    await setOccurrenceStatus(yoga, '2026-10-28', 'skipped')
    await saveEvent(eventFromDraft(newEventDraft(TODAY, TODAY), null, NOW, ids))
    await deleteSeries('s1')
    expect(await db.eventSeries.count()).toBe(0)
    const left = await db.events.toArray()
    expect(left.map((e) => [e.date, e.seriesId, e.status]).sort()).toEqual([
      ['2026-10-21', null, 'done'],
      ['2026-10-21', null, 'done'],
    ])
  })

  it('passe une séance du programme, puis la remet', async () => {
    const program = { id: 'p1' }
    const session = { id: 'A', name: 'Haut du corps' }
    await setProgramSessionSkipped(program, session, '2026-10-19', true)
    await setProgramSessionSkipped(program, session, '2026-10-19', true)
    const markers = await db.events.toArray()
    expect(markers).toHaveLength(1)
    expect(markers[0]).toMatchObject({
      kind: 'program',
      status: 'skipped',
      programId: 'p1',
      programSessionId: 'A',
      title: 'Haut du corps',
      date: '2026-10-19',
    })
    // Une autre séance le même jour n'est pas concernée.
    await setProgramSessionSkipped(program, { id: 'B', name: 'Bas du corps' }, '2026-10-19', false)
    expect(await db.events.count()).toBe(1)
    await setProgramSessionSkipped(program, session, '2026-10-19', false)
    expect(await db.events.count()).toBe(0)
  })
})
