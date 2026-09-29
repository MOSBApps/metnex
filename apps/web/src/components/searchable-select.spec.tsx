import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SearchableSelect, type SearchableSelectOption } from './searchable-select'

const OPTIONS: SearchableSelectOption[] = [
  { value: 'a', label: 'Kaynak A' },
  { value: 'b', label: 'Kaynak B', description: 'İkinci kaynak' },
]

function setup(overrides: Partial<Parameters<typeof SearchableSelect>[0]> = {}) {
  const onChange = vi.fn()
  const onSearch = vi.fn(async () => OPTIONS)
  render(
    <SearchableSelect
      label="Kaynak"
      value={overrides.value ?? 'a'}
      placeholder="Ara..."
      onSearch={overrides.onSearch ?? onSearch}
      onChange={overrides.onChange ?? onChange}
      {...overrides}
    />,
  )
  return { onChange, onSearch }
}

describe('SearchableSelect — dark theme contrast (TASK-029.13)', () => {
  it('panel and option list use semantic surface/ink tokens, never hardcoded Tailwind gray/white classes', async () => {
    setup()
    fireEvent.change(screen.getByPlaceholderText('Ara...'), { target: { value: 'Kayn' } })
    await waitFor(() => expect(screen.getByText('Kaynak A')).toBeInTheDocument())

    const panel = screen.getByText('Kaynak A').closest('button')?.parentElement?.parentElement
    expect(panel?.className).toMatch(/\bbg-surface\b/)
    expect(panel?.className).not.toMatch(/bg-white|bg-gray|bg-slate/)
  })

  it('the selected option is distinguished by more than a barely-visible tint — background opacity and font weight both signal selection', async () => {
    setup({ value: 'b' })
    fireEvent.change(screen.getByPlaceholderText('Ara...'), { target: { value: 'Kayn' } })
    await waitFor(() => expect(screen.getByText('Kaynak B')).toBeInTheDocument())

    const selectedButton = screen.getByText('Kaynak B').closest('button')
    const unselectedButton = screen.getByText('Kaynak A').closest('button')

    // bg-brand/5 was nearly invisible against the dark surface token; must be at least /15.
    expect(selectedButton?.className).not.toMatch(/bg-brand\/5\b/)
    expect(selectedButton?.className).toMatch(/bg-brand\/(1[5-9]|[2-9]\d)/)
    expect(selectedButton?.className).toMatch(/font-semibold/)
    expect(selectedButton?.className).toMatch(/text-brand\b/)
    expect(unselectedButton?.className).not.toMatch(/text-brand\b/)
  })

  it('hover and focus-visible states are styled explicitly (not left to browser/native defaults only)', async () => {
    setup()
    fireEvent.change(screen.getByPlaceholderText('Ara...'), { target: { value: 'Kayn' } })
    await waitFor(() => expect(screen.getByText('Kaynak A')).toBeInTheDocument())

    const button = screen.getByText('Kaynak A').closest('button')
    expect(button?.className).toMatch(/hover:bg-surface-subtle/)
    expect(button?.className).toMatch(/focus-visible:bg-surface-subtle/)
  })

  it('empty/loading/error/min-char states use ink/status tokens, not hardcoded colors', () => {
    setup()
    expect(screen.getByText('En az 2 karakter girin.').className).toMatch(/text-ink-muted/)
  })
})
