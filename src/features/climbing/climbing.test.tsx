import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { climbingGoal } from '@/content/goals/create'
import { builtInScale, VERTICAL_ART_SCALE_ID } from '@/content/grades'
import { addClimb } from '@/db/climbing'
import { db } from '@/db/db'
import { saveGoal } from '@/db/goals'
import { updateProfile } from '@/db/settings'
import { climbSession } from '@/test/fixtures'
import { renderApp } from '@/test/render-app'

// Les horloges de la séance en direct ne tournent pas pendant les tests.
vi.mock('@/features/workout/useNow', () => ({ useNow: () => Date.now() }))

/** Le texte affiché garde une espace insécable avant « : ; ! ? % » (jamais de signe seul en début de ligne). */
function expectFrenchSpacing() {
  expect(document.body.textContent).not.toMatch(/ [:;!?%»]/)
}

/** La valeur d'une tuile de chiffres. */
function tile(label: string): string | null | undefined {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent
}

/** La touche d'une couleur de la palette (Vertical’Art : « Bleu, 6A – 6B : ajouter un bloc »). */
function colorButton(label: string) {
  return screen.getByRole('button', { name: new RegExp(`^${label}, [^:]+\\s:\\sajouter un bloc`) })
}

/** Un objectif « 3 blocs bleus ou plus durs », épinglé. */
async function saveBlueGoal() {
  const blue = builtInScale(VERTICAL_ART_SCALE_ID)?.grades.find((g) => g.key === 'bleu')
  if (!blue) throw new Error('bleu')
  await saveGoal(
    climbingGoal(
      { scaleId: VERTICAL_ART_SCALE_ID, grade: blue, count: 3 },
      { title: '', deadline: null, pinned: true },
      '2026-10-01T08:00:00.000Z',
      () => 'g1',
    ),
  )
}

describe('escalade', () => {
  beforeEach(() => {
    // Le mercredi 21 octobre 2026, à 18 h.
    vi.setSystemTime(new Date(2026, 9, 21, 18, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('note une séance en direct, couleur par couleur, jusqu’au bilan', async () => {
    const { user, router } = await renderApp('/climbing', {
      setup: async () => {
        await addClimb(
          climbSession('avant', '2026-10-17', [
            ['vert', 'sent'],
            ['bleu', 'failed'],
          ]),
        )
        await saveBlueGoal()
      },
    })
    await user.click(await screen.findByRole('button', { name: 'Commencer une séance' }))
    expect(await screen.findByRole('heading', { name: 'Vertical’Art', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toMatch(/^\/climbing\/session\/.+/)
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).not.toBeInTheDocument()
    expect(screen.getByText('Touche la couleur d’un bloc après l’avoir tenté : réussi ou pas, il compte.'))
    expect(screen.getByText('Aucun bloc noté')).toBeInTheDocument()
    expectFrenchSpacing()

    // Un bleu du premier coup.
    await user.click(colorButton('Bleu'))
    const blue = await screen.findByRole('dialog', { name: 'Bloc bleu' })
    expect(within(blue).getByText('6A – 6B en Fontainebleau')).toBeInTheDocument()
    expect(within(blue).getByText('Flash : réussi du premier coup.')).toBeInTheDocument()
    await user.click(within(blue).getByRole('button', { name: 'Ajouter le bloc' }))
    expect(await screen.findByText('Bloc bleu ajouté')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Blocs notés (1)' })).toBeInTheDocument()
    expect(await screen.findByText('1 bloc réussi')).toBeInTheDocument()

    // Un rouge pas réussi en deux essais, à retenter, avec son style et une note.
    await user.click(colorButton('Rouge'))
    const red = await screen.findByRole('dialog', { name: 'Bloc rouge' })
    await user.click(within(red).getByRole('radio', { name: 'Pas réussi' }))
    await user.click(within(red).getByRole('button', { name: 'Essais : plus' }))
    expect(within(red).getByText('Tenté 2 fois.')).toBeInTheDocument()
    await user.click(within(red).getByRole('switch', { name: 'À retenter' }))
    await user.click(within(red).getByRole('button', { name: 'Style et note (facultatif)' }))
    await user.click(within(red).getByRole('button', { name: 'Dévers' }))
    await user.type(within(red).getByLabelText('Note'), 'Le toit du fond')
    await user.click(within(red).getByRole('button', { name: 'Ajouter le bloc' }))
    expect(await screen.findByRole('heading', { name: 'Blocs notés (2)' })).toBeInTheDocument()
    expect(await screen.findByText('En projet · 2 essais · Dévers · Le toit du fond')).toBeInTheDocument()

    // Un autre bleu, au troisième essai : la touche bleue compte les réussites.
    await user.click(colorButton('Bleu'))
    const blue2 = await screen.findByRole('dialog', { name: 'Bloc bleu' })
    await user.click(within(blue2).getByRole('button', { name: 'Essais : plus' }))
    await user.click(within(blue2).getByRole('button', { name: 'Essais : plus' }))
    expect(within(blue2).getByText('Réussi au 3e essai.')).toBeInTheDocument()
    await user.click(within(blue2).getByRole('button', { name: 'Ajouter le bloc' }))
    expect(await screen.findByRole('heading', { name: 'Blocs notés (3)' })).toBeInTheDocument()
    await waitFor(() => {
      expect(colorButton('Bleu')).toHaveAccessibleName(/\(2 réussis\)$/)
    })
    expect(await screen.findByText('2 réussis sur 3')).toBeInTheDocument()

    // Le rouge finalement réussi : on corrige le bloc.
    await user.click(screen.getByRole('button', { name: /^RougeEn projet/ }))
    const edit = await screen.findByRole('dialog', { name: 'Modifier le bloc' })
    expect(within(edit).getByRole('radio', { name: 'Rouge' })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(edit).getByRole('radio', { name: 'Réussi' }))
    await user.click(within(edit).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Bloc modifié')).toBeInTheDocument()
    expect(await screen.findByText('Réussi en 2 essais · Dévers · Le toit du fond')).toBeInTheDocument()

    // On sort de la séance : elle reste en cours, avec sa barre au-dessus des onglets.
    await user.click(screen.getByRole('button', { name: 'Escalade' }))
    expect(await screen.findByText('Séance en cours')).toBeInTheDocument()
    expect(await screen.findByText('Depuis 18:00 · 3 blocs réussis')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Commencer une séance' })).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('link', { name: /^Reprendre la séance d’escalade en cours\s:\sVertical’Art$/ }),
    )

    // Fin de séance : durée, ressenti, notes.
    await user.click(await screen.findByRole('button', { name: 'Terminer la séance' }))
    const finish = await screen.findByRole('dialog', { name: 'Terminer la séance' })
    expect(within(finish).queryByRole('button', { name: 'Abandonner la séance' })).not.toBeInTheDocument()
    const duration = within(finish).getByLabelText('Durée')
    await user.clear(duration)
    await user.type(duration, '95')
    await user.click(within(finish).getByRole('radio', { name: 'Dur' }))
    await user.type(within(finish).getByLabelText('Notes'), 'Belle séance')
    await user.click(within(finish).getByRole('button', { name: 'Enregistrer la séance' }))

    // Le bilan : chiffres, records battus, objectif atteint.
    expect(await screen.findByText('Séance terminée')).toBeInTheDocument()
    expect(tile('Durée')).toBe('1 h 35')
    expect(tile('Blocs réussis')).toBe('3')
    expect(tile('Flash')).toBe('1')
    expect(tile('Meilleur bloc')).toBe('Rouge')
    expect(screen.getByText('Niveau le plus dur réussi')).toBeInTheDocument()
    expect(screen.getByText('Rouge (6B+ – 6C+) · avant : vert')).toBeInTheDocument()
    expect(screen.getByText('Premier flash')).toBeInTheDocument()
    expect(screen.getByText('Bleu (6A – 6B)')).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: /^3 blocs bleus : Objectif atteint, bravo/ }),
    ).toHaveAttribute('href', '/goals/g1')
    expect(screen.getByText('Dur')).toBeInTheDocument()
    expect(screen.getByText('Belle séance')).toBeInTheDocument()
    // Le bilan se lit : on ne touche plus aux blocs ici.
    expect(screen.queryByRole('button', { name: /ajouter un bloc/ })).not.toBeInTheDocument()
    expectFrenchSpacing()

    const [saved] = await db.climbingSessions.where('status').equals('done').reverse().sortBy('date')
    expect(saved).toMatchObject({ durationMin: 95, rpe: 8, notes: 'Belle séance', gym: 'Vertical’Art' })
    expect(saved?.boulders.map((b) => [b.gradeKey, b.result, b.attempts])).toEqual([
      ['bleu', 'flash', 1],
      ['rouge', 'sent', 2],
      ['bleu', 'sent', 3],
    ])

    // Retour à l'onglet : le mois, le niveau, la pyramide et les dernières séances.
    await user.click(screen.getByRole('button', { name: 'Terminé' }))
    expect(await screen.findByRole('heading', { name: 'Escalade', level: 1 })).toBeInTheDocument()
    expect(tile('Séances')).toBe('2')
    expect(tile('Blocs réussis')).toBe('4')
    expect(tile('Temps grimpé')).toBe('3 h 05')
    expect(tile('Flash')).toBe('25\u00a0%')
    expect(
      screen.getByRole('link', { name: /^Rouge · 6B\+ – 6C\+Bloc le plus dur réussi/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Bleu · 6A – 6BFlash le plus dur, depuis le 21 octobre 2026/ }))
    expect(screen.getByRole('list', { name: 'Pyramide des blocs réussis' })).toHaveTextContent(
      /^Noir0 réussi.*Rouge1 réussi.*Bleu2 réussis, dont 1 flash.*Vert1 réussi$/,
    )
    expect(screen.getByRole('link', { name: /^Mercredi 21 octobre/ })).toHaveTextContent(
      'Vertical’Art · 1 h 35 · 3 blocs réussis · Dur',
    )
    expect(screen.getByRole('link', { name: /^Samedi 17 octobre/ })).toBeInTheDocument()
    expectFrenchSpacing()
  })

  it('abandonne une séance vide', async () => {
    const { user, router } = await renderApp('/climbing')
    await user.click(await screen.findByRole('button', { name: 'Commencer une séance' }))
    await user.click(await screen.findByRole('button', { name: 'Terminer la séance' }))
    const finish = await screen.findByRole('dialog', { name: 'Terminer la séance' })
    expect(within(finish).getByText(/^Aucun bloc noté : la séance compte quand même/)).toBeInTheDocument()
    await user.click(within(finish).getByRole('button', { name: 'Abandonner la séance' }))
    expect(await screen.findByText('Séance abandonnée')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/climbing')
    expect(await db.climbingSessions.count()).toBe(0)
    expect(await screen.findByText('Note ta première séance')).toBeInTheDocument()
  })

  it('reprend la séance en cours au lieu d’en commencer une deuxième', async () => {
    const { user, router } = await renderApp('/climbing', {
      setup: () => addClimb(climbSession('live', '2026-10-21', [], { status: 'active', endedAt: null })),
    })
    expect(await screen.findByText('Séance en cours')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Reprendre' }))
    expect(router.state.location.pathname).toBe('/climbing/session/live')
    // L'adresse de l'historique d'une séance en cours mène à la séance.
    await router.navigate('/climbing/history/live')
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/climbing/session/live')
    })
    // Une séance qui n'existe pas.
    await router.navigate('/climbing/history/inconnue')
    expect(await screen.findByText('Séance introuvable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir mes séances' })).toHaveAttribute(
      'href',
      '/climbing/history',
    )
  })

  it('corrige une séance de l’historique, puis la supprime', async () => {
    const { user, router } = await renderApp('/climbing/history', {
      setup: async () => {
        await addClimb(
          climbSession('a', '2026-10-17', [
            ['vert', 'sent'],
            ['bleu', 'flash'],
          ]),
        )
        await addClimb(climbSession('b', '2026-09-26', [['orange', 'flash']]))
      },
    })
    expect(await screen.findByRole('heading', { name: 'Séances d’escalade' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Octobre 2026' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Septembre 2026' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /^Samedi 17Vertical’Art · 1 h 30 · 2 blocs réussis$/ }))

    expect(await screen.findByText('Samedi 17 octobre · 18:00 – 19:30')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/climbing/history/a')
    // Un bloc oublié : les couleurs se déplient.
    const toggle = screen.getByRole('button', { name: 'Ajouter un bloc' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    await user.click(colorButton('Noir'))
    const black = await screen.findByRole('dialog', { name: 'Bloc noir' })
    await user.click(within(black).getByRole('radio', { name: 'Pas réussi' }))
    await user.click(within(black).getByRole('button', { name: 'Ajouter le bloc' }))
    expect(await screen.findByRole('heading', { name: 'Blocs notés (3)' })).toBeInTheDocument()
    expect(await screen.findByText('Pas réussi · 1 essai')).toBeInTheDocument()

    // Un bloc noté par erreur.
    await user.click(screen.getByRole('button', { name: /^VertRéussi en 2 essais/ }))
    const wrong = await screen.findByRole('dialog', { name: 'Modifier le bloc' })
    await user.click(within(wrong).getByRole('button', { name: 'Supprimer le bloc' }))
    expect(await screen.findByText('Bloc supprimé')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Blocs notés (2)' })).toBeInTheDocument()

    // La salle, la durée et le ressenti.
    await user.click(screen.getByRole('button', { name: 'Modifier la séance' }))
    const info = await screen.findByRole('dialog', { name: 'Séance d’escalade' })
    expect(within(info).queryByRole('radiogroup', { name: 'Cotation' })).not.toBeInTheDocument()
    const gym = within(info).getByLabelText('Salle ou site')
    await user.clear(gym)
    await user.type(gym, 'Arkose')
    const duration = within(info).getByLabelText('Durée')
    await user.clear(duration)
    await user.type(duration, '120')
    await user.click(within(info).getByRole('radio', { name: 'Facile' }))
    await user.click(within(info).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Séance enregistrée')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Arkose', level: 1 })).toBeInTheDocument()
    expect(tile('Durée')).toBe('2 h 00')
    expect(tile('Blocs réussis')).toBe('1 sur 2')
    expect(screen.getByText('Facile')).toBeInTheDocument()
    // La salle d'une séance passée ne change pas celle des prochaines.
    expect((await db.settings.get('app'))?.climbingGym).toBe('Vertical’Art')
    expectFrenchSpacing()

    await user.click(screen.getByRole('button', { name: 'Supprimer la séance' }))
    const confirm = await screen.findByRole('dialog', { name: /^Supprimer la séance\s\?$/ })
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByText('Séance supprimée')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/climbing/history')
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Octobre 2026' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Septembre 2026' })).toBeInTheDocument()
    expect(await db.climbingSessions.count()).toBe(1)
  })

  it('note une séance passée, puis ses blocs', async () => {
    const { user, router } = await renderApp('/climbing')
    await user.click(await screen.findByRole('button', { name: 'Noter une séance passée' }))
    const sheet = await screen.findByRole('dialog', { name: 'Séance passée' })
    const day = within(sheet).getByLabelText('Jour')
    expect(day).toHaveValue('2026-10-21')
    // Un jour à venir est refusé.
    fireEvent.change(day, { target: { value: '2026-10-25' } })
    await user.click(within(sheet).getByRole('button', { name: 'Créer la séance' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Choisis un jour passé, ou aujourd’hui.')
    fireEvent.change(day, { target: { value: '2026-10-18' } })
    await user.type(within(sheet).getByLabelText('Durée (facultatif)'), '80')
    await user.click(within(sheet).getByRole('radio', { name: 'Fontainebleau' }))
    await user.click(within(sheet).getByRole('button', { name: 'Créer la séance' }))

    expect(await screen.findByText('Séance ajoutée')).toBeInTheDocument()
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/climbing\/history\/.+/)
    })
    expect(await screen.findByRole('button', { name: 'Supprimer la séance' })).toBeInTheDocument()
    expect(screen.getByText('Dimanche 18 octobre')).toBeInTheDocument()
    // Pas encore de bloc : les couleurs sont déjà dépliées, en cotation Fontainebleau.
    expect(screen.getByRole('button', { name: 'Ajouter un bloc' })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: /^6A\s:\sajouter un bloc$/ }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Bloc 6A' })).getByRole('button', {
        name: 'Ajouter le bloc',
      }),
    )
    expect(await screen.findByRole('heading', { name: 'Blocs notés (1)' })).toBeInTheDocument()
    expect(tile('Durée')).toBe('1 h 20')
    expect(tile('Meilleur bloc')).toBe('6A')

    const [past] = await db.climbingSessions.toArray()
    expect(past).toMatchObject({
      date: '2026-10-18',
      status: 'done',
      durationMin: 80,
      scaleId: 'fontainebleau',
    })
  })

  it('change les couleurs et les cotations de la salle', async () => {
    const { user } = await renderApp('/climbing/grades', {
      setup: () => addClimb(climbSession('a', '2026-10-17', [['vert', 'sent']])),
    })
    expect(
      await screen.findByRole('heading', { name: 'Couleurs et cotations', level: 1 }),
    ).toBeInTheDocument()
    const chips = screen.getByRole('radiogroup', { name: 'Échelle des nouvelles séances' })
    expect(within(chips).getByRole('radio', { name: 'Vertical’Art' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('heading', { name: 'Niveaux · Vertical’Art' })).toBeInTheDocument()
    const levels = () =>
      screen
        .getAllByRole('button', { name: /^(Orange|Vert|Bleu|Rouge|Noir|Violet|Blanc|Azur)/ })
        .map((b) => b.textContent)
    expect(levels()).toEqual([
      'Orange4 – 4+',
      'Vert5A – 5C',
      'Bleu6A – 6B',
      'Rouge6B+ – 6C+',
      'Noir7A – 7B',
      'Violet7B+ – 7C+',
    ])
    expectFrenchSpacing()

    // Le bleu devient « Azur », bleu clair : son identifiant ne change pas.
    await user.click(screen.getByRole('button', { name: /^Bleu6A/ }))
    let sheet = await screen.findByRole('dialog', { name: 'Niveau Bleu' })
    const name = within(sheet).getByLabelText('Nom')
    await user.clear(name)
    await user.type(name, 'Azur')
    await user.click(within(sheet).getByRole('radio', { name: 'Bleu clair' }))
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Niveau enregistré')).toBeInTheDocument()
    const va = await db.gradeScales.get(VERTICAL_ART_SCALE_ID)
    expect(va?.grades[2]).toEqual({ key: 'bleu', label: 'Azur', color: '#38bdf8', font: '6A – 6B' })

    // Le noir passe avant le rouge.
    await user.click(screen.getByRole('button', { name: /^Noir7A/ }))
    sheet = await screen.findByRole('dialog', { name: 'Niveau Noir' })
    expect(within(sheet).getByText('Place : 5 sur 6, du plus facile au plus dur')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Plus facile' }))
    expect(await within(sheet).findByText('Place : 4 sur 6, du plus facile au plus dur')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    await waitFor(() => {
      expect(levels()).toEqual([
        'Orange4 – 4+',
        'Vert5A – 5C',
        'Azur6A – 6B',
        'Noir7A – 7B',
        'Rouge6B+ – 6C+',
        'Violet7B+ – 7C+',
      ])
    })

    // Un niveau de plus, en haut de l'échelle (un nom déjà pris est refusé).
    await user.click(screen.getByRole('button', { name: 'Ajouter un niveau' }))
    sheet = await screen.findByRole('dialog', { name: 'Nouveau niveau' })
    await user.type(within(sheet).getByLabelText('Nom'), 'orange')
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter le niveau' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Ce nom existe déjà dans cette échelle.')
    await user.clear(within(sheet).getByLabelText('Nom'))
    await user.type(within(sheet).getByLabelText('Nom'), 'Blanc')
    await user.click(within(sheet).getByRole('radio', { name: 'Blanc' }))
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter le niveau' }))
    expect(await screen.findByText('Niveau ajouté')).toBeInTheDocument()
    expect(levels().at(-1)).toBe('BlancSans équivalence Fontainebleau')

    // Un niveau déjà utilisé ne se supprime pas ; un niveau libre, si.
    await user.click(screen.getByRole('button', { name: /^Vert5A/ }))
    sheet = await screen.findByRole('dialog', { name: 'Niveau Vert' })
    expect(await within(sheet).findByText('Utilisé par 1 bloc : renomme-le plutôt que de le supprimer.'))
    expect(within(sheet).getByRole('button', { name: 'Supprimer le niveau' })).toBeDisabled()
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    await user.click(screen.getByRole('button', { name: /^Violet7B\+/ }))
    sheet = await screen.findByRole('dialog', { name: 'Niveau Violet' })
    await waitFor(() => {
      expect(within(sheet).getByRole('button', { name: 'Supprimer le niveau' })).toBeEnabled()
    })
    await user.click(within(sheet).getByRole('button', { name: 'Supprimer le niveau' }))
    expect(await screen.findByText('Niveau supprimé')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Violet/ })).not.toBeInTheDocument()

    // Retour aux niveaux d'origine : « Blanc », inutilisé, disparaît.
    await user.click(screen.getByRole('button', { name: 'Revenir aux niveaux d’origine' }))
    const reset = await screen.findByRole('dialog', { name: /^Revenir aux niveaux d’origine\s\?$/ })
    await user.click(within(reset).getByRole('button', { name: 'Revenir à l’origine' }))
    expect(await screen.findByText('Niveaux d’origine rétablis')).toBeInTheDocument()
    await waitFor(() => {
      expect(levels()).toEqual([
        'Orange4 – 4+',
        'Vert5A – 5C',
        'Bleu6A – 6B',
        'Rouge6B+ – 6C+',
        'Noir7A – 7B',
        'Violet7B+ – 7C+',
      ])
    })
    expect(screen.queryByRole('button', { name: 'Revenir aux niveaux d’origine' })).not.toBeInTheDocument()

    // Une échelle pour une autre salle : elle sert aux prochaines séances, puis on la supprime.
    await user.click(screen.getByRole('button', { name: /^Nouvelle échelle pour une autre salle/ }))
    sheet = await screen.findByRole('dialog', { name: 'Nouvelle échelle' })
    await user.type(within(sheet).getByLabelText('Nom'), 'Arkose')
    await user.click(within(sheet).getByRole('button', { name: 'Créer l’échelle' }))
    expect(await screen.findByText('Échelle créée')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Niveaux · Arkose' })).toBeInTheDocument()
    expect(within(chips).getByRole('radio', { name: 'Arkose' })).toHaveAttribute('aria-checked', 'true')
    // Le bouton attend de savoir si l'échelle sert déjà.
    await user.click(await screen.findByRole('button', { name: 'Supprimer l’échelle' }))
    const remove = await screen.findByRole('dialog', { name: /^Supprimer l’échelle\s\?$/ })
    await user.click(within(remove).getByRole('button', { name: 'Supprimer l’échelle' }))
    expect(await screen.findByText('Échelle supprimée')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Niveaux · Vertical’Art' })).toBeInTheDocument()
    expect(await db.gradeScales.count()).toBe(2)

    // Fontainebleau pour les prochaines séances.
    await user.click(within(chips).getByRole('radio', { name: 'Fontainebleau' }))
    expect(await screen.findByRole('heading', { name: 'Niveaux · Fontainebleau' })).toBeInTheDocument()
    expect((await db.settings.get('app'))?.activeGradeScaleId).toBe('fontainebleau')
  })

  it('commence l’escalade prévue depuis le calendrier, ou note celle d’un jour passé', async () => {
    const { user, router } = await renderApp('/calendar', {
      setup: async () => {
        // Escalade le mercredi, depuis le 1er octobre.
        await updateProfile({ climbingDays: [3] })
        await db.profile.update('me', { createdAt: '2026-10-01T08:00:00.000Z' })
      },
    })
    await user.click(await screen.findByRole('button', { name: /^Escalade/ }))
    let sheet = await screen.findByRole('dialog', { name: 'Escalade' })
    expect(within(sheet).queryByRole('button', { name: 'Noter avec les détails' })).not.toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Commencer la séance' }))
    expect(await screen.findByRole('heading', { name: 'Vertical’Art', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toMatch(/^\/climbing\/session\/.+/)
    await user.click(colorButton('Vert'))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Bloc vert' })).getByRole('button', {
        name: 'Ajouter le bloc',
      }),
    )
    expect(await screen.findByRole('heading', { name: 'Blocs notés (1)' })).toBeInTheDocument()
    const live = router.state.location.pathname

    // Dans le calendrier, l'escalade du jour devient la séance en cours.
    await router.navigate('/calendar')
    const row = await screen.findByRole('link', { name: /^EscaladeVertical’Art/ })
    expect(row).toHaveAttribute('href', live)
    expect(row).toHaveTextContent('EscaladeVertical’Art · En cours · 1 bloc notéEn cours')

    // Le mercredi d'avant : ses blocs, notés après coup.
    await user.click(screen.getByRole('button', { name: /^Mercredi 14 octobre/ }))
    await user.click(await screen.findByRole('button', { name: /^Escalade/ }))
    sheet = await screen.findByRole('dialog', { name: 'Escalade' })
    expect(within(sheet).queryByRole('button', { name: 'Commencer la séance' })).not.toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Noter mes blocs après coup' }))
    const past = await screen.findByRole('dialog', { name: 'Séance passée' })
    expect(within(past).getByLabelText('Jour')).toHaveValue('2026-10-14')
    await user.click(within(past).getByRole('button', { name: 'Créer la séance' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/climbing\/history\/.+/)
    })
    // L'écran de la séance (le calendrier peut rester affiché le temps du changement d'écran).
    expect(await screen.findByRole('button', { name: 'Supprimer la séance' })).toBeInTheDocument()
    expect(screen.getByText('Mercredi 14 octobre')).toBeInTheDocument()
    const history = router.state.location.pathname

    // De retour au calendrier, ce mercredi-là est fait.
    await router.navigate('/calendar?jour=2026-10-14')
    const done = await screen.findByRole('link', { name: /^EscaladeVertical’Art/ })
    expect(done).toHaveAttribute('href', history)
    expect(done).toHaveTextContent(/Faite$/)
  })

  it('montre les statistiques par période et par cotation', async () => {
    const { user } = await renderApp('/climbing/stats', {
      setup: async () => {
        await addClimb(
          climbSession('a', '2026-08-29', [
            ['orange', 'flash', 1, ['slab']],
            ['vert', 'sent', 3],
          ]),
        )
        await addClimb(
          climbSession('b', '2026-10-10', [
            ['vert', 'flash', 1, ['overhang']],
            ['bleu', 'sent', 4, ['overhang', 'crimps']],
            ['rouge', 'failed', 5],
          ]),
        )
        await addClimb(climbSession('c', '2026-10-14', [['f6a', 'sent']], { scaleId: 'fontainebleau' }))
      },
    })
    expect(await screen.findByRole('heading', { name: 'Statistiques', level: 1 })).toBeInTheDocument()
    const period = screen.getByRole('radiogroup', { name: 'Période' })
    expect(within(period).getByRole('radio', { name: '3 mois' })).toHaveAttribute('aria-checked', 'true')
    expect(tile('Séances')).toBe('3')
    expect(tile('Blocs réussis')).toBe('5 sur 6')
    expect(tile('Temps grimpé')).toBe('4 h 30')
    expect(tile('Flash')).toBe('40\u00a0%')

    // Les niveaux ne se comparent que dans une même échelle.
    const scales = screen.getByRole('radiogroup', { name: 'Cotation' })
    expect(within(scales).getByRole('radio', { name: 'Vertical’Art' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('list', { name: 'Blocs réussis par séance' })).toHaveTextContent(
      /Samedi 29 août : 2 réussis \(1 bloc orange et 1 bloc vert\).*Samedi 10 octobre : 2 réussis \(1 bloc vert et 1 bloc bleu\)/,
    )
    expect(screen.getByText('Bleu · 6A – 6B')).toBeInTheDocument()
    expect(screen.getByText('1 réussi sur 1 · 4 essais par bloc réussi')).toBeInTheDocument()
    expect(screen.getByText('2 réussis sur 2 · 1 flash · 2 essais par bloc réussi')).toBeInTheDocument()
    expect(screen.getByText('0 réussi sur 1')).toBeInTheDocument()
    expect(screen.getByText('Octobre 2026')).toBeInTheDocument()
    expect(screen.getByText('Août 2026')).toBeInTheDocument()
    expect(screen.getAllByText('1 séance · 2 blocs réussis')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Styles' }).parentElement?.parentElement).toHaveTextContent(
      /^StylesDévers2 réussis sur 2100\s%Dalle1 réussi sur 1100\s%Réglettes1 réussi sur 1100\s%$/,
    )
    expectFrenchSpacing()

    // L'autre cotation, puis une autre période.
    await user.click(within(scales).getByRole('radio', { name: 'Fontainebleau' }))
    expect(await screen.findByText('1 réussi sur 1 · 2 essais par bloc réussi')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Blocs réussis par séance' })).toHaveTextContent(
      /Mercredi 14 octobre : 1 réussi \(1 bloc en 6A\)/,
    )
    await user.click(within(period).getByRole('radio', { name: '30 jours' }))
    expect(tile('Séances')).toBe('2')
    expect(tile('Blocs réussis')).toBe('3 sur 4')
    expect(tile('Temps grimpé')).toBe('3 h 00')
    expect(tile('Flash')).toBe('33\u00a0%')
    expectFrenchSpacing()
  })
})
