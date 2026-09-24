import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '../page'

/**
 * TASK-027.48 — the login page's MFA challenge step (requiresMfa response handling) had never
 * been exercised by a test: this covers the normal login path, the MFA challenge branch (TOTP
 * code and recovery code), and that a failed challenge surfaces an error without navigating away.
 */
function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response
}

// TASK-027.61 — the page now renders an <Image> (hero background + logo). next/image's dev-mode
// duplicate-src bookkeeping calls `new URL(src, window.location.href)` on every render, unguarded,
// so `window.location.href` must resolve like a real browser's at all times — a plain string
// stub (the previous `{ ...location, href: '' }`) breaks the instant the app's own
// `window.location.href = '/'` assignment (a relative value) is applied, since `new URL(relSrc, '/')`
// is not a valid base. This tiny stub mirrors real Location href-setter semantics (resolve against
// the current URL) without pulling in a full navigation mock.
function makeLocationStub(initialHref: string) {
  let current = new URL(initialHref)
  return {
    get href() {
      return current.href
    },
    set href(value: string) {
      current = new URL(value, current)
    },
    get origin() {
      return current.origin
    },
  }
}

describe('LoginPage', () => {
  const originalLocation = window.location
  const initialHref = 'http://localhost:3000/login'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: makeLocationStub(initialHref),
    })
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('logs in directly and stores the access token when MFA is not required', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ accessToken: 'tok-123' }))
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText(/E-posta/), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByLabelText(/Şifre/), { target: { value: 'StrongPass1!' } })
    fireEvent.click(screen.getByRole('button', { name: /Giriş Yap/ }))

    await waitFor(() => expect(window.location.href).toBe('http://localhost:3000/'))
    expect(localStorage.getItem('metnex_access_token')).toBe('tok-123')
    expect(screen.queryByText('MFA Doğrulama')).not.toBeInTheDocument()
  })

  it('shows the MFA challenge step when login responds with requiresMfa, without storing a token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ requiresMfa: true, method: 'TOTP', mfaChallengeToken: 'chal-1' }),
    )
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText(/E-posta/), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByLabelText(/Şifre/), { target: { value: 'StrongPass1!' } })
    fireEvent.click(screen.getByRole('button', { name: /Giriş Yap/ }))

    expect(await screen.findByText('MFA Doğrulama')).toBeInTheDocument()
    expect(localStorage.getItem('metnex_access_token')).toBeNull()
    expect(window.location.href).toBe(initialHref)
  })

  it('submits the TOTP code to the challenge endpoint and completes login on success', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ requiresMfa: true, method: 'TOTP', mfaChallengeToken: 'chal-1' }))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'tok-mfa' }))
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText(/E-posta/), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByLabelText(/Şifre/), { target: { value: 'StrongPass1!' } })
    fireEvent.click(screen.getByRole('button', { name: /Giriş Yap/ }))
    await screen.findByText('MFA Doğrulama')

    fireEvent.change(screen.getByLabelText('Doğrulama kodu'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /^Doğrula$/ }))

    await waitFor(() => expect(window.location.href).toBe('http://localhost:3000/'))
    expect(localStorage.getItem('metnex_access_token')).toBe('tok-mfa')
    const challengeCall = vi.mocked(fetch).mock.calls[1]
    expect(challengeCall?.[0]).toContain('/auth/mfa/challenge/verify')
    expect(JSON.parse((challengeCall?.[1] as RequestInit).body as string)).toEqual({
      challengeToken: 'chal-1',
      code: '123456',
    })
  })

  it('switches to recovery-code mode and sends recoveryCode instead of code', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ requiresMfa: true, method: 'TOTP', mfaChallengeToken: 'chal-1' }))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'tok-mfa' }))
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/E-posta/), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByLabelText(/Şifre/), { target: { value: 'StrongPass1!' } })
    fireEvent.click(screen.getByRole('button', { name: /Giriş Yap/ }))
    await screen.findByText('MFA Doğrulama')

    fireEvent.click(screen.getByRole('button', { name: 'Kurtarma kodu kullan' }))
    fireEvent.change(screen.getByLabelText('Kurtarma kodu'), { target: { value: 'ABCD-2345' } })
    fireEvent.click(screen.getByRole('button', { name: /^Doğrula$/ }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    const challengeCall = vi.mocked(fetch).mock.calls[1]
    expect(JSON.parse((challengeCall?.[1] as RequestInit).body as string)).toEqual({
      challengeToken: 'chal-1',
      recoveryCode: 'ABCD-2345',
    })
  })

  it('shows an error and stays on the challenge step when the code is rejected — no token stored, no navigation', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ requiresMfa: true, method: 'TOTP', mfaChallengeToken: 'chal-1' }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Kod doğrulanamadı.' }, false))
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/E-posta/), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByLabelText(/Şifre/), { target: { value: 'StrongPass1!' } })
    fireEvent.click(screen.getByRole('button', { name: /Giriş Yap/ }))
    await screen.findByText('MFA Doğrulama')

    fireEvent.change(screen.getByLabelText('Doğrulama kodu'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: /^Doğrula$/ }))

    expect(await screen.findByText('Kod doğrulanamadı.')).toBeInTheDocument()
    expect(localStorage.getItem('metnex_access_token')).toBeNull()
    expect(window.location.href).toBe(initialHref)
    expect(screen.getByText('MFA Doğrulama')).toBeInTheDocument()
  })

  // TASK-027.61-R3 — Metnex_Firma asset in login form
  it('shows the Metnex_Firma logo asset in the login form at enlarged height (120px) without subtitle', () => {
    render(<LoginPage />)
    const logo = screen.getByRole('img', { name: 'Metnex' }) as HTMLImageElement
    const logoPath = new URL(logo.getAttribute('src') ?? '', window.location.origin).pathname
    expect(logoPath).toBe('/brand/metnex-firma.png')
    expect(logoPath).not.toBe('/brand/metnex-logo.png')
    expect(logo.getAttribute('height')).toBe('120')
    expect(logo.className).toContain('max-w-full')
    expect(logo.className).toContain('object-contain')
    expect(screen.queryByText('Platform foundation starter')).not.toBeInTheDocument()
  })

  it('falls back to a plain text "Metnex" label if the logo image fails to load', () => {
    render(<LoginPage />)
    const logo = screen.getByRole('img', { name: 'Metnex' })
    fireEvent.error(logo)
    expect(screen.queryByRole('img', { name: 'Metnex' })).not.toBeInTheDocument()
    expect(screen.getByText('Metnex')).toBeInTheDocument()
  })

  it('renders the hero background as decorative with full composition object-contain styling', () => {
    const { container } = render(<LoginPage />)
    const heroContainer = container.querySelector('[aria-hidden="true"]')
    const hero = heroContainer?.querySelector('img')
    expect(hero).not.toBeNull()
    expect(hero?.getAttribute('alt')).toBe('')
    expect(hero?.className).toContain('object-contain')
    expect(heroContainer?.className).toContain('bg-[#060814]')
    expect(new URL(hero?.getAttribute('src') ?? '', window.location.origin).pathname).toBe('/brand/metnex-login.png')
  })

  it('never points a logo or background image at a remote URL', () => {
    render(<LoginPage />)
    for (const img of screen.getAllByRole('img', { hidden: true })) {
      const url = new URL(img.getAttribute('src') ?? '', window.location.origin)
      expect(url.origin).toBe(window.location.origin)
    }
  })
})
