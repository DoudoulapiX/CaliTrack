import { useEffect } from 'react'

/** Posé sur <html> tant que la caméra du compteur tourne : index.css retire alors tout flou d'arrière-plan. */
export const CAMERA_ATTRIBUTE = 'data-camera'

/**
 * Caméra allumée : plus aucun flou derrière la feuille (fond de la feuille, en-tête, barre d'onglets). Le flou
 * se recalcule à chaque image de la vidéo ; sans lui, le téléphone garde sa puissance pour l'analyse.
 */
export function useCameraBackdrop(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const root = document.documentElement
    root.setAttribute(CAMERA_ATTRIBUTE, '')
    return () => {
      root.removeAttribute(CAMERA_ATTRIBUTE)
    }
  }, [active])
}
