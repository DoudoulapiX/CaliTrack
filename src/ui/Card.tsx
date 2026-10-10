import type { HTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl bg-surface p-4', className)} {...rest} />
}

export interface CardTitleProps {
  title: ReactNode
  icon?: ReactNode
  action?: ReactNode
  /** Niveau de titre pour la hiérarchie des titres (2 par défaut). */
  level?: 2 | 3
}

export function CardTitle({ title, icon, action, level = 2 }: CardTitleProps) {
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <div className="mb-3 flex min-h-6 items-center gap-2">
      {icon && <span className="text-accent-text">{icon}</span>}
      <Heading className="flex-1 text-[15px] font-semibold text-ink">{title}</Heading>
      {action}
    </div>
  )
}

/** Lien discret « Voir tout › » pour l'en-tête d'une carte. */
export function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="-my-2 flex items-center gap-0.5 py-2 text-sm font-medium text-accent-text">
      {children}
      <ChevronRight size={16} aria-hidden />
    </Link>
  )
}
