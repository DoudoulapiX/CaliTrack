import { collectBackup } from '@/db/backup'
import { ensureSeeded } from '@/db/seed'
import { resetDb } from '@/test/db'
import { backupFile, deliverFile } from './export'
import { stubProperty } from '@/test/stub'

describe('export de la sauvegarde', () => {
  let file: File

  beforeEach(async () => {
    await resetDb()
    await ensureSeeded()
    file = backupFile({ ...(await collectBackup()), exportedAt: '2026-10-11T21:30:00.000Z' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    Reflect.deleteProperty(navigator, 'canShare')
    Reflect.deleteProperty(navigator, 'share')
    Reflect.deleteProperty(URL, 'createObjectURL')
    Reflect.deleteProperty(URL, 'revokeObjectURL')
  })

  it('nomme le fichier du jour de l’iPhone et y met toutes les données', async () => {
    // 23 h 30 à Paris : encore le 11 octobre.
    expect(file.name).toBe('calitrack-sauvegarde-2026-10-11.json')
    expect(file.type).toBe('application/json')
    expect(JSON.parse(await file.text())).toMatchObject({
      app: 'CaliTrack',
      exportedAt: '2026-10-11T21:30:00.000Z',
    })
  })

  it('passe par la feuille de partage de l’iPhone', async () => {
    const share = vi.fn(() => Promise.resolve())
    stubProperty(navigator, 'canShare', () => true)
    stubProperty(navigator, 'share', share)
    await expect(deliverFile(file)).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ files: [file], title: file.name })
  })

  it('ne fait rien quand le partage est annulé', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
    stubProperty(navigator, 'canShare', () => true)
    stubProperty(navigator, 'share', () => Promise.reject(new DOMException('Annulé', 'AbortError')))
    await expect(deliverFile(file)).resolves.toBe('cancelled')
    expect(click).not.toHaveBeenCalled()
  })

  it('télécharge le fichier quand le partage de fichiers n’existe pas ou est refusé', async () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn(() => 'blob:calitrack')
    const revokeObjectURL = vi.fn()
    stubProperty(URL, 'createObjectURL', createObjectURL)
    stubProperty(URL, 'revokeObjectURL', revokeObjectURL)
    const downloads: { href: string; download: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ href: this.href, download: this.download })
    })

    await expect(deliverFile(file)).resolves.toBe('downloaded')
    stubProperty(navigator, 'canShare', () => true)
    stubProperty(navigator, 'share', () => Promise.reject(new DOMException('Refusé', 'NotAllowedError')))
    await expect(deliverFile(file)).resolves.toBe('downloaded')

    expect(createObjectURL).toHaveBeenCalledWith(file)
    expect(downloads).toEqual([
      { href: 'blob:calitrack', download: 'calitrack-sauvegarde-2026-10-11.json' },
      { href: 'blob:calitrack', download: 'calitrack-sauvegarde-2026-10-11.json' },
    ])
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
  })
})
