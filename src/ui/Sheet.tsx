import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /** Hauteur maximale : contenu (par défaut) ou presque plein écran. */
  tall?: boolean
  /** Change quand la feuille passe à un autre écran (liste, puis réglages) : on revient en haut. */
  scrollKey?: string
  /** Échap passe par onClose, qui peut refuser de fermer (sinon la boîte se ferme d'elle-même). */
  guardClose?: boolean
}

/** Feuille qui monte du bas de l'écran (boîte de dialogue native, accessible au clavier et aux lecteurs d'écran). */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  tall = false,
  scrollKey,
  guardClose = false,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      document.documentElement.style.overflow = 'hidden'
    } else if (!open && dialog.open) {
      dialog.close()
    }
    if (!open) document.documentElement.style.overflow = ''
  }, [open])

  useEffect(
    () => () => {
      document.documentElement.style.overflow = ''
    },
    [],
  )

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [scrollKey])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        document.documentElement.style.overflow = ''
        onCloseRef.current()
      }}
      onCancel={
        guardClose
          ? (e) => {
              e.preventDefault()
              onCloseRef.current()
            }
          : undefined
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current()
      }}
      className={cn(
        'mx-auto mt-auto mb-0 w-full max-w-xl overflow-hidden rounded-t-3xl bg-surface p-0 text-ink shadow-2xl',
        'backdrop:backdrop-blur-[2px]',
        tall ? 'h-[92dvh] max-h-[92dvh]' : 'max-h-[88dvh]',
      )}
    >
      {open && (
        <div className={cn('flex max-h-[inherit] flex-col', tall && 'h-full')}>
          <div className="flex items-center gap-2 border-b border-line px-4 py-2">
            <h2 id={titleId} className="min-w-0 flex-1 truncate text-[17px] font-semibold">
              {title}
            </h2>
            <button
              type="button"
              aria-label="Fermer"
              onClick={() => {
                onCloseRef.current()
              }}
              className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink-2 active:bg-surface-3"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {children}
          </div>
          {footer && (
            <div className="border-t border-line px-4 pt-3 pb-[calc(var(--safe-bottom)+12px)]">{footer}</div>
          )}
          {!footer && <div className="pb-[var(--safe-bottom)]" />}
        </div>
      )}
    </dialog>
  )
}

export interface ConfirmSheetProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
}

export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  danger = true,
}: ConfirmSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex flex-col gap-2">
          <Button
            variant={danger ? 'danger' : 'primary'}
            block
            size="lg"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
          <Button variant="secondary" block size="lg" onClick={onClose}>
            Annuler
          </Button>
        </div>
      }
    >
      <div className="text-[15px] text-ink-2">{message}</div>
    </Sheet>
  )
}
