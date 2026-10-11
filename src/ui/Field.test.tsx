import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NumberField } from './Field'

function Harness({
  initial = null,
  min,
  max,
  decimal,
  onValue,
}: {
  initial?: number | null
  min?: number
  max?: number
  decimal?: boolean
  onValue: (value: number | null) => void
}) {
  const [value, setValue] = useState<number | null>(initial)
  return (
    <>
      <NumberField
        label="Valeur"
        value={value}
        min={min}
        max={max}
        decimal={decimal}
        onChange={(next) => {
          setValue(next)
          onValue(next)
        }}
      />
      <button
        type="button"
        onClick={() => {
          setValue(42)
        }}
      >
        Remplacer
      </button>
    </>
  )
}

describe('NumberField', () => {
  it('laisse taper une valeur dont le début est sous le minimum', async () => {
    const user = userEvent.setup()
    const values: (number | null)[] = []
    render(<Harness min={1920} max={2030} onValue={(v) => values.push(v)} />)
    const input = screen.getByRole('textbox', { name: 'Valeur' })
    await user.type(input, '1990')
    expect(input).toHaveValue('1990')
    expect(values.at(-1)).toBe(1990)
    expect(values).not.toContain(1920)
  })

  it('borne la valeur en sortant du champ', async () => {
    const user = userEvent.setup()
    const values: (number | null)[] = []
    render(<Harness min={100} max={250} onValue={(v) => values.push(v)} />)
    const input = screen.getByRole('textbox', { name: 'Valeur' })
    await user.type(input, '12')
    await user.tab()
    expect(input).toHaveValue('100')
    expect(values.at(-1)).toBe(100)
    await user.clear(input)
    await user.type(input, '999')
    await user.tab()
    expect(input).toHaveValue('250')
  })

  it('accepte la virgule et vide la valeur', async () => {
    const user = userEvent.setup()
    const values: (number | null)[] = []
    render(<Harness decimal onValue={(v) => values.push(v)} />)
    const input = screen.getByRole('textbox', { name: 'Valeur' })
    await user.type(input, '72,5')
    expect(values.at(-1)).toBe(72.5)
    await user.clear(input)
    expect(values.at(-1)).toBeNull()
  })

  it('revient à la dernière valeur si la saisie est illisible', async () => {
    const user = userEvent.setup()
    render(<Harness initial={8} onValue={() => undefined} />)
    const input = screen.getByRole('textbox', { name: 'Valeur' })
    await user.type(input, 'x')
    expect(input).toHaveValue('8x')
    await user.tab()
    expect(input).toHaveValue('8')
  })

  it('suit une valeur changée ailleurs', async () => {
    const user = userEvent.setup()
    render(<Harness initial={8} onValue={() => undefined} />)
    await user.click(screen.getByRole('button', { name: 'Remplacer' }))
    expect(screen.getByRole('textbox', { name: 'Valeur' })).toHaveValue('42')
  })

  it('se vide quand la valeur est effacée ailleurs, après la sortie du champ', async () => {
    const user = userEvent.setup()
    // Comme une valeur enregistrée dans la base : elle revient un peu plus tard.
    function Saved() {
      const [value, setValue] = useState<number | null>(null)
      const later = (next: number | null) => {
        setTimeout(() => {
          setValue(next)
        }, 5)
      }
      return (
        <>
          <NumberField label="Valeur" value={value} min={800} max={6000} onChange={later} />
          <button
            type="button"
            onClick={() => {
              later(null)
            }}
          >
            Effacer
          </button>
          <p>Enregistré : {String(value)}</p>
        </>
      )
    }
    render(<Saved />)
    const input = screen.getByRole('textbox', { name: 'Valeur' })
    await user.type(input, '2300')
    expect(await screen.findByText('Enregistré : 2300')).toBeInTheDocument()
    // Le clic fait d'abord sortir du champ, sans rien changer.
    await user.click(screen.getByRole('button', { name: 'Effacer' }))
    expect(await screen.findByText('Enregistré : null')).toBeInTheDocument()
    expect(input).toHaveValue('')
  })
})
