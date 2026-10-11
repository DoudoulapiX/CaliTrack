import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/cn'

import { ToastContext, type ShowToast, type ToastTone } from './toast-context'

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const show = useCallback<ShowToast>((message, tone = 'success') => {
    const id = nextId.current++
    setItems((current) => [...current.slice(-2), { id, message, tone }])
    setTimeout(
      () => {
        setItems((current) => current.filter((t) => t.id !== id))
      },
      tone === 'error' ? 5000 : 2800,
    )
  }, [])

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+8px)] z-[60] flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex max-w-md items-center gap-2 rounded-2xl px-4 py-3 text-[15px] font-medium shadow-lg',
              'bg-surface-3 text-ink',
            )}
          >
            {t.tone === 'success' && <CircleCheck size={18} className="shrink-0 text-success" aria-hidden />}
            {t.tone === 'info' && <Info size={18} className="shrink-0 text-info" aria-hidden />}
            {t.tone === 'error' && <TriangleAlert size={18} className="shrink-0 text-danger" aria-hidden />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
