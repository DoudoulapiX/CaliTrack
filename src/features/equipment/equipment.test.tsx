import { screen, waitFor, within } from '@testing-library/react'
import { db } from '@/db/db'
import { newEquipmentItem, newLocation, saveEquipmentItem, saveLocation } from '@/db/equipment'
import { renderApp } from '@/test/render-app'

describe('matériel et lieux', () => {
  it('ajoute des haltères avec leurs charges', async () => {
    const { user, router } = await renderApp('/more/equipment')
    expect(await screen.findByText('Aucun matériel')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ajouter du matériel' }))
    const sheet = await screen.findByRole('dialog', { name: 'Ajouter du matériel' })
    await user.click(within(sheet).getByRole('button', { name: /^Haltères/ }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/more/equipment/new/dumbbells')
    })

    const weights = await screen.findByRole('group', { name: 'Charges' })
    await user.click(within(weights).getByRole('button', { name: '2 kg' }))
    await user.click(within(weights).getByRole('button', { name: '10 kg' }))
    await user.type(screen.getByLabelText('Autre charge'), '7,5')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(within(weights).getByRole('button', { name: '7,5 kg' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('3 charges enregistrées')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ajouter le matériel' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/more/equipment')
    })
    expect(await screen.findByRole('link', { name: /^Haltères\s*2 kg, 7,5 kg, 10 kg$/ })).toBeInTheDocument()
    expect(await db.equipment.toArray()).toMatchObject([
      { kind: 'dumbbells', name: 'Haltères', weightsKg: [2, 7.5, 10], locationIds: [] },
    ])
  })

  it('range le matériel par lieu sans rien perdre', async () => {
    const { user } = await renderApp('/more/equipment')
    const home = newLocation('home', 'Maison')
    await saveLocation(home)
    const bar = newEquipmentItem('pullupBar', [home.id])
    const dumbbells = newEquipmentItem('dumbbells', [home.id])
    const mat = newEquipmentItem('mat')
    for (const item of [bar, dumbbells, mat]) await saveEquipmentItem(item)

    // Nouveau lieu : le type proposé est le premier pas encore utilisé, le nom suit le type.
    await user.click(await screen.findByRole('button', { name: 'Ajouter un lieu' }))
    let sheet = await screen.findByRole('dialog', { name: 'Nouveau lieu' })
    expect(within(sheet).getByLabelText('Nom')).toHaveValue('Salle de sport')
    const gymKit = within(sheet).getByRole('group', { name: 'Autre matériel sur place' })
    expect(within(gymKit).getByRole('button', { name: 'Barre de musculation' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(within(sheet).getByRole('radio', { name: 'Parc' }))
    expect(within(sheet).getByLabelText('Nom')).toHaveValue('Parc')
    expect(within(sheet).getByText(/Disponible partout.+Tapis/)).toBeInTheDocument()
    // Le matériel du parc qui manque est proposé, déjà coché ; on décoche la barre basse.
    const parkKit = within(sheet).getByRole('group', { name: 'Autre matériel sur place' })
    expect(within(parkKit).queryByRole('button', { name: 'Barre de musculation' })).not.toBeInTheDocument()
    await user.click(within(parkKit).getByRole('button', { name: 'Barre basse' }))
    expect(within(parkKit).getByRole('button', { name: /Barres parallèles/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(within(sheet).getByRole('button', { name: 'Barre de traction' }))
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter le lieu' }))

    expect(await screen.findByRole('button', { name: /^Parc\s*3 objets$/ })).toBeInTheDocument()
    const park = (await db.locations.toArray()).find((l) => l.icon === 'park')
    expect(park?.name).toBe('Parc')
    expect((await db.equipment.get(bar.id))?.locationIds).toEqual([home.id, park?.id])
    const kinds = (await db.equipment.toArray()).map((item) => item.kind).sort()
    expect(kinds).toEqual(['dipBars', 'dumbbells', 'mat', 'pullupBar'])
    expect((await db.equipment.where('kind').equals('dipBars').first())?.locationIds).toEqual([park?.id])

    // Maison : on retire la barre ; les haltères, rangés seulement ici, ne se décochent pas.
    await user.click(screen.getByRole('button', { name: /^Maison\s*3 objets$/ }))
    sheet = await screen.findByRole('dialog', { name: 'Modifier le lieu' })
    expect(within(sheet).getByText(/Rangé seulement ici.+Haltères/)).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Barre de traction' }))
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('button', { name: /^Maison\s*2 objets$/ })).toBeInTheDocument()
    expect((await db.equipment.get(bar.id))?.locationIds).toEqual([park?.id])
    expect((await db.equipment.get(dumbbells.id))?.locationIds).toEqual([home.id])

    // Lieu actuel
    await user.selectOptions(screen.getByLabelText('Je m’entraîne'), 'Parc')
    await waitFor(async () => {
      expect((await db.settings.get('app'))?.currentLocationId).toBe(park?.id)
    })

    // Supprimer le parc : la barre, rangée seulement là, reste dans l'inventaire.
    await user.click(screen.getByRole('button', { name: /^Parc/ }))
    sheet = await screen.findByRole('dialog', { name: 'Modifier le lieu' })
    await user.click(within(sheet).getByRole('button', { name: 'Supprimer ce lieu' }))
    sheet = await screen.findByRole('dialog', { name: /Supprimer.+Parc/ })
    await user.click(within(sheet).getByRole('button', { name: 'Supprimer le lieu' }))
    expect(await screen.findByText('Lieu supprimé')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(await db.locations.count()).toBe(1)
    expect((await db.equipment.get(bar.id))?.locationIds).toEqual([])
    expect((await db.settings.get('app'))?.currentLocationId).toBeNull()
  })

  it('modifie puis supprime un objet', async () => {
    const { user, router } = await renderApp('/more/equipment')
    const bands = newEquipmentItem('bands')
    await saveEquipmentItem(bands)

    await user.click(await screen.findByRole('link', { name: /^Élastiques/ }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/more/equipment/${bands.id}`)
    })
    const save = await screen.findByRole('button', { name: 'Enregistrer' })
    expect(save).toBeDisabled()
    expect(screen.getByLabelText('Niveau 1')).toHaveValue('Léger')
    await user.click(screen.getByRole('button', { name: 'Retirer le niveau 4' }))
    await user.click(screen.getByRole('button', { name: 'Ajouter un niveau' }))
    await user.type(screen.getByLabelText('Niveau 4'), 'Noir')
    await user.clear(screen.getByLabelText('Nom'))
    await user.type(screen.getByLabelText('Nom'), 'Élastiques de traction')
    await user.click(save)

    expect(
      await screen.findByRole('link', { name: /^Élastiques de traction\s*4 niveaux$/ }),
    ).toBeInTheDocument()
    expect(await db.equipment.get(bands.id)).toMatchObject({
      name: 'Élastiques de traction',
      bandLevels: ['Léger', 'Moyen', 'Fort', 'Noir'],
    })

    await user.click(screen.getByRole('link', { name: /^Élastiques de traction/ }))
    await user.click(await screen.findByRole('button', { name: 'Supprimer ce matériel' }))
    const sheet = await screen.findByRole('dialog', { name: /Supprimer ce matériel/ })
    await user.click(within(sheet).getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByText('Aucun matériel')).toBeInTheDocument()
    expect(await db.equipment.count()).toBe(0)
  })

  it('range un nouvel objet dans le lieu actuel', async () => {
    const { user } = await renderApp('/more/equipment')
    const home = newLocation('home', 'Maison')
    const gym = newLocation('gym', 'Salle')
    await saveLocation(home)
    await saveLocation(gym)
    await user.selectOptions(await screen.findByLabelText('Je m’entraîne'), 'Salle')
    await user.click(screen.getByRole('button', { name: 'Ajouter du matériel' }))
    const sheet = await screen.findByRole('dialog', { name: 'Ajouter du matériel' })
    await user.click(within(sheet).getByRole('button', { name: /^Kettlebell/ }))

    const places = await screen.findByRole('group', { name: 'Lieux' })
    expect(within(places).getByRole('button', { name: 'Salle' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(places).getByRole('button', { name: 'Maison' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(within(places).getByRole('button', { name: 'Salle' }))
    expect(screen.getByText(/Aucun lieu coché.+disponible partout/)).toBeInTheDocument()
  })

  it('signale un objet introuvable', async () => {
    await renderApp('/more/equipment/inconnu')
    expect(await screen.findByText('Ce matériel n’existe plus')).toBeInTheDocument()
  })

  it('refuse un type de matériel inconnu', async () => {
    await renderApp('/more/equipment/new/licorne')
    expect(await screen.findByText('Ce matériel n’existe plus')).toBeInTheDocument()
    expect(await db.equipment.count()).toBe(0)
  })
})
