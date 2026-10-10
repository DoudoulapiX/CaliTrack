import { screen, waitFor, within } from '@testing-library/react'
import { addSession, addSlot, emptyProgram, newSession, newSlot } from '@/content/programs/edit'
import { schemeFor } from '@/content/programs/schemes'
import { db } from '@/db/db'
import { newEquipmentItem, saveEquipmentItem } from '@/db/equipment'
import { saveProgram } from '@/db/programs'
import { updateProfile } from '@/db/settings'
import type { Program, ProgramSlot } from '@/db/types'
import { sequentialIds, testCatalog } from '@/test/fixtures'
import { renderApp } from '@/test/render-app'

const PROGRAM_ID = 't-1'
const SESSION_ID = 't-2'
const SESSION_PATH = `/training/programs/${PROGRAM_ID}/sessions/${SESSION_ID}`

/**
 * Programme fait main : une séance le lundi et le jeudi, avec une figure (tractions poitrine à la
 * barre, progression du muscle-up) puis des pompes et des dips.
 */
async function saveCustomProgram(): Promise<Program> {
  const { byId } = await testCatalog()
  const get = (id: string) => {
    const exercise = byId.get(id)
    if (!exercise) throw new Error(id)
    return exercise
  }
  const newId = sequentialIds('t')
  const defaults = { scheme: schemeFor(['strength'], 'intermediate'), loadsOf: () => [], newId }
  let program = emptyProgram({
    name: 'Mon programme',
    focuses: ['strength'],
    locationId: null,
    startDate: '2026-10-05',
    now: '2026-10-05T08:00:00.000Z',
    newId,
  })
  const session = newSession('Haut du corps', [1, 4], newId)
  program = addSession(program, session)
  const skill = newSlot(get('pullup-chest-to-bar'), 'skill', defaults, 'skill:muscleUp')
  program = addSlot(program, session.id, 'skill', skill, newId)
  program = addSlot(program, session.id, 'strength', newSlot(get('pushup'), 'strength', defaults), newId)
  program = addSlot(program, session.id, 'strength', newSlot(get('dip'), 'strength', defaults), newId)
  await saveEquipmentItem(newEquipmentItem('pullupBar'))
  await saveEquipmentItem(newEquipmentItem('dipBars'))
  return saveProgram(program)
}

async function storedProgram(): Promise<Program> {
  const program = await db.programs.get(PROGRAM_ID)
  if (!program) throw new Error('programme manquant')
  return program
}

async function storedSlots(): Promise<{ kind: string; slots: ProgramSlot[] }[]> {
  const program = await storedProgram()
  return (program.sessions[0]?.blocks ?? []).map((block) => ({ kind: block.kind, slots: block.slots }))
}

describe('programme d’entraînement', () => {
  it('prépare un programme d’après le profil, le suit et signale un profil qui a changé', async () => {
    const { user, router } = await renderApp('/training', {
      setup: () => saveEquipmentItem(newEquipmentItem('pullupBar')),
    })
    await user.click(await screen.findByRole('link', { name: 'Créer mon programme' }))
    expect(await screen.findByRole('button', { name: 'Suivre ce programme' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/training/new')
    expect(screen.getByText(/^Aperçu/)).toBeInTheDocument()

    // Les réglages du profil sont résumés ; on y va et on revient à l'aperçu.
    const profileLink = screen.getByRole('link', { name: /Jours, durée et objectifs/ })
    expect(profileLink).toHaveTextContent('Lun, Mer, Ven · 60 min · Force · Figures')
    await user.click(profileLink)
    expect(await screen.findByRole('heading', { name: 'Profil et niveau', level: 1 })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?depuis=nouveau-programme')
    await user.click(screen.getByRole('button', { name: 'Retour' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/training/new')
    })

    await user.click(await screen.findByRole('button', { name: 'Suivre ce programme' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/training')
    })
    expect(await screen.findByText('Cette semaine')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^(lundi|mercredi|vendredi) .+ : / })).toHaveLength(3)
    const programs = await db.programs.toArray()
    expect(programs).toHaveLength(1)
    expect(programs[0]).toMatchObject({ active: true, source: 'generated' })

    await updateProfile({ trainingDays: [2, 4, 6] })
    expect(
      await screen.findByText('Tes jours ou tes objectifs ne correspondent plus à ce programme.'),
    ).toBeInTheDocument()
  })

  it('règle puis retire un exercice de la séance', async () => {
    const { user } = await renderApp(SESSION_PATH, { setup: saveCustomProgram })
    await user.click(await screen.findByRole('button', { name: /^Pompes/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Renforcement' })
    const save = within(sheet).getByRole('button', { name: 'Enregistrer' })
    expect(save).toBeDisabled()
    await user.click(within(sheet).getByRole('button', { name: 'Séries : plus' }))
    await user.click(within(sheet).getByRole('button', { name: 'Répétitions par série, objectif : plus' }))
    await user.type(within(sheet).getByLabelText('Note'), 'Mains larges')
    await user.click(save)
    expect(await screen.findByText('Exercice enregistré')).toBeInTheDocument()
    await waitFor(async () => {
      const strength = (await storedSlots()).find((block) => block.kind === 'strength')
      expect(strength?.slots[0]).toMatchObject({
        exerciseId: 'pushup',
        sets: 4,
        target: { kind: 'reps', min: 5, max: 9 },
        note: 'Mains larges',
      })
    })

    await user.click(await screen.findByRole('button', { name: /^Pompes/ }))
    const again = await screen.findByRole('dialog', { name: 'Renforcement' })
    await user.click(within(again).getByRole('button', { name: 'Retirer de la séance' }))
    await user.click(within(again).getByRole('button', { name: 'Retirer' }))
    expect(await screen.findByText('Exercice retiré')).toBeInTheDocument()
    await waitFor(async () => {
      const strength = (await storedSlots()).find((block) => block.kind === 'strength')
      expect(strength?.slots.map((slot) => slot.exerciseId)).toEqual(['dip'])
    })
  })

  it('change d’exercice en choisissant un échelon de la progression', async () => {
    const { user } = await renderApp(SESSION_PATH, { setup: saveCustomProgram })
    await user.click(await screen.findByRole('button', { name: /^Tractions poitrine à la barre/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Figures' })
    expect(within(sheet).getByText(/étape 2 sur 6/)).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Changer' }))

    const picker = await screen.findByRole('dialog', { name: 'Changer d’exercice' })
    // Le muscle-up revient deux fois (1 puis 5 répétitions) : seul l'échelon en cours est coché.
    const current = within(picker).getByRole('button', { name: /^Tractions poitrine à la barre.*Étape 2/ })
    expect(current).toHaveAttribute('aria-current', 'true')
    const steps = within(picker).getAllByRole('button', { name: /^Muscle-up à la barre.*Étape \d sur 6/ })
    expect(steps.map((step) => step.textContent)).toEqual([
      'Muscle-up à la barreÉtape 5 sur 6 · objectif 1 rép.',
      'Muscle-up à la barreÉtape 6 sur 6 · objectif 5 rép.',
    ])
    await user.click(steps[1]!)

    const editor = await screen.findByRole('dialog', { name: 'Figures' })
    expect(within(editor).getByText(/étape 6 sur 6/)).toBeInTheDocument()
    const atLeast = within(editor).getByRole('group', { name: 'Répétitions par série, au moins' })
    const goal = within(editor).getByRole('group', { name: 'Répétitions par série, objectif' })
    expect(within(atLeast).getByRole('status')).toHaveTextContent('3')
    expect(within(goal).getByRole('status')).toHaveTextContent('5')
    await user.click(within(editor).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(async () => {
      const skill = (await storedSlots()).find((block) => block.kind === 'skill')
      expect(skill?.slots[0]).toMatchObject({
        exerciseId: 'muscleup',
        ladderId: 'skill:muscleUp',
        target: { kind: 'reps', min: 3, max: 5 },
      })
    })
  })

  it('ajoute un exercice dans un nouveau bloc et réorganise la séance', async () => {
    const { user } = await renderApp(SESSION_PATH, { setup: saveCustomProgram })
    await user.click(await screen.findByRole('button', { name: 'Ajouter un exercice' }))
    const sheet = await screen.findByRole('dialog', { name: 'Ajouter un exercice' })
    await user.click(within(sheet).getByRole('radio', { name: 'Gainage' }))
    await user.type(within(sheet).getByRole('searchbox', { name: 'Rechercher un exercice' }), 'avant-bras')
    await user.click(await within(sheet).findByRole('button', { name: /^Gainage sur les avant-bras/ }))
    expect(await screen.findByText(/Gainage sur les avant-bras.+ajouté/)).toBeInTheDocument()
    await waitFor(async () => {
      expect((await storedSlots()).map((block) => block.kind)).toEqual(['skill', 'strength', 'core'])
    })
    const core = (await storedSlots()).find((block) => block.kind === 'core')
    expect(core?.slots[0]).toMatchObject({ exerciseId: 'plank', ladderId: 'core', restSec: 60 })
    expect(await screen.findByRole('heading', { name: 'Gainage' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Réorganiser' }))
    expect(screen.getByRole('button', { name: 'Monter Pompes' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Descendre Pompes' }))
    await waitFor(async () => {
      const strength = (await storedSlots()).find((block) => block.kind === 'strength')
      expect(strength?.slots.map((slot) => slot.exerciseId)).toEqual(['dip', 'pushup'])
    })
    await user.click(screen.getByRole('button', { name: 'Terminé' }))
    expect(screen.queryByRole('button', { name: 'Descendre Pompes' })).not.toBeInTheDocument()
  })

  it('ajoute, renomme, duplique et supprime une séance', async () => {
    const { user, router } = await renderApp(`/training/programs/${PROGRAM_ID}`, { setup: saveCustomProgram })
    await user.click(await screen.findByRole('button', { name: 'Ajouter une séance' }))
    const sheet = await screen.findByRole('dialog', { name: 'Nouvelle séance' })
    await user.type(within(sheet).getByLabelText('Nom'), 'Jambes')
    const days = within(sheet).getByRole('group', { name: 'Jours de la séance' })
    await user.click(within(days).getByRole('button', { name: 'samedi' }))
    await user.click(within(sheet).getByRole('button', { name: 'Créer la séance' }))
    expect(await screen.findByRole('heading', { name: 'Jambes', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Séance vide')).toBeInTheDocument()
    expect((await storedProgram()).sessions.map((s) => [s.name, s.weekdays])).toEqual([
      ['Haut du corps', [1, 4]],
      ['Jambes', [6]],
    ])

    await user.click(screen.getByRole('button', { name: 'Réglages de la séance' }))
    let settings = await screen.findByRole('dialog', { name: 'Séance' })
    const name = within(settings).getByLabelText('Nom')
    await user.clear(name)
    await user.type(name, 'Jambes et gainage')
    await user.click(within(settings).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('heading', { name: 'Jambes et gainage', level: 1 })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Réglages de la séance' }))
    settings = await screen.findByRole('dialog', { name: 'Séance' })
    await user.click(within(settings).getByRole('button', { name: 'Dupliquer la séance' }))
    expect(
      await screen.findByRole('heading', { name: 'Jambes et gainage (copie)', level: 1 }),
    ).toBeInTheDocument()
    expect((await storedProgram()).sessions).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: 'Réglages de la séance' }))
    settings = await screen.findByRole('dialog', { name: 'Séance' })
    await user.click(within(settings).getByRole('button', { name: 'Supprimer la séance' }))
    const confirm = await screen.findByRole('dialog', { name: /^Supprimer la séance/ })
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/training/programs/${PROGRAM_ID}`)
    })
    await waitFor(async () => {
      expect((await storedProgram()).sessions.map((s) => s.name)).toEqual([
        'Haut du corps',
        'Jambes et gainage',
      ])
    })
  })

  it('règle, suit, copie et supprime un programme', async () => {
    const { user, router } = await renderApp(`/training/programs/${PROGRAM_ID}`, { setup: saveCustomProgram })
    expect(await screen.findByText('Pas suivi en ce moment')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Suivre ce programme' }))
    expect(await screen.findByText('Programme suivi')).toBeInTheDocument()
    expect(await storedProgram()).toMatchObject({ active: true })

    await user.click(screen.getByRole('button', { name: 'Réglages du programme' }))
    const sheet = await screen.findByRole('dialog', { name: 'Réglages du programme' })
    const name = within(sheet).getByLabelText('Nom')
    await user.clear(name)
    await user.type(name, 'Force maison')
    await user.click(within(sheet).getByRole('radio', { name: '4 sem.' }))
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('heading', { name: 'Force maison', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/semaine allégée toutes les 4 semaines/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dupliquer le programme' }))
    expect(await screen.findByRole('heading', { name: 'Force maison (copie)', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Pas suivi en ce moment')).toBeInTheDocument()
    const copyPath = router.state.location.pathname
    expect(copyPath).not.toBe(`/training/programs/${PROGRAM_ID}`)

    await user.click(screen.getByRole('button', { name: 'Supprimer le programme' }))
    const confirm = await screen.findByRole('dialog', { name: /^Supprimer le programme/ })
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/training/programs')
    })
    const row = await screen.findByRole('link', { name: /^Force maison/ })
    expect(row).toHaveTextContent('Suivi')
    expect(await db.programs.count()).toBe(1)
  })
})
