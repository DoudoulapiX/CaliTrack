import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink active:opacity-80',
  secondary: 'bg-surface-2 text-ink active:bg-surface-3',
  soft: 'bg-accent-soft text-accent-text active:opacity-80',
  ghost: 'bg-transparent text-accent-text active:bg-surface-2',
  danger: 'bg-transparent text-danger ring-1 ring-inset ring-danger/40 active:bg-danger/10',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-13 px-5 text-base gap-2 rounded-2xl',
}

export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  block = false,
  extra?: string,
): string {
  return cn(
    'inline-flex shrink-0 items-center justify-center font-semibold transition-[opacity,background-color] select-none',
    'disabled:pointer-events-none disabled:opacity-40',
    VARIANT[variant],
    SIZE[size],
    block && 'w-full',
    extra,
  )
}
