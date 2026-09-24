import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, ApiError } from '../api'

/**
 * TASK-027.48 — the central request() wrapper in lib/api.ts is the single point every API call in
 * the app goes through; it now redirects on the two MFA denial codes so a user is never stuck on a
 * dead page after enforcement kicks in. This is the only place that guarantee can be tested once
 * for the whole app, instead of per-page.
 */
function jsonResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body } as Response
}

describe('lib/api.ts request(): MFA denial redirect', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '', pathname: '/app' },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('redirects to the MFA setup page on 403 MFA_SETUP_REQUIRED', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(403, { error: 'MFA_SETUP_REQUIRED' }))
    await expect(apiGet('/api/v1/platform/users')).rejects.toBeInstanceOf(ApiError)
    expect(window.location.href).toBe('/app/settings/security')
  })

  it('redirects to /login on 403 MFA_SESSION_NOT_VERIFIED', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(403, { error: 'MFA_SESSION_NOT_VERIFIED' }))
    await expect(apiGet('/api/v1/platform/users')).rejects.toBeInstanceOf(ApiError)
    expect(window.location.href).toBe('/login')
  })

  it('does not redirect for an ordinary 403 that is not an MFA denial', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(403, { message: 'İzniniz yok' }))
    await expect(apiGet('/api/v1/platform/users')).rejects.toBeInstanceOf(ApiError)
    expect(window.location.href).toBe('')
  })

  it('does not redirect (avoids a loop) when already on the MFA setup page', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '', pathname: '/app/settings/security' },
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(403, { error: 'MFA_SETUP_REQUIRED' }))
    await expect(apiGet('/api/v1/auth/mfa/status')).rejects.toBeInstanceOf(ApiError)
    expect(window.location.href).toBe('')
  })

  it('does not redirect on a 404 or other non-MFA error status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(404, { message: 'Bulunamadı' }))
    await expect(apiGet('/api/v1/platform/users/x')).rejects.toBeInstanceOf(ApiError)
    expect(window.location.href).toBe('')
  })
})
