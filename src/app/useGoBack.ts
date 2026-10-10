import { useLocation, useNavigate } from 'react-router'

/**
 * Revient à l'écran précédent (après un enregistrement), ou à `fallback` quand l'écran a été ouvert
 * directement : l'historique ne garde pas de doublon de la page quittée.
 */
export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate()
  const location = useLocation()
  return () => {
    if (location.key !== 'default') void navigate(-1)
    else void navigate(fallback, { replace: true })
  }
}
