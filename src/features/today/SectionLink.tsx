import type { ReactNode } from 'react'
import { Link } from 'react-router'

/** Lien discret à droite du titre d'une carte (« Calendrier », « Tous »). */
export function SectionLink({ to, children, label }: { to: string; children: ReactNode; label?: string }) {
  return (
    <Link to={to} aria-label={label} className="-my-2 py-2 text-[15px] font-medium text-accent-text">
      {children}
    </Link>
  )
}
