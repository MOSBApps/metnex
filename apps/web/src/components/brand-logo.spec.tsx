import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandLogo } from './brand-logo'

describe('BrandLogo', () => {
  it('renders the full wordmark asset by default, with the Metnex alt text', () => {
    render(<BrandLogo />)
    const img = screen.getByRole('img', { name: 'Metnex' })
    expect(new URL(img.getAttribute('src') ?? '', 'http://localhost').pathname).toBe('/brand/metnex-logo.png')
  })

  it('renders the logomark-only asset for variant="mark"', () => {
    render(<BrandLogo variant="mark" />)
    const img = screen.getByRole('img', { name: 'Metnex' })
    expect(new URL(img.getAttribute('src') ?? '', 'http://localhost').pathname).toBe('/brand/metnex-mark.png')
  })

  it('renders the Metnex_Firma asset for variant="firma" with calculated aspect ratio width', () => {
    render(<BrandLogo variant="firma" height={80} />)
    const img = screen.getByRole('img', { name: 'Metnex' }) as HTMLImageElement
    expect(new URL(img.getAttribute('src') ?? '', 'http://localhost').pathname).toBe('/brand/metnex-firma.png')
    expect(img.height).toBe(80)
    expect(img.width).toBe(Math.round((1268 / 730) * 80))
  })

  it('derives width from the requested height using the asset\'s own aspect ratio — no layout shift from a guessed size', () => {
    render(<BrandLogo height={40} />)
    const img = screen.getByRole('img', { name: 'Metnex' }) as HTMLImageElement
    expect(img.height).toBe(40)
    expect(img.width).toBe(Math.round((417 / 325) * 40))
  })

  it('falls back to a plain text "Metnex" label if the image fails to load', () => {
    render(<BrandLogo />)
    const img = screen.getByRole('img', { name: 'Metnex' })
    fireEvent.error(img)
    expect(screen.queryByRole('img', { name: 'Metnex' })).not.toBeInTheDocument()
    expect(screen.getByText('Metnex')).toBeInTheDocument()
  })

  it('never uses a remote image URL — src always resolves to a local /brand path, same origin as the page', () => {
    render(<BrandLogo variant="mark" />)
    const img = screen.getByRole('img', { name: 'Metnex' })
    const url = new URL(img.getAttribute('src') ?? '', window.location.origin)
    expect(url.origin).toBe(window.location.origin)
    expect(url.pathname).toBe('/brand/metnex-mark.png')
  })
})
