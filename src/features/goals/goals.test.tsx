import { screen, waitFor, within } from '@testing-library/react'
import { db } from '@/db/db'
import { addSkillGoals, logWeight, saveGoal } from '@/db/goals'
import { updateProfile } from '@/db/settings'
import type { Workout } from '@/db/types'
import { customGoal } from '@/content/goals/create'
import { VERTICAL_ART_SCALE_ID } from '@/content/grades'
import { renderApp } from '@/test/render-app'

// Les horloges de la séance en direct ne tournent pas pendant les tests.
vi.mock('@/features/workout/useNow', () => ({ useNow: () => Date.now() }))

/** Une séance terminée ce jour-là : une série faite sur un exercice. */
function doneWorkout(id: string, date: string, exerciseId: string, reps: number): Workout {
  return {
    id,
    date,
    startedAt: `${date}T16:00:00.000Z`,
    endedAt: `${date}T17:00:00.000Z`,
    title: 'Séance du soir',
    programId: null,
    programSessionId: null,
    plannedFor: null,
    eventId: null,
    exercises: [
      {
        id: `${id}-e1`,
        exerciseId,
        slotId: null,
        block: 'strength',
        target: null,
        restSec: 90,
        sets: [
          {
            id: `${id}-s1`,
            reps,
            durationSec: null,
            loadKg: null,
            assistance: null,
            rpe: null,
            done: true,
            completedAt: null,
          },
        ],
        note: '',
      },
    ],
    rpe: null,
    notes: '',
    status: 'done',
    deload: false,
    progression: [],
  }
}

async function goalHeading(name: string | RegExp) {
  return screen.findByRole('heading', { name, level: 1 })
}

describe('objectifs', () => {
  beforeEach(() => {
    // Le mercredi 21 octobre 2026, en fin de matinée.
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('suit une figure visée, étape par étape, d’après le test de niveau et les séances', async () => {
    const { user } = await renderApp('/goals', {
      setup: async () => {
        await updateProfile({
          targetSkills: ['muscleUp'],
          levelTest: {
            date: '2026-10-01',
            pushUps: null,
            pullUps: 10,
            dips: null,
            squats: null,
            plankSec: null,
            deadHangSec: null,
          },
        })
        await db.workouts.put(doneWorkout('w1', '2026-10-15', 'pullup-chest-to-bar', 3))
      },
    })
    expect(await screen.findByText('Fixe-toi un cap')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tes figures visées' })).toBeInTheDocument()

    // Une touche : la figure devient un objectif.
    await user.click(screen.getByRole('button', { name: /^Muscle-upSuivre ses 6 étapes/ }))
    expect(await screen.findByText('Objectif ajouté')).toBeInTheDocument()
    await goalHeading('Muscle-up')
    expect(screen.getByText('Sur l’accueil')).toBeInTheDocument()
    // Étape 1 franchie au test de niveau (10 tractions), étape 2 aux trois cinquièmes : 1,6 étape sur 6.
    expect(screen.getByText('26 %')).toBeInTheDocument()
    expect(screen.getByText('Étape 2 sur 6 : Tractions poitrine à la barre')).toBeInTheDocument()
    expect(screen.getByText('Encore 5 étapes')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Avancement de « Muscle-up »' })).toHaveAttribute(
      'aria-valuenow',
      '26',
    )
    expect(screen.getByRole('button', { name: 'Étape 1 : Tractions, 8 rép., franchie' })).toHaveTextContent(
      'D’après ton test de niveau',
    )
    expect(
      screen.getByRole('button', { name: 'Étape 6 : Muscle-up à la barre, 5 rép., à venir' }),
    ).toBeInTheDocument()

    // L'étape 2, réussie en dehors d'une séance notée : on la coche.
    await user.click(
      screen.getByRole('button', { name: 'Étape 2 : Tractions poitrine à la barre, 5 rép., en cours' }),
    )
    const sheet = await screen.findByRole('dialog', { name: 'Étape 2 sur 6' })
    expect(within(sheet).getByText('Ton record : 3 rép., le 15 octobre')).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'Voir la fiche de l’exercice' })).toHaveAttribute(
      'href',
      '/library/pullup-chest-to-bar',
    )
    await user.click(within(sheet).getByRole('button', { name: 'Je l’ai réussie' }))
    expect(await screen.findByText('Étape cochée')).toBeInTheDocument()
    expect(
      await screen.findByRole('button', {
        name: 'Étape 2 : Tractions poitrine à la barre, 5 rép., franchie',
      }),
    ).toHaveTextContent('Cochée le 21 octobre')
    expect(
      screen.getByRole('button', {
        name: 'Étape 3 : Transition de muscle-up (barre basse), 5 rép., en cours',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('33 %')).toBeInTheDocument()

    // De retour dans la liste : l'objectif est en cours, la suggestion a disparu.
    await user.click(screen.getByRole('button', { name: 'Objectifs' }))
    expect(
      await screen.findByRole('link', {
        name: /^Muscle-up \(sur l’accueil\)\s:\sÉtape 3 sur 6\s:\sTransition de muscle-up \(barre basse\), 33\s%$/,
      }),
    ).toHaveAttribute('href', '/goals/' + ((await db.goals.toArray())[0]?.id ?? ''))
    expect(screen.queryByText('Tes figures visées')).not.toBeInTheDocument()
    expect(screen.queryByText('Fixe-toi un cap')).not.toBeInTheDocument()
  })

  it('crée un objectif d’exercice au-delà du record, le modifie, puis l’archive', async () => {
    const { user } = await renderApp('/goals', {
      setup: () => db.workouts.put(doneWorkout('w1', '2026-10-15', 'pushup', 12)),
    })
    await user.click(await screen.findByRole('button', { name: 'Nouvel objectif' }))
    expect(await screen.findByRole('radio', { name: 'Figure' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('radio', { name: 'Exercice' }))
    await user.click(screen.getByRole('button', { name: 'Choisir un exercice' }))
    const picker = await screen.findByRole('dialog', { name: 'Choisir un exercice' })
    await user.type(within(picker).getByRole('searchbox', { name: 'Rechercher un exercice' }), 'pompes')
    await user.click(await within(picker).findByRole('button', { name: /^PompesSans matériel/ }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Choisir un exercice' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('radio', { name: 'Répétitions' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Ton record : 12 rép.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nom (facultatif)' })).toHaveAttribute(
      'placeholder',
      'Ex. Tractions\u00a0: 20 rép.',
    )

    // Viser son record ne suffit pas.
    const target = screen.getByRole('textbox', { name: 'Objectif' })
    await user.type(target, '12')
    await user.click(screen.getByRole('button', { name: 'Créer l’objectif' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ton record est déjà de 12 rép. : vise plus haut.',
    )
    await user.clear(target)
    await user.type(target, '20')
    expect(screen.getByRole('textbox', { name: 'Nom (facultatif)' })).toHaveAttribute(
      'placeholder',
      'Pompes\u00a0: 20 rép.',
    )
    await user.click(screen.getByRole('button', { name: 'Créer l’objectif' }))
    expect(await screen.findByText('Objectif créé')).toBeInTheDocument()

    await goalHeading(/^Pompes\s:\s20 rép\.$/)
    expect(screen.getByText('Record : 12 rép. · objectif 20 rép.')).toBeInTheDocument()
    expect(screen.getByText('Encore 8 rép.')).toBeInTheDocument()
    expect(screen.getByText('0 %')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '12 rép.Jeudi 15 octobre' })).toHaveAttribute(
      'href',
      '/training/history/w1',
    )

    // Une cible plus proche : le titre proposé suit.
    await user.click(screen.getByRole('button', { name: 'Modifier l’objectif' }))
    const edit = await screen.findByRole('dialog', { name: 'Modifier l’objectif' })
    const editTarget = within(edit).getByRole('textbox', { name: 'Objectif' })
    expect(editTarget).toHaveValue('20')
    await user.clear(editTarget)
    await user.type(editTarget, '15')
    await user.click(within(edit).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Objectif enregistré')).toBeInTheDocument()
    await goalHeading(/^Pompes\s:\s15 rép\.$/)
    expect(screen.getByText('Record : 12 rép. · objectif 15 rép.')).toBeInTheDocument()

    // Réussi sans l'avoir noté, puis rangé.
    await user.click(screen.getByRole('button', { name: /^Marquer comme atteint/ }))
    expect(await screen.findByText('Objectif atteint, bravo !')).toBeInTheDocument()
    expect(await screen.findByText('100 %')).toBeInTheDocument()
    expect(screen.getByText('Atteint le 21 octobre')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Archiver/ }))
    expect(await screen.findByText('Objectif archivé')).toBeInTheDocument()
    expect(await screen.findByText('Archivé')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Objectifs' }))
    const showArchived = await screen.findByRole('button', { name: 'Voir les objectifs archivés (1)' })
    expect(screen.queryByRole('heading', { name: 'En cours' })).not.toBeInTheDocument()
    await user.click(showArchived)
    expect(
      await screen.findByRole('link', { name: /^Pompes\s:\s15 rép\.\s:\sAtteint le 21 octobre, 100\s%$/ }),
    ).toBeInTheDocument()
  })

  it('suit le poids : pesées, barre et suppression d’une pesée', async () => {
    const { user } = await renderApp('/goals/new?type=bodyweight', {
      setup: () => logWeight('2026-10-14', 82),
    })
    expect(await screen.findByRole('textbox', { name: 'Poids actuel' })).toHaveValue('82')
    await user.type(screen.getByRole('textbox', { name: 'Poids visé' }), '75')
    await user.click(screen.getByRole('button', { name: 'Créer l’objectif' }))
    await goalHeading('Peser 75 kg')
    expect(screen.getByText('82 kg · objectif 75 kg')).toBeInTheDocument()
    expect(screen.getByText('Encore 7 kg à perdre')).toBeInTheDocument()
    expect(screen.getByText('0 %')).toBeInTheDocument()
    // Le poids n'a pas changé : pas de nouvelle pesée.
    expect(await db.bodyMetrics.count()).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Noter mon poids' }))
    const sheet = await screen.findByRole('dialog', { name: 'Noter mon poids' })
    const weight = within(sheet).getByRole('textbox', { name: 'Poids' })
    expect(weight).toHaveValue('82')
    await user.clear(weight)
    await user.type(weight, '78,5')
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Poids noté')).toBeInTheDocument()
    expect(await screen.findByText('50 %')).toBeInTheDocument()
    expect(screen.getByText('78,5 kg · objectif 75 kg')).toBeInTheDocument()
    expect(screen.getByText('Encore 3,5 kg à perdre')).toBeInTheDocument()
    expect((await db.profile.get('me'))?.weightKg).toBe(78.5)

    // Une pesée de trop : on la supprime, le poids revient à la précédente.
    await user.click(screen.getByRole('button', { name: 'Supprimer la pesée : Aujourd’hui' }))
    const confirm = await screen.findByRole('dialog', { name: /^Supprimer cette pesée/ })
    expect(confirm).toHaveTextContent('78,5 kg, aujourd’hui.')
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByText('Pesée supprimée')).toBeInTheDocument()
    expect(await screen.findByText('82 kg · objectif 75 kg')).toBeInTheDocument()
    expect((await db.profile.get('me'))?.weightKg).toBe(82)
  })

  it('crée un objectif d’escalade et un objectif libre', async () => {
    const { user, router } = await renderApp('/goals/new?type=climbing')
    expect(await screen.findByRole('radio', { name: 'Escalade' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'Créer l’objectif' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choisis un niveau.')
    await user.click(screen.getByRole('radio', { name: 'Bleu' }))
    expect(
      screen.getByText('6A – 6B en Fontainebleau · les blocs plus durs comptent aussi'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Nombre de blocs : plus' }))
    expect(screen.getByRole('textbox', { name: 'Nom (facultatif)' })).toHaveAttribute(
      'placeholder',
      '2 blocs bleus',
    )
    await user.click(screen.getByRole('button', { name: 'Créer l’objectif' }))
    await goalHeading('2 blocs bleus')
    expect(screen.getByText('0 sur 2 · bleu ou plus dur')).toBeInTheDocument()
    expect(screen.getByText('Bleu ou plus dur')).toBeInTheDocument()

    await router.navigate('/goals/new?type=custom')
    expect(await screen.findByRole('radio', { name: 'Autre' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'Créer l’objectif' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Donne un nom à ton objectif.')
    await user.type(screen.getByRole('textbox', { name: 'Nom' }), 'Courir 10 km')
    await user.click(screen.getByRole('button', { name: 'Créer l’objectif' }))
    await goalHeading('Courir 10 km')
    expect(screen.getByText('Avancement noté à la main')).toBeInTheDocument()
    // Trois touches à la suite, sans attendre l'enregistrement : aucune ne se perd.
    const plus = screen.getByRole('button', { name: 'Avancement : plus' })
    await user.click(plus)
    await user.click(plus)
    await user.click(plus)
    expect(screen.getByRole('group', { name: 'Avancement' })).toHaveTextContent('15 %')
    await waitFor(() => {
      expect(screen.getByRole('progressbar', { name: 'Avancement de « Courir 10 km »' })).toHaveAttribute(
        'aria-valuenow',
        '15',
      )
    })
    expect((await db.goals.toArray()).find((g) => g.kind === 'custom')?.manualProgress).toBe(15)
  })

  it('fait choisir un autre niveau quand celui de l’objectif a disparu de l’échelle', async () => {
    const { user } = await renderApp('/goals/mauve', {
      setup: () =>
        saveGoal({
          ...customGoal(
            { title: '3 blocs mauves', deadline: null, pinned: false },
            '2026-10-01T08:00:00.000Z',
            () => 'mauve',
          ),
          kind: 'climbing',
          scaleId: VERTICAL_ART_SCALE_ID,
          gradeKey: 'mauve',
          targetCount: 3,
        }),
    })
    await goalHeading('3 blocs mauves')
    expect(screen.getByText('Niveau introuvable')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Modifier l’objectif' }))
    const edit = await screen.findByRole('dialog', { name: 'Modifier l’objectif' })
    expect(
      await within(edit).findByText('Ce niveau n’existe plus : choisis-en un autre.'),
    ).toBeInTheDocument()
    await user.click(within(edit).getByRole('button', { name: 'Enregistrer' }))
    expect(await within(edit).findByRole('alert')).toHaveTextContent('Choisis un niveau.')
    await user.click(within(edit).getByRole('radio', { name: 'Bleu' }))
    await user.click(within(edit).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Objectif enregistré')).toBeInTheDocument()
    expect(await screen.findByText('0 sur 3 · bleu ou plus dur')).toBeInTheDocument()
  })

  it('montre dans le bilan les objectifs qu’une séance a fait avancer', async () => {
    await renderApp('/training/history/w2', {
      setup: async () => {
        await addSkillGoals(['muscleUp'], (id) => id)
        await db.workouts.bulkPut([
          doneWorkout('w1', '2026-10-10', 'pullup', 8),
          doneWorkout('w2', '2026-10-15', 'pullup-chest-to-bar', 5),
        ])
      },
    })
    expect(await screen.findByRole('heading', { name: 'Objectifs' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', {
        name: /^Muscle-up\s:\sÉtape franchie\s:\sTractions poitrine à la barre, de 16\s%\sà 33\s%$/,
      }),
    ).toHaveAttribute('href', `/goals/${(await db.goals.toArray())[0]?.id ?? ''}`)
  })
})
