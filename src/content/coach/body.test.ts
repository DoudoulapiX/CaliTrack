import { jsonSchemaOf } from '@/content/ai/structured'
import { defaultNutritionGoals } from '@/db/defaults'
import { bodyReviewSchema } from '@/db/schema'
import { BODY_CUT_LEAN, coachData } from '@/test/anthropic'
import {
  bmiOf,
  BODY_PHOTO_MAX,
  BODY_PHOTO_MAX_SIDE,
  bodyCoachGate,
  bodyPrompt,
  bodyReviewFrom,
  bodyReviewOutput,
  cleanBodyReview,
  cutText,
  guardedPhase,
  LEAN_BODY_FAT,
  reviewTargets,
  type BodyReviewOutput,
} from './body'
import { COACH_RULES } from './prompt'

/** Homme, né en 1996, 1,80 m : 80 kg donnent 2 760 kcal en maintien (activité modérée). */
const charles = { sex: 'male', birthYear: 1996, heightCm: 180 } as const

const answer = (patch: Partial<BodyReviewOutput> = {}): BodyReviewOutput => ({ ...BODY_CUT_LEAN, ...patch })

const NBSP = /[\u00a0\u202f]/

describe('accès au coach physique', () => {
  const gate = (patch: Partial<Parameters<typeof bodyCoachGate>[0]> = {}) =>
    bodyCoachGate({
      hasKey: true,
      profile: { birthYear: 1996, heightCm: 180 },
      weightKg: 80,
      year: 2026,
      ...patch,
    })

  it('ouvre à un adulte dont on connaît la taille et le poids, avec une clé', () => {
    expect(gate()).toBeNull()
  })

  it('demande d’abord une clé Claude', () => {
    expect(gate({ hasKey: false })).toBe('noKey')
    expect(gate({ hasKey: false, profile: { birthYear: null, heightCm: null }, weightKg: null })).toBe(
      'noKey',
    )
  })

  it('est réservé aux adultes sûrs de l’être', () => {
    expect(gate({ profile: { birthYear: null, heightCm: 180 } })).toBe('noBirthYear')
    // 18 ans dans l'année : peut-être encore 17 aujourd'hui.
    expect(gate({ profile: { birthYear: 2008, heightCm: 180 } })).toBe('minor')
    expect(gate({ profile: { birthYear: 2012, heightCm: 180 } })).toBe('minor')
    expect(gate({ profile: { birthYear: 2007, heightCm: 180 } })).toBeNull()
    expect(gate({ profile: { birthYear: 2008, heightCm: 180 }, year: 2027 })).toBeNull()
  })

  it('demande la taille puis le poids', () => {
    expect(gate({ profile: { birthYear: 1996, heightCm: null } })).toBe('noHeight')
    expect(gate({ profile: { birthYear: 1996, heightCm: null }, weightKg: null })).toBe('noHeight')
    expect(gate({ weightKg: null })).toBe('noWeight')
    expect(gate({ profile: { birthYear: 2010, heightCm: null }, weightKg: null })).toBe('minor')
  })
})

describe('réponse de Claude', () => {
  it('garde une réponse raisonnable telle quelle', () => {
    expect(cleanBodyReview(BODY_CUT_LEAN)).toEqual({
      suggestedPhase: 'cut',
      bodyFat: { low: 8, high: 11 },
      summary: 'Silhouette sèche et musclée.',
      observations: ['Abdominaux bien visibles.', 'Épaules et dos développés.'],
      advice: ['Garde tes protéines hautes.'],
    })
  })

  it('ramène la masse grasse entre 3 et 60 %, en entiers et dans l’ordre', () => {
    expect(cleanBodyReview(answer({ bodyFatLow: 1, bodyFatHigh: 75 })).bodyFat).toEqual({ low: 3, high: 60 })
    expect(cleanBodyReview(answer({ bodyFatLow: 21, bodyFatHigh: 16 })).bodyFat).toEqual({
      low: 16,
      high: 21,
    })
    expect(cleanBodyReview(answer({ bodyFatLow: 14.6, bodyFatHigh: 17.4 })).bodyFat).toEqual({
      low: 15,
      high: 17,
    })
    expect(cleanBodyReview(answer({ bodyFatLow: -5, bodyFatHigh: -2 })).bodyFat).toEqual({ low: 3, high: 3 })
  })

  it('oublie une masse grasse à moitié estimée', () => {
    expect(cleanBodyReview(answer({ bodyFatLow: null })).bodyFat).toBeNull()
    expect(cleanBodyReview(answer({ bodyFatHigh: null })).bodyFat).toBeNull()
    expect(cleanBodyReview(answer({ bodyFatLow: Number.NaN })).bodyFat).toBeNull()
  })

  it('prend le maintien quand la phase est inconnue', () => {
    expect(cleanBodyReview(answer({ phase: 'recomposition' })).suggestedPhase).toBe('maintain')
    expect(cleanBodyReview(answer({ phase: '' })).suggestedPhase).toBe('maintain')
    expect(cleanBodyReview(answer({ phase: ' Bulk ' })).suggestedPhase).toBe('bulk')
    expect(cleanBodyReview(answer({ phase: 'maintain' })).suggestedPhase).toBe('maintain')
  })

  it('coupe les textes aux longueurs gardées', () => {
    const clean = cleanBodyReview(
      answer({
        summary: `  ${'a'.repeat(700)}  `,
        observations: ['  Un.  ', '', '   ', 'b'.repeat(250), 'Trois.', 'Quatre.', 'Cinq.'],
        advice: [],
      }),
    )
    expect(clean.summary).toBe('a'.repeat(600))
    expect(clean.observations).toEqual(['Un.', 'b'.repeat(200), 'Trois.', 'Quatre.'])
    expect(clean.advice).toEqual([])
    expect(() => bodyReviewSchema.shape.observations.parse(clean.observations)).not.toThrow()
  })

  it('ne coupe jamais un caractère en deux', () => {
    expect(cutText(' abc ', 10)).toBe('abc')
    expect(cutText('ab😀cd', 3)).toBe('ab')
    expect(cutText('ab😀cd', 4)).toBe('ab😀')
    expect(cutText('mot suivi   ', 4)).toBe('mot')
  })
})

describe('garde-fous de la phase', () => {
  it('calcule l’IMC', () => {
    expect(bmiOf(80, 180)).toBeCloseTo(24.69, 2)
    expect(bmiOf(81, 180)).toBeCloseTo(25, 1)
  })

  it('refuse une sèche à qui est déjà sec', () => {
    const cut = (sex: 'male' | 'female' | 'other' | null, bodyFatLow: number | null) =>
      guardedPhase('cut', { sex, bmi: 24, bodyFatLow })
    expect(cut('male', 8)).toBe('maintain')
    expect(cut('male', 10)).toBe('cut')
    expect(cut('female', 17)).toBe('maintain')
    expect(cut('female', 18)).toBe('cut')
    expect(cut('other', 13)).toBe('maintain')
    expect(cut(null, 13)).toBe('maintain')
    expect(cut(null, 14)).toBe('cut')
    expect(cut('male', null)).toBe('cut')
    expect(LEAN_BODY_FAT).toEqual({ male: 10, female: 18, other: 14, unknown: 14 })
  })

  it('refuse une sèche à une personne maigre', () => {
    expect(guardedPhase('cut', { sex: 'male', bmi: bmiOf(58.32, 180), bodyFatLow: null })).toBe('maintain')
    expect(guardedPhase('cut', { sex: 'female', bmi: 18.49, bodyFatLow: 25 })).toBe('maintain')
    expect(guardedPhase('cut', { sex: 'female', bmi: 18.5, bodyFatLow: 25 })).toBe('cut')
  })

  it('refuse une prise de masse en obésité', () => {
    expect(guardedPhase('bulk', { sex: 'male', bmi: 31, bodyFatLow: 28 })).toBe('maintain')
    expect(guardedPhase('bulk', { sex: 'male', bmi: 30, bodyFatLow: null })).toBe('maintain')
    expect(guardedPhase('bulk', { sex: 'male', bmi: 29.9, bodyFatLow: null })).toBe('bulk')
    expect(guardedPhase('bulk', { sex: 'female', bmi: 17, bodyFatLow: 15 })).toBe('bulk')
  })

  it('laisse le maintien tel quel', () => {
    expect(guardedPhase('maintain', { sex: 'male', bmi: 35, bodyFatLow: 4 })).toBe('maintain')
    expect(guardedPhase('maintain', { sex: null, bmi: 16, bodyFatLow: null })).toBe('maintain')
  })
})

describe('objectifs de la phase', () => {
  const manual = { ...defaultNutritionGoals('2026-10-01T00:00:00.000Z'), kcal: 1500, proteinG: 90, fatG: 40 }

  it('viennent du calcul de CaliTrack, sans les valeurs fixées à la main', () => {
    expect(reviewTargets(charles, 80, manual, 'cut', 2026)).toEqual({
      kcal: 2210,
      proteinG: 175,
      carbsG: 245,
      fatG: 60,
    })
    expect(reviewTargets(charles, 80, manual, 'maintain', 2026)).toEqual({
      kcal: 2760,
      proteinG: 145,
      carbsG: 375,
      fatG: 75,
    })
  })

  it('suivent l’activité enregistrée', () => {
    expect(reviewTargets(charles, 80, { activity: 'active' }, 'cut', 2026)?.kcal).toBe(2460)
  })

  it('manquent quand le profil est incomplet', () => {
    expect(reviewTargets({ ...charles, birthYear: null }, 80, manual, 'cut', 2026)).toBeNull()
    expect(reviewTargets({ ...charles, heightCm: null }, 80, manual, 'cut', 2026)).toBeNull()
  })
})

describe('analyse à enregistrer', () => {
  const args = {
    raw: BODY_CUT_LEAN,
    profile: charles,
    weightKg: 80,
    goals: { activity: 'moderate' as const },
    date: '2026-10-21',
    model: 'claude-sonnet-5-5',
    now: '2026-10-21T09:30:00.000Z',
  }

  it('garde la phase proposée, la phase conseillée et les objectifs de cette dernière', () => {
    const review = bodyReviewFrom(args)
    expect(review).toEqual({
      date: '2026-10-21',
      model: 'claude-sonnet-5-5',
      suggestedPhase: 'cut',
      phase: 'maintain',
      bodyFat: { low: 8, high: 11 },
      weightKg: 80,
      targets: { kcal: 2760, proteinG: 145, carbsG: 375, fatG: 75 },
      summary: 'Silhouette sèche et musclée.',
      observations: ['Abdominaux bien visibles.', 'Épaules et dos développés.'],
      advice: ['Garde tes protéines hautes.'],
      appliedAt: null,
      createdAt: '2026-10-21T09:30:00.000Z',
      updatedAt: '2026-10-21T09:30:00.000Z',
    })
    expect(bodyReviewSchema.parse(review)).toEqual(review)
  })

  it('suit la sèche quand rien ne s’y oppose', () => {
    const review = bodyReviewFrom({ ...args, raw: answer({ bodyFatLow: 17, bodyFatHigh: 21 }) })
    expect(review).toMatchObject({
      suggestedPhase: 'cut',
      phase: 'cut',
      targets: { kcal: 2210, proteinG: 175, carbsG: 245, fatG: 60 },
    })
  })

  it('compte l’âge d’après l’année de l’analyse', () => {
    const review = bodyReviewFrom({ ...args, date: '2036-03-01', raw: answer({ phase: 'maintain' }) })
    // Dix ans de plus : 50 kcal de moins au métabolisme de base.
    expect(review?.targets.kcal).toBe(2680)
  })

  it('ne donne rien sans taille ni année de naissance', () => {
    expect(bodyReviewFrom({ ...args, profile: { ...charles, heightCm: null } })).toBeNull()
    expect(bodyReviewFrom({ ...args, profile: { ...charles, birthYear: null } })).toBeNull()
  })
})

describe('demande à Claude', () => {
  const photos = [
    { view: 'front', base64: 'RkFDRQ==' },
    { view: 'back', base64: 'RE9T' },
  ] as const

  it('envoie les photos en JPEG, puis les données utiles et la phase actuelle', () => {
    const { system, content } = bodyPrompt({ data: coachData(), photos })
    expect(system.startsWith(COACH_RULES)).toBe(true)
    expect(system).toContain('masse grasse')
    expect(system).toContain('readable à false')
    expect(content).toHaveLength(3)
    expect(content.slice(0, 2)).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'RkFDRQ==' } },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'RE9T' } },
    ])
    const text = content[2]?.type === 'text' ? content[2].text : ''
    expect(text).toContain('<donnees>')
    expect(text).toContain('Profil :')
    expect(text).toContain('Pesées (30 derniers jours) :')
    expect(text).toContain('Nutrition :')
    expect(text).toContain('Programme : Force')
    expect(text).not.toContain('Agenda')
    expect(text).not.toContain('Bague Oura')
    expect(text).not.toContain('Frigo et placards')
    expect(text).not.toContain('Dernière analyse physique')
    expect(text).toContain("Photos jointes, dans l'ordre : de face, de dos.")
    expect(text).toContain('Phase actuelle : cut (sèche).')
  })

  it('dit la phase actuelle quelle qu’elle soit', () => {
    const data = coachData()
    const { content } = bodyPrompt({
      data: { ...data, nutrition: { ...data.nutrition, phase: 'bulk' } },
      photos: [{ view: 'side', base64: 'UFJPRklM' }],
    })
    const text = content[1]?.type === 'text' ? content[1].text : ''
    expect(text).toContain("Photos jointes, dans l'ordre : de profil.")
    expect(text).toContain('Phase actuelle : bulk (prise de masse).')
  })

  it('n’envoie aucune espace insécable', () => {
    // Les lignes d'exercices du jeu de données en contiennent.
    expect(JSON.stringify(coachData())).toMatch(NBSP)
    const prompt = bodyPrompt({ data: coachData(), photos })
    expect(JSON.stringify(prompt)).not.toMatch(NBSP)
    expect(JSON.stringify(jsonSchemaOf(bodyReviewOutput))).not.toMatch(NBSP)
  })

  it('demande une réponse reconnaissable, en champs simples', () => {
    const schema = jsonSchemaOf(bodyReviewOutput) as { properties: Record<string, { type?: unknown }> }
    expect(Object.keys(schema.properties)).toEqual([
      'readable',
      'problem',
      'phase',
      'bodyFatLow',
      'bodyFatHigh',
      'summary',
      'observations',
      'advice',
    ])
    expect(schema.properties.phase?.type).toBe('string')
    expect(JSON.stringify(schema)).not.toContain('"enum"')
  })

  it('limite les photos à trois, réduites à 1024 pixels', () => {
    expect(BODY_PHOTO_MAX).toBe(3)
    expect(BODY_PHOTO_MAX_SIDE).toBe(1024)
  })
})
