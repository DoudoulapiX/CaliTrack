import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface PageProps {
  title: string
  /** Petit texte au-dessus du titre (date, contexte). */
  eyebrow?: ReactNode
  /** Affiche un bouton retour (vers `backTo`, sinon la page précédente). */
  back?: boolean
  backTo?: string
  backLabel?: string
  actions?: ReactNode
  children: ReactNode
  /** Grand titre style iOS (par défaut) ou titre compact pour les sous-pages. */
  large?: boolean
  /** Contenu fixé sous l'en-tête (onglets, recherche). */
  toolbar?: ReactNode
  /** Barre d'actions collée en bas de l'écran. */
  footer?: ReactNode
  className?: string
  /** Pas de barre d'onglets sur cet écran : marge basse réduite. */
  noTabBar?: boolean
}

export function Page({
  title,
  eyebrow,
  back = false,
  backTo,
  backLabel = 'Retour',
  actions,
  children,
  large = !back,
  toolbar,
  footer,
  className,
  noTabBar = false,
}: PageProps) {
  const navigate = useNavigate()
  const goBack = () => {
    if (backTo) void navigate(backTo)
    else if (window.history.length > 1) void navigate(-1)
    else void navigate('/')
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 bg-canvas/95 pt-safe backdrop-blur-xl">
        {/* Trois colonnes : le titre reste centré, quelle que soit la largeur des boutons. */}
        <div className="grid min-h-12 grid-cols-[1fr_auto_1fr] items-center gap-1 px-2">
          <div className="flex min-w-0 items-center">
            {back && (
              <button
                type="button"
                onClick={goBack}
                className="flex h-11 items-center gap-0.5 rounded-lg pr-2 text-[17px] text-accent-text active:opacity-60"
              >
                <ChevronLeft size={26} aria-hidden />
                {backLabel}
              </button>
            )}
          </div>
          {large ? (
            <span />
          ) : (
            <h1 className="min-w-0 truncate text-center text-[17px] font-semibold text-ink">{title}</h1>
          )}
          <div className="flex min-w-11 items-center justify-end gap-1">{actions}</div>
        </div>
        {toolbar && <div className="px-4 pb-2">{toolbar}</div>}
      </header>
      <main
        className={cn('flex-1 px-4', footer ? 'pb-28' : noTabBar ? 'pb-safe pb-8' : 'pb-tabbar', className)}
      >
        {large && (
          <div className="mb-4 pt-1">
            {eyebrow && (
              <p className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">{eyebrow}</p>
            )}
            <h1 className="text-[30px] leading-tight font-bold tracking-tight text-ink">{title}</h1>
          </div>
        )}
        {children}
      </main>
      {footer && (
        <div
          className={cn(
            'fixed inset-x-0 z-30 border-t border-line bg-canvas/95 px-4 pt-3 backdrop-blur-xl',
            noTabBar
              ? 'bottom-0 pb-[calc(var(--safe-bottom)+12px)]'
              : 'bottom-[calc(var(--tabbar-height)+var(--safe-bottom))] pb-3',
          )}
        >
          {footer}
        </div>
      )}
    </div>
  )
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('mb-6', className)}>
      {(title ?? action) && (
        <div className="mb-2 flex items-end justify-between gap-2 px-1">
          {title && <h2 className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
