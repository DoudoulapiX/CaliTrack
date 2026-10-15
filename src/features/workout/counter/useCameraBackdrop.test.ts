import { renderHook } from '@testing-library/react'
import { CAMERA_ATTRIBUTE, useCameraBackdrop } from './useCameraBackdrop'

const root = () => document.documentElement

describe('flou derrière la feuille du compteur', () => {
  afterEach(() => {
    root().removeAttribute(CAMERA_ATTRIBUTE)
  })

  it('marque la page tant que la caméra tourne, et seulement alors', () => {
    const { rerender, unmount } = renderHook(({ active }) => useCameraBackdrop(active), {
      initialProps: { active: false },
    })
    expect(root()).not.toHaveAttribute(CAMERA_ATTRIBUTE)

    rerender({ active: true })
    expect(root()).toHaveAttribute(CAMERA_ATTRIBUTE, '')

    // Caméra coupée (repos, résultat) : le flou revient.
    rerender({ active: false })
    expect(root()).not.toHaveAttribute(CAMERA_ATTRIBUTE)

    rerender({ active: true })
    expect(root()).toHaveAttribute(CAMERA_ATTRIBUTE, '')
    // Feuille fermée caméra allumée : rien ne reste sur la page.
    unmount()
    expect(root()).not.toHaveAttribute(CAMERA_ATTRIBUTE)
  })

  it('s’appelle data-camera, la règle de index.css qui retire le flou', () => {
    expect(CAMERA_ATTRIBUTE).toBe('data-camera')
  })
})
