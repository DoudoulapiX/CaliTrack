import { bodyReview } from '@/test/fixtures'
import {
  ANALYZING_TEXT,
  appliedText,
  BODY_DISCLAIMER,
  bodyFatRange,
  bodyFatText,
  GATE_TEXT,
  guardText,
  historyLine,
  historyTitle,
  PHOTO_NOTE,
  PHOTO_SLOTS,
  phaseAdviceText,
  removePhotoLabel,
  UNREADABLE_PHOTO,
} from './body-view'

const NB = '\u00a0'

/** Aucune espace ordinaire avant « : ; ! ? % » ni après « (comme expectFrenchSpacing). */
const spaced = (text: string) => !/ [:;!?%»]/.test(text) && !/« /.test(text)

describe('textes du coach physique', () => {
  it('prévient que c’est une estimation, et que les photos ne sont pas gardées', () => {
    expect(BODY_DISCLAIMER).toBe('C’est une estimation pour guider tes phases, pas un avis médical.')
    expect(PHOTO_NOTE).toBe(
      `Tes photos partent vers Anthropic pour l’analyse${NB}; CaliTrack ne les garde pas.`,
    )
    expect(UNREADABLE_PHOTO).toBe('Cette photo ne s’ouvre pas. Choisis-en une autre.')
    expect(ANALYZING_TEXT).toBe('Le coach regarde tes photos…')
  })

  it('nomme les trois photos', () => {
    expect(PHOTO_SLOTS).toEqual([
      { view: 'front', label: 'De face' },
      { view: 'side', label: 'De profil' },
      { view: 'back', label: 'De dos' },
    ])
    expect(PHOTO_SLOTS.map((slot) => removePhotoLabel(slot.view))).toEqual([
      'Retirer la photo de face',
      'Retirer la photo de profil',
      'Retirer la photo de dos',
    ])
  })

  it('dit ce qui manque pour commencer', () => {
    expect(GATE_TEXT).toEqual({
      noBirthYear: 'Indique ton année de naissance dans ton profil.',
      minor: 'Le coach physique est réservé aux adultes.',
      noHeight: 'Indique ta taille dans ton profil.',
      noWeight: 'Note ton poids pour commencer.',
    })
  })

  it('annonce la phase conseillée', () => {
    expect(phaseAdviceText('cut')).toBe(`Phase conseillée${NB}: Sèche`)
    expect(phaseAdviceText('maintain')).toBe(`Phase conseillée${NB}: Maintien`)
    expect(phaseAdviceText('bulk')).toBe(`Phase conseillée${NB}: Prise de masse`)
  })

  it('explique quand CaliTrack corrige la phase du coach', () => {
    expect(guardText({ suggestedPhase: 'cut', phase: 'maintain' })).toBe(
      `Le coach proposait une sèche${NB}; CaliTrack conseille le maintien vu ta corpulence.`,
    )
    expect(guardText({ suggestedPhase: 'bulk', phase: 'maintain' })).toBe(
      `Le coach proposait une prise de masse${NB}; CaliTrack conseille le maintien vu ta corpulence.`,
    )
    expect(guardText({ suggestedPhase: 'cut', phase: 'cut' })).toBeNull()
  })

  it('écrit la masse grasse estimée d’un seul tenant', () => {
    expect(bodyFatRange({ low: 15, high: 19 })).toBe(`15${NB}à${NB}19${NB}%`)
    expect(bodyFatRange({ low: 12, high: 12 })).toBe(`12${NB}%`)
    expect(bodyFatRange(null)).toBeNull()
    expect(bodyFatText({ low: 8, high: 11 })).toBe(`Masse grasse estimée${NB}: 8${NB}à${NB}11${NB}%`)
    expect(bodyFatText(null)).toBe('Masse grasse non estimée sur ces photos.')
  })

  it('date la phase appliquée, en heure de Paris', () => {
    expect(appliedText('2026-10-21T09:30:00.000Z', '2026-10-21')).toBe('Appliquée le 21 octobre')
    // 23 h 30 à Greenwich, 1 h 30 du matin à Paris : déjà le lendemain.
    expect(appliedText('2026-10-20T23:30:00.000Z', '2026-10-21')).toBe('Appliquée le 21 octobre')
    expect(appliedText('2025-01-03T10:00:00.000Z', '2026-10-21')).toBe('Appliquée le 3 janvier 2025')
  })

  it('résume les analyses passées', () => {
    expect(historyTitle({ date: '2026-10-21' }, '2026-10-21')).toBe('Aujourd’hui')
    expect(historyTitle({ date: '2026-10-17' }, '2026-10-21')).toBe('Samedi 17 octobre')
    expect(historyTitle({ date: '2025-03-12' }, '2026-10-21')).toBe('12 mars 2025')
    expect(historyLine(bodyReview())).toBe(`Sèche · 15${NB}à${NB}19${NB}% de masse grasse`)
    expect(historyLine(bodyReview({ phase: 'maintain', bodyFat: null }))).toBe('Maintien')
  })

  it('respecte la typographie française', () => {
    const texts = [
      BODY_DISCLAIMER,
      PHOTO_NOTE,
      UNREADABLE_PHOTO,
      ...Object.values(GATE_TEXT),
      phaseAdviceText('bulk'),
      guardText({ suggestedPhase: 'cut', phase: 'maintain' }) ?? '',
      bodyFatText({ low: 8, high: 11 }),
      historyLine(bodyReview()),
    ]
    for (const text of texts) expect(spaced(text), text).toBe(true)
  })
})
