import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConsoleTopbar } from './console-shell'

/**
 * TASK-027.61 — the topbar brand area renders both the full wordmark and the logomark-only asset
 * at once, swapping which is visible with a CSS breakpoint (`hidden md:inline-flex` /
 * `inline-flex md:hidden`) rather than JS media-query state. jsdom has no real layout engine and
 * never evaluates `@media` queries, so this suite asserts the markup contract instead of the
 * rendered pixels: exactly one wordmark element and one logomark element exist, each carrying the
 * class that hides it below/above the `md` breakpoint — the same technique already used
 * elsewhere in this app (see report-analysis-client's CSV/PNG buttons) and the only one testable
 * without a real browser. Actual breakpoint behavior was checked manually — see the task's
 * delivery note for the browser/E2E verification scope.
 */
function baseProps() {
  return {
    breadcrumb: [{ label: 'Metnex', href: '/app' }],
    tenantSelector: null,
    notifications: null,
    userMenu: null,
    themeToggle: null,
    onMenuToggle: vi.fn(),
  }
}

describe('ConsoleTopbar — brand area (TASK-027.61 / TASK-027.61-R2)', () => {
  it('renders both the full wordmark (wide) and the logomark (narrow) variants at doubled height 48px', () => {
    render(<ConsoleTopbar {...baseProps()} />)
    const logos = screen.getAllByRole('img', { name: 'Metnex' })
    expect(logos).toHaveLength(2)

    const wide = logos.find(img => img.className.includes('md:inline-flex') && img.className.includes('hidden'))
    const narrow = logos.find(img => img.className.includes('md:hidden'))
    expect(wide).toBeDefined()
    expect(narrow).toBeDefined()
    expect(wide!.getAttribute('height')).toBe('48')
    expect(narrow!.getAttribute('height')).toBe('48')
    expect(new URL(wide!.getAttribute('src') ?? '', 'http://localhost').pathname).toBe('/brand/metnex-logo.png')
    expect(new URL(narrow!.getAttribute('src') ?? '', 'http://localhost').pathname).toBe('/brand/metnex-mark.png')
  })

  it('the brand area links to the dashboard route (defaults to /app)', () => {
    render(<ConsoleTopbar {...baseProps()} />)
    const link = screen.getByRole('link', { name: 'Metnex – panele git' })
    expect(link.getAttribute('href')).toBe('/app')
  })

  it('links to /system when the console shell passes a /system brandHref (platform console)', () => {
    render(<ConsoleTopbar {...baseProps()} brandHref="/system" />)
    const link = screen.getByRole('link', { name: 'Metnex – panele git' })
    expect(link.getAttribute('href')).toBe('/system')
  })

  it('never points the brand logos at a remote URL', () => {
    render(<ConsoleTopbar {...baseProps()} />)
    for (const img of screen.getAllByRole('img', { name: 'Metnex' })) {
      const url = new URL(img.getAttribute('src') ?? '', 'http://localhost')
      expect(url.hostname).toBe('localhost')
    }
  })
})
