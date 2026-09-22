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

describe('LoginPage', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '' },
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

    await waitFor(() => expect(window.location.href).toBe('/'))
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
    expect(window.location.href).toBe('')
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

    await waitFor(() => expect(window.location.href).toBe('/'))
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
    expect(window.location.href).toBe('')
    expect(screen.getByText('MFA Doğrulama')).toBeInTheDocument()
  })
})
