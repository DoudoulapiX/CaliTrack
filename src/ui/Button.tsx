import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { cn } from '@/lib/cn'
import { buttonClass, type ButtonSize, type ButtonVariant } from './button-class'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, block, className)} {...rest}>
      {icon}
      {children}
    </button>
  )
}

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  icon?: ReactNode
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={buttonClass(variant, size, block, typeof className === 'string' ? className : undefined)}
      {...rest}
    >
      {icon}
      {children}
    </Link>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  variant?: 'plain' | 'filled' | 'accent'
  size?: 'sm' | 'md'
}

export function IconButton({
  label,
  variant = 'plain',
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40',
        size === 'md' ? 'size-11' : 'size-9',
        variant === 'plain' && 'text-ink-2 active:bg-surface-2',
        variant === 'filled' && 'bg-surface-2 text-ink active:bg-surface-3',
        variant === 'accent' && 'bg-accent text-accent-ink active:opacity-80',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
