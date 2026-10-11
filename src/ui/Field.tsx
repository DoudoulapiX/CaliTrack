import { useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatNumber, parseNumber } from '@/lib/units'

/** Style commun des champs de saisie. */
export const INPUT_CLASS =
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
          className={INPUT_CLASS}
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
          className={cn(INPUT_CLASS, 'resize-none leading-snug')}
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

/** Champ numérique qui accepte la virgule, garde la saisie en cours et borne la valeur en sortant du champ. */
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

  const round = (parsed: number) => (decimal ? parsed : Math.round(parsed))
  const inRange = (n: number) => (min === undefined || n >= min) && (max === undefined || n <= max)
  const clamp = (n: number) => Math.min(max ?? n, Math.max(min ?? n, n))

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
        className={cn(INPUT_CLASS, 'tabular', suffix && 'pr-12', inputClassName)}
        value={draft}
        onChange={(e) => {
          const text = e.target.value
          setDraft(text)
          if (text.trim() === '') {
            onChange(null)
            return
          }
          const parsed = parseNumber(text)
          // Pendant la frappe, une valeur encore hors bornes (« 19 » pour 1990) attend la suite.
          if (parsed !== null && inRange(round(parsed))) onChange(round(parsed))
        }}
        onBlur={() => {
          const parsed = parseNumber(draft)
          if (parsed === null) {
            // Saisie illisible : on revient à la dernière valeur valable.
            setDraft(display(value))
            return
          }
          const next = clamp(round(parsed))
          // Pas de mise à jour quand le texte ne change pas : React la garderait en attente et elle
          // écraserait une valeur changée ensuite de l'extérieur (champ remis à zéro par un bouton).
          if (display(next) !== draft) setDraft(display(next))
          if (next !== value) onChange(next)
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
            className={cn(INPUT_CLASS, 'appearance-none pr-10')}
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
