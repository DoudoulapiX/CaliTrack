import { useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatNumber, parseNumber } from '@/lib/units'

const CONTROL =
  'w-full rounded-xl bg-surface-2 px-3.5 py-3 text-[16px] text-ink placeholder:text-ink-3 outline-none ' +
  'focus:ring-2 focus:ring-accent disabled:opacity-50'

export interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode
  className?: string
}

/** Étiquette + aide + message d'erreur autour d'un champ, correctement reliés pour l'accessibilité. */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="px-1 text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children({ id, describedBy })}
      {hint && !error && (
        <p id={hintId} className="px-1 text-[12px] text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="px-1 text-[12px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  hint?: ReactNode
  error?: string | null
}

export function TextField({ label, value, onChange, hint, error, className, ...rest }: TextFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {({ id, describedBy }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={CONTROL}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
          }}
          {...rest}
        />
      )}
    </Field>
  )
}

export interface TextAreaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'value'
> {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  hint?: ReactNode
}

export function TextAreaField({
  label,
  value,
  onChange,
  hint,
  className,
  rows = 3,
  ...rest
}: TextAreaFieldProps) {
  return (
    <Field label={label} hint={hint} className={className}>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          rows={rows}
          className={cn(CONTROL, 'resize-none leading-snug')}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
          }}
          {...rest}
        />
      )}
    </Field>
  )
}

function display(value: number | null): string {
  return value === null ? '' : formatNumber(value, 2).replace(/\s/g, '')
}

export interface NumberInputProps {
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  /** Autorise les décimales (clavier avec virgule). */
  decimal?: boolean
  suffix?: string
  placeholder?: string
  id?: string
  describedBy?: string
  ariaLabel?: string
  className?: string
  inputClassName?: string
  disabled?: boolean
}

/** Champ numérique qui accepte la virgule, garde la saisie en cours et borne la valeur. */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  decimal = false,
  suffix,
  placeholder,
  id,
  describedBy,
  ariaLabel,
  className,
  inputClassName,
  disabled,
}: NumberInputProps) {
  const [draft, setDraft] = useState(display(value))
  const [shown, setShown] = useState(value)
  // La valeur a changé de l'extérieur : on met la saisie à jour.
  if (value !== shown) {
    setShown(value)
    if (parseNumber(draft) !== value) setDraft(display(value))
  }

  const commit = (text: string) => {
    const parsed = parseNumber(text)
    if (parsed === null) {
      onChange(null)
      return
    }
    let next = decimal ? parsed : Math.round(parsed)
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    onChange(next)
  }

  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        autoComplete="off"
        enterKeyHint="done"
        placeholder={placeholder}
        disabled={disabled}
        className={cn(CONTROL, 'tabular', suffix && 'pr-12', inputClassName)}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          const parsed = parseNumber(e.target.value)
          if (e.target.value.trim() === '') onChange(null)
          else if (parsed !== null) commit(e.target.value)
        }}
        onBlur={() => {
          commit(draft)
          setDraft(display(parseNumber(draft) === null ? null : value))
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[15px] text-ink-3">
          {suffix}
        </span>
      )}
    </div>
  )
}

export interface NumberFieldProps extends Omit<NumberInputProps, 'id' | 'describedBy'> {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
}

export function NumberField({ label, hint, error, className, ...rest }: NumberFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {({ id, describedBy }) => <NumberInput id={id} describedBy={describedBy} {...rest} />}
    </Field>
  )
}

export interface SelectFieldProps<T extends string> {
  label: ReactNode
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  hint?: ReactNode
  className?: string
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  className,
}: SelectFieldProps<T>) {
  return (
    <Field label={label} hint={hint} className={className}>
      {({ id, describedBy }) => (
        <div className="relative">
          <select
            id={id}
            aria-describedby={describedBy}
            className={cn(CONTROL, 'appearance-none pr-10')}
            value={value}
            onChange={(e) => {
              const next = options.find((o) => o.value === e.target.value)
              if (next) onChange(next.value)
            }}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={18}
            className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
        </div>
      )}
    </Field>
  )
}
