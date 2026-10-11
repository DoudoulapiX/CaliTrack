import { resetDb } from '@/test/db'
import { db } from './db'
import {
  deleteEquipmentItem,
  deleteLocation,
  newEquipmentItem,
  newLocation,
  normalizeWeights,
  saveEquipmentItem,
  saveLocation,
  saveLocationWithEquipment,
} from './equipment'
import { ensureSeeded } from './seed'
import { updateSettings } from './settings'

describe('matériel et lieux', () => {
  beforeEach(async () => {
    await resetDb()
    await ensureSeeded()
  })

  it('préremplit un nouvel objet d’après son modèle', () => {
    expect(newEquipmentItem('bands')).toMatchObject({
      name: 'Élastiques',
      bandLevels: ['Léger', 'Moyen', 'Fort', 'Très fort'],
      weightsKg: [],
      locationIds: [],
    })
    expect(newEquipmentItem('dumbbells', ['home'])).toMatchObject({ bandLevels: [], locationIds: ['home'] })
  })

  it('range les charges', () => {
    expect(normalizeWeights([10, 2, 2, 5.005, -1, 0, Number.NaN])).toEqual([2, 5.01, 10])
  })

  it('enregistre un objet nettoyé', async () => {
    const item = newEquipmentItem('dumbbells')
    await saveEquipmentItem({
      ...item,
      name: '  ',
      weightsKg: [12, 2, 12],
      bandLevels: [' ', 'x '],
      note: ' paire ',
      locationIds: ['a', 'a'],
    })
    expect(await db.equipment.get(item.id)).toMatchObject({
      name: 'Haltères',
      weightsKg: [2, 12],
      bandLevels: ['x'],
      note: 'paire',
      locationIds: ['a'],
    })
    await deleteEquipmentItem(item.id)
    expect(await db.equipment.count()).toBe(0)
  })

  it('refuse un lieu sans nom', async () => {
    await expect(saveLocation(newLocation('home', '  '))).rejects.toThrow('Donne un nom')
    const home = newLocation('home', ' Maison ')
    await saveLocation(home)
    expect((await db.locations.get(home.id))?.name).toBe('Maison')
  })

  it('range le matériel coché dans un lieu sans rien rendre disponible partout par erreur', async () => {
    const home = newLocation('home', 'Maison')
    const park = newLocation('park', 'Parc')
    await saveLocation(home)
    await saveLocation(park)
    const bar = newEquipmentItem('pullupBar', [home.id, park.id])
    const dumbbells = newEquipmentItem('dumbbells', [home.id])
    const bands = newEquipmentItem('bands', [park.id])
    const mat = newEquipmentItem('mat')
    for (const item of [bar, dumbbells, bands, mat]) await saveEquipmentItem(item)

    // Maison : on ajoute les élastiques, on décoche la barre, les haltères et le tapis.
    await saveLocationWithEquipment({ ...home, name: ' Chez moi ' }, [bands.id])

    expect((await db.locations.get(home.id))?.name).toBe('Chez moi')
    expect((await db.equipment.get(bands.id))?.locationIds).toEqual([park.id, home.id])
    expect((await db.equipment.get(bar.id))?.locationIds).toEqual([park.id])
    // Seulement à la maison : décoché, il deviendrait disponible partout, donc il reste.
    expect((await db.equipment.get(dumbbells.id))?.locationIds).toEqual([home.id])
    // Disponible partout : inchangé.
    expect((await db.equipment.get(mat.id))?.locationIds).toEqual([])
  })

  it('ajoute le nouveau matériel d’un lieu, une fois par type', async () => {
    const park = newLocation('park', 'Parc')
    await saveLocationWithEquipment(park, [], ['dipBars', 'lowBar', 'dipBars'])
    const items = await db.equipment.toArray()
    expect(items.map((item) => item.kind).sort()).toEqual(['dipBars', 'lowBar'])
    expect(items.every((item) => item.locationIds.join() === park.id)).toBe(true)
    expect(items.find((item) => item.kind === 'dipBars')?.name).toBe('Barres parallèles (dips)')
  })

  it('n’enregistre rien si le lieu n’a pas de nom', async () => {
    const home = newLocation('home', 'Maison')
    await saveLocation(home)
    const bar = newEquipmentItem('pullupBar', [home.id])
    await saveEquipmentItem(bar)
    const gym = newLocation('gym', ' ')
    await expect(saveLocationWithEquipment(gym, [bar.id], ['bench'])).rejects.toThrow('Donne un nom')
    expect(await db.locations.get(gym.id)).toBeUndefined()
    expect((await db.equipment.get(bar.id))?.locationIds).toEqual([home.id])
    expect(await db.equipment.count()).toBe(1)
  })

  it('supprime un lieu et ce qui y renvoie, sans perdre le matériel', async () => {
    const home = newLocation('home', 'Maison')
    const gym = newLocation('gym', 'Salle')
    await saveLocation(home)
    await saveLocation(gym)
    const bar = newEquipmentItem('pullupBar', [home.id, gym.id])
    const bands = newEquipmentItem('bands', [home.id])
    await saveEquipmentItem(bar)
    await saveEquipmentItem(bands)
    await updateSettings({ currentLocationId: home.id })

    await deleteLocation(home.id)

    expect(await db.locations.get(home.id)).toBeUndefined()
    expect((await db.equipment.get(bar.id))?.locationIds).toEqual([gym.id])
    expect((await db.equipment.get(bands.id))?.locationIds).toEqual([])
    expect((await db.settings.get('app'))?.currentLocationId).toBeNull()
  })
})
