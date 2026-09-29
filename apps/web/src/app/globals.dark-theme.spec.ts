import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// TASK-029.13: dark theme combobox/dropdown/checkbox contrast fix.
// Tailwind isn't compiled in jsdom, so these rules are verified as raw CSS text
// rather than computed styles — same approach as other static-content guards in this repo.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'globals.css'), 'utf8')

describe('globals.css — dark theme contrast (TASK-029.13)', () => {
  it('native select popups use dark surface tokens for the option list, not the browser light default', () => {
    expect(css).toMatch(/&\s*select\s*option\s*\{[^}]*background-color:\s*#181e2a/)
    expect(css).toMatch(/&\s*select\s*option\s*\{[^}]*color:\s*#f1f5f9/)
  })

  it('disabled options remain readable (muted, not the default disabled-gray-on-dark)', () => {
    expect(css).toMatch(/&\s*select\s*option:disabled\s*\{[^}]*color:\s*#64748b/)
  })

  it('native selects and text inputs opt into color-scheme: dark so browser chrome (popups, scrollbars) matches the theme', () => {
    expect(css).toMatch(/&\s*select,[\s\S]{0,300}color-scheme:\s*dark/)
  })

  it('checkboxes and radios get an explicit accent-color, so their checked state is never the unthemed OS default', () => {
    expect(css).toMatch(/input\[type=['"]checkbox['"]\][\s\S]{0,80}accent-color:\s*var\(--brand\)/)
  })

  it('checkboxes and radios opt into color-scheme: dark under .dark so their unchecked box uses dark chrome, not a light square', () => {
    expect(css).toMatch(/&\s*input\[type=['"]checkbox['"]\][\s\S]{0,80}color-scheme:\s*dark/)
  })
})
