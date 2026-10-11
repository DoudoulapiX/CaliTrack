import { canDoWith, kindsAt } from '@/content/exercises/catalog'
import { programSchema } from '@/db/schema'
import type {
  EquipmentItem,
  Location,
  Profile,
  Program,
  ProgramBlock,
  ProgramSession,
  ProgramSlot,
} from '@/db/types'
import { item, profile, sequentialIds, testCatalog } from '@/test/fixtures'
import {
  assignSkills,
  defaultProgramLocation,
  generateProgram,
  planWeek,
  programName,
  sessionMinutes,
  type GenerateInput,
} from './generator'
import { ladderFor, skillLadderId } from './ladders'

const NOW = '2026-10-10T08:00:00.000Z'

async function generate(
  patch: Partial<Profile>,
  items: EquipmentItem[],
  extra: Partial<GenerateInput> = {},
): Promise<Program> {
  const { byId } = await testCatalog()
  return generateProgram({
    profile: profile(patch),
    items,
    locations: [],
    locationId: null,
    exercises: byId,
    startDate: '2026-10-12',
    now: NOW,
    newId: sequentialIds(),
    ...extra,
  })
}

interface Placed {
  session: ProgramSession
  block: ProgramBlock
  slot: ProgramSlot
}

function placed(program: Program): Placed[] {
  return program.sessions.flatMap((session) =>
    session.blocks.flatMap((block) => block.slots.map((slot) => ({ session, block, slot }))),
  )
}

const LEVEL_TEST = {
  date: '2026-10-10',
  pushUps: 30,
  pullUps: 10,
  dips: 12,
  squats: 40,
  plankSec: 90,
  deadHangSec: 70,
}

const HOME_GYM = [
  item('pullupBar'),
  item('bands'),
  item('dumbbells', [2, 5, 7.5, 10]),
  item('chair'),
  item('rings'),
  item('parallettes'),
]

/** Scénarios variés : matériel, jours, durée, objectifs, escalade. */
const SCENARIOS: { name: string; patch: Partial<Profile>; items: EquipmentItem[] }[] = [
  {
    name: 'débutant sans matériel',
    patch: { experience: 'beginner', focuses: ['strength'], targetSkills: [] },
    items: [],
  },
  {
    name: 'intermédiaire grimpeur',
    patch: {
      experience: 'intermediate',
      focuses: ['strength', 'skills', 'climbing'],
      targetSkills: ['muscleUp', 'frontLever', 'handstand'],
      climbingDays: [2, 6],
      levelTest: LEVEL_TEST,
    },
    items: HOME_GYM,
  },
  {
    name: 'avancé 4 jours en volume',
    patch: {
      experience: 'advanced',
      focuses: ['muscle'],
      targetSkills: [],
      trainingDays: [1, 2, 4, 5],
      sessionMinutes: 75,
    },
    items: [...HOME_GYM, item('dipBars'), item('abWheel'), item('bench')],
  },
  {
    name: '6 jours endurance et mobilité',
    patch: {
      experience: 'intermediate',
      focuses: ['endurance', 'mobility'],
      targetSkills: [],
      trainingDays: [1, 2, 3, 4, 5, 6],
      climbingDays: [1, 4],
      sessionMinutes: 45,
    },
    items: [item('pullupBar'), item('jumpRope'), item('hangboard')],
  },
  {
    name: '2 × 30 min pour perdre du gras',
    patch: {
      experience: 'beginner',
      focuses: ['fatLoss'],
      targetSkills: [],
      trainingDays: [2, 4],
      sessionMinutes: 30,
    },
    items: [item('mat')],
  },
  {
    name: 'toutes les figures, 7 jours de 90 min',
    patch: {
      experience: 'advanced',
      focuses: ['skills', 'strength'],
      targetSkills: [
        'muscleUp',
        'frontLever',
        'backLever',
        'planche',
        'handstand',
        'hspu',
        'lSit',
        'flag',
        'pistol',
        'oneArmPullup',
        'oneArmPushup',
      ],
      trainingDays: [1, 2, 3, 4, 5, 6, 7],
      sessionMinutes: 90,
    },
    items: [...HOME_GYM, item('dipBars'), item('pole')],
  },
]

describe('générateur de programme', () => {
  it.each(SCENARIOS)('donne un programme valide et faisable : $name', async ({ patch, items }) => {
    const { byId } = await testCatalog()
    const program = await generate(patch, items)
    expect(() => programSchema.parse(program)).not.toThrow()

    const days = profile(patch).trainingDays
    expect(program.sessions.flatMap((s) => s.weekdays).sort()).toEqual([...days].sort())

    const kinds = kindsAt(items, null)
    for (const { slot } of placed(program)) {
      const exercise = byId.get(slot.exerciseId)
      expect(exercise, slot.exerciseId).toBeDefined()
      if (exercise) expect(canDoWith(exercise, kinds), slot.exerciseId).toBe(true)
      expect(slot.target.min).toBeLessThanOrEqual(slot.target.max)
      expect(slot.sets).toBeGreaterThanOrEqual(1)
      expect(slot.sets).toBeLessThanOrEqual(5)
      // La mesure de l'objectif suit celle de l'exercice (répétitions ou secondes).
      expect(slot.target.kind, slot.exerciseId).toBe(exercise?.measure)
    }
    for (const line of program.rationale) expect(line).not.toMatch(/ [:;!?]/)
  })

  it.each(SCENARIOS)('tient dans la durée voulue : $name', async ({ patch, items }) => {
    const { byId } = await testCatalog()
    const program = await generate(patch, items)
    const budget = profile(patch).sessionMinutes
    for (const session of program.sessions) {
      const minutes = sessionMinutes(session, byId)
      expect(minutes, session.name).toBeLessThanOrEqual(budget + 5)
      // La séance de récupération (7 jours sur 7) est courte exprès.
      if (session.emphasis !== 'skills') expect(minutes, session.name).toBeGreaterThanOrEqual(budget * 0.6)
    }
  })

  it('donne toujours le même programme pour les mêmes réponses', async () => {
    const [scenario] = SCENARIOS.slice(1, 2)
    if (!scenario) throw new Error('scénario manquant')
    expect(await generate(scenario.patch, scenario.items)).toEqual(
      await generate(scenario.patch, scenario.items),
    )
  })

  it('n’utilise que le matériel du lieu choisi', async () => {
    const { byId } = await testCatalog()
    const items = [item('pullupBar', [], ['parc']), item('dumbbells', [5, 10], ['maison']), item('mat')]
    const locations: Location[] = [
      { id: 'maison', name: 'Maison', icon: 'home', createdAt: NOW },
      { id: 'parc', name: 'Parc', icon: 'park', createdAt: NOW },
    ]
    const program = await generate({ focuses: ['strength'], targetSkills: [] }, items, {
      locations,
      locationId: 'maison',
    })
    expect(program.locationId).toBe('maison')
    const kinds = kindsAt(items, 'maison')
    expect(kinds.has('pullupBar')).toBe(false)
    for (const { slot } of placed(program)) {
      const exercise = byId.get(slot.exerciseId)
      expect(exercise && canDoWith(exercise, kinds), slot.exerciseId).toBe(true)
    }
    expect(program.rationale.join(' ')).toMatch(/«\u00a0Maison\u00a0»/)
  })

  it('ménage bras et doigts la veille et le jour de l’escalade', async () => {
    const program = await generate(
      {
        experience: 'intermediate',
        focuses: ['strength', 'skills', 'climbing'],
        targetSkills: ['frontLever', 'muscleUp', 'planche'],
        trainingDays: [1, 2, 3, 4, 5, 6],
        climbingDays: [2, 6],
        levelTest: LEVEL_TEST,
      },
      [...HOME_GYM, item('hangboard')],
    )
    const sparing = new Set([1, 2, 5, 6])
    for (const { session, slot } of placed(program)) {
      const day = session.weekdays[0] ?? 0
      if (!sparing.has(day)) continue
      expect(ladderFor(slot.ladderId)?.grip ?? false, `${slot.exerciseId} le jour ${day}`).toBe(false)
      expect(slot.exerciseId).not.toBe('scap-pull')
    }
    // Les autres jours, le tirage est bien là.
    const pulls = placed(program).filter(({ session, slot }) => {
      const day = session.weekdays[0] ?? 0
      return !sparing.has(day) && ladderFor(slot.ladderId)?.grip
    })
    expect(pulls.length).toBeGreaterThan(0)
  })

  it('place chaque figure prête au moins une fois dans la semaine', async () => {
    const program = await generate(
      {
        experience: 'intermediate',
        focuses: ['skills', 'strength'],
        targetSkills: ['frontLever', 'handstand', 'lSit', 'planche'],
        trainingDays: [1, 3, 5],
        levelTest: LEVEL_TEST,
      },
      HOME_GYM,
    )
    const skillSlots = placed(program).filter(({ block }) => block.kind === 'skill')
    for (const skill of ['frontLever', 'handstand', 'lSit', 'planche']) {
      expect(
        skillSlots.some(({ slot }) => slot.ladderId === skillLadderId(skill)),
        skill,
      ).toBe(true)
    }
    expect(program.rationale.join(' ')).toContain('Figures travaillées')
  })

  it('explique une figure impossible avec ce matériel', async () => {
    const program = await generate(
      { experience: 'advanced', focuses: ['skills'], targetSkills: ['flag', 'frontLever'] },
      [item('mat')],
    )
    const text = program.rationale.join('\n')
    expect(text).toMatch(/Drapeau impossible ici, matériel manquant\u00a0: poteau vertical/)
    expect(text).toMatch(/Front lever impossible ici/)
    expect(placed(program).filter(({ block }) => block.kind === 'skill')).toEqual([])
  })

  it('travaille les doigts à la poutre une fois par semaine, en premier', async () => {
    const climber = {
      experience: 'intermediate' as const,
      focuses: ['climbing' as const, 'strength' as const],
      targetSkills: [],
      trainingDays: [1, 2, 4, 5] as Profile['trainingDays'],
      climbingDays: [3, 6] as Profile['climbingDays'],
      levelTest: LEVEL_TEST,
    }
    const program = await generate(climber, [item('pullupBar'), item('hangboard'), item('rings')])
    const fingers = placed(program).filter(({ slot }) => slot.ladderId === 'fingers')
    expect(fingers).toHaveLength(1)
    const [first] = fingers
    expect(first?.slot.exerciseId).toMatch(/^hangboard/)
    expect(first?.block.kind).toBe('strength')
    expect(first?.block.slots[0]).toBe(first?.slot)
    // Ni le jour de l'escalade ni la veille.
    expect([2, 3, 5, 6]).not.toContain(first?.session.weekdays[0])

    // Débutant : pas de poutre.
    const beginner = await generate({ ...climber, experience: 'beginner', levelTest: null }, [
      item('pullupBar'),
      item('hangboard'),
    ])
    expect(placed(beginner).filter(({ slot }) => slot.ladderId === 'fingers')).toEqual([])
  })

  it('reprend où en était chaque progression dans le programme précédent', async () => {
    const items = [item('pullupBar'), item('dumbbells', [8, 10, 16])]
    const patch: Partial<Profile> = { experience: 'beginner', focuses: ['strength'], targetSkills: [] }
    const first = await generate(patch, items)
    // On fait comme si les tractions et le squat avaient progressé.
    const previous: Program = {
      ...first,
      sessions: first.sessions.map((session) => ({
        ...session,
        blocks: session.blocks.map((block) => ({
          ...block,
          slots: block.slots.map((slot) =>
            slot.ladderId === 'pullV'
              ? { ...slot, exerciseId: 'pullup-archer', target: { kind: 'reps' as const, min: 6, max: 9 } }
              : slot.ladderId === 'squat'
                ? { ...slot, exerciseId: 'Goblet_Squat', loadKg: 12 }
                : slot,
          ),
        })),
      })),
    }
    const next = await generate(patch, items, { previous })
    const pull = placed(next).find(({ slot }) => slot.ladderId === 'pullV')?.slot
    expect(pull).toMatchObject({ exerciseId: 'pullup-archer', target: { kind: 'reps', min: 6, max: 9 } })
    // 12 kg n'existe plus : la charge la plus proche en dessous.
    const squat = placed(next).find(({ slot }) => slot.ladderId === 'squat')?.slot
    expect(squat).toMatchObject({ exerciseId: 'Goblet_Squat', loadKg: 10 })
  })

  it('part du niveau déclaré quand le test n’est pas fait, et le dit', async () => {
    const program = await generate(
      { experience: 'advanced', levelTest: null, focuses: ['strength'] },
      HOME_GYM,
    )
    expect(program.rationale.join(' ')).toContain('niveau déclaré (avancé)')
    const pull = placed(program).find(({ slot }) => slot.ladderId === 'pullV')?.slot
    // Avancé : 12 tractions d'affilée, donc des séries de 5 à 8 tractions.
    expect(pull).toMatchObject({ exerciseId: 'pullup', target: { kind: 'reps', min: 5, max: 8 } })
    // Débutant : environ 2 tractions, donc avec un élastique.
    const beginner = await generate(
      { experience: 'beginner', levelTest: null, focuses: ['strength'] },
      HOME_GYM,
    )
    const easier = placed(beginner).find(({ slot }) => slot.ladderId === 'pullV')?.slot
    expect(easier?.exerciseId).toBe('pullup-band')
  })

  it('remplace les tractions par du rowing sans barre', async () => {
    const program = await generate({ experience: 'beginner', focuses: ['strength'], targetSkills: [] }, [
      item('table'),
    ])
    const ids = placed(program).map(({ slot }) => slot.exerciseId)
    expect(ids.some((id) => id.startsWith('pullup'))).toBe(false)
    expect(placed(program).some(({ slot }) => slot.ladderId === 'pullH')).toBe(true)
    expect(program.rationale.join(' ')).toContain('le tirage passe par le rowing')
  })

  it('ajoute du cardio et des étirements quand c’est un objectif', async () => {
    const program = await generate(
      { focuses: ['fatLoss', 'mobility'], targetSkills: [], sessionMinutes: 60 },
      [item('jumpRope')],
    )
    for (const session of program.sessions) {
      const kinds = session.blocks.map((b) => b.kind)
      expect(kinds).toContain('conditioning')
      expect(kinds).toContain('cooldown')
      expect(kinds[kinds.length - 1]).toBe('cooldown')
      expect(kinds[0]).toBe('warmup')
    }
  })
})

describe('semaine type', () => {
  it('garde l’ordre des séances quand rien ne gêne', () => {
    expect(planWeek([5, 1, 3], []).map((p) => [p.weekday, p.template])).toEqual([
      [1, 'fullA'],
      [3, 'fullB'],
      [5, 'fullC'],
    ])
  })

  it('remplace le tirage la veille de l’escalade', () => {
    const plans = planWeek([1, 3, 5], [2])
    expect(plans[0]).toEqual({ weekday: 1, template: 'sparing', sparing: true })
    expect(plans[1]).toEqual({ weekday: 3, template: 'fullB', sparing: false })
  })

  it('échange les séances pour garder le tirage un jour libre', () => {
    // Mardi (veille de mercredi) et vendredi (veille de samedi) : les séances du bas du corps.
    const plans = planWeek([1, 2, 4, 5], [3, 6])
    expect(plans.map((p) => p.template)).toEqual(['upperA', 'lowerA', 'upperB', 'lowerB'])
    const swapped = planWeek([1, 2, 4, 5], [2, 5])
    expect(swapped.map((p) => [p.weekday, p.template])).toEqual([
      [1, 'push'],
      [2, 'lowerA'],
      [4, 'push'],
      [5, 'lowerB'],
    ])
  })

  it('ignore les doublons de jours', () => {
    expect(planWeek([1, 1, 3], [])).toHaveLength(2)
  })
})

describe('répartition des figures', () => {
  const ready = (skillId: string, grip: boolean) => {
    const ladder = ladderFor(skillLadderId(skillId))
    if (!ladder) throw new Error(skillId)
    return {
      kind: 'ready' as const,
      skillId,
      placement: {
        ladder: { ...ladder, grip },
        exerciseId: 'x',
        loadKg: null,
        target: { kind: 'reps' as const, min: 1, max: 2 },
      },
    }
  }

  it('place chaque figure une fois avant d’en doubler une', () => {
    const plans = planWeek([1, 3, 5], [])
    const skills = [ready('planche', false), ready('frontLever', true), ready('lSit', false)]
    const result = assignSkills(plans, skills, 1)
    expect(result.map((list) => list.map((s) => s.skillId))).toEqual([['planche'], ['frontLever'], ['lSit']])
  })

  it('n’en met pas de tirage un jour à ménager', () => {
    const plans = planWeek([1], [1])
    const result = assignSkills(plans, [ready('frontLever', true), ready('planche', false)], 2)
    expect(result).toEqual([[expect.objectContaining({ skillId: 'planche' })]])
  })
})

describe('nom et lieu du programme', () => {
  it('nomme le programme d’après les objectifs', () => {
    expect(programName(['skills', 'strength'])).toBe('Force et figures')
    expect(programName(['climbing'])).toBe('Escalade')
    expect(programName([])).toBe('Mon programme')
  })

  it('propose le lieu du jour, sinon la maison', () => {
    const locations: Location[] = [
      { id: 'salle', name: 'Salle', icon: 'gym', createdAt: NOW },
      { id: 'maison', name: 'Maison', icon: 'home', createdAt: NOW },
    ]
    expect(defaultProgramLocation(locations, 'salle')).toBe('salle')
    expect(defaultProgramLocation(locations, null)).toBe('maison')
    expect(defaultProgramLocation(locations, 'disparu')).toBe('maison')
    expect(defaultProgramLocation([], null)).toBeNull()
  })
})
