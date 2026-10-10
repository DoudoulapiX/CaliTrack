import { Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  className?: string
}

/** Champ de recherche style iOS : loupe, bouton pour effacer, clavier « Rechercher ». */
export function SearchField({ value, onChange, label, placeholder, className }: SearchFieldProps) {
  return (
    <div className={cn('relative', className)}>
      <Search
        size={18}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3"
        aria-hidden
      />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder ?? label}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        onKeyDown={(e) => {
          // « Rechercher » sur le clavier de l'iPhone : on range le clavier.
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        className="h-10 w-full appearance-none rounded-xl bg-surface-2 pr-10 pl-9 text-[16px] text-ink outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-accent [&::-webkit-search-cancel-button]:hidden"
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="Effacer la recherche"
          onClick={() => {
            onChange('')
          }}
          className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 active:bg-surface-3"
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  )
}
