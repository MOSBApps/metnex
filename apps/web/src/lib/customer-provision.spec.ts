import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import {
  buildProvisionPayload,
  describeProvisionError,
  EMPTY_PROVISION_FORM,
  MIN_ADMIN_PASSWORD_LENGTH,
  PROVISION_ARCHIVED_MESSAGE,
  PROVISION_ENDPOINT,
  PROVISION_FALLBACK_MESSAGE,
  PROVISION_FORBIDDEN_MESSAGE,
  PROVISION_INCOMPLETE_NOTICE,
  PROVISION_NETWORK_MESSAGE,
  PROVISION_SCHEMA_FAILED_MESSAGE,
  PROVISION_SERVER_ERROR_MESSAGE,
  runProvision,
  summarizeProvisionResult,
  validateProvisionForm,
  type ProvisionForm,
  type ProvisionRunDeps,
} from './customer-provision'

const PASSWORD = 'S3cret-Passw0rd-XYZ'
const PACKAGES = [
  { id: 'pkg-1', name: 'Başlangıç', isActive: true },
  { id: 'pkg-old', name: 'Eski', isActive: false },
]
const VALID: ProvisionForm = {
  companyName: '  Acme Lojistik ',
  companySlug: ' acme-lojistik ',
  packageId: 'pkg-1',
  adminDisplayName: ' Ayşe Yılmaz ',
  adminEmail: ' ayse@acme.example ',
  adminPassword: PASSWORD,
  adminPasswordConfirm: PASSWORD,
  notes: ' deneme ',
}
const API_RESPONSE = {
  customerRootTenant: { id: 't-1', name: 'Acme Lojistik', slug: 'acme-lojistik', type: 'ROOT' },
  tenantAdmin: { id: 'u-1', email: 'ayse@acme.example', displayName: 'Ayşe Yılmaz', passwordHash: 'x:y', adminPassword: PASSWORD },
  subscription: { id: 's-1', status: 'ACTIVE', resourcePackage: { id: 'pkg-1', name: 'Başlangıç' } },
}

function deps(overrides: Partial<ProvisionRunDeps> = {}): ProvisionRunDeps {
  return {
    form: VALID,
    packages: PACKAGES,
    inFlight: { current: false },
    post: vi.fn().mockResolvedValue(API_RESPONSE),
    refreshTenants: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('form validation', () => {
  it('accepts a complete form', () => {
    expect(validateProvisionForm(VALID, PACKAGES)).toEqual({})
  })

  it('requires every mandatory field', () => {
    const errors = validateProvisionForm({ ...EMPTY_PROVISION_FORM }, PACKAGES)
    expect(Object.keys(errors).sort()).toEqual(['adminDisplayName', 'adminEmail', 'adminPassword', 'companyName', 'packageId'])
  })

  it('validates slug, e-mail, password length and confirmation', () => {
    expect(validateProvisionForm({ ...VALID, companySlug: 'Bad Slug!' }, PACKAGES).companySlug).toBeTruthy()
    expect(validateProvisionForm({ ...VALID, companySlug: '' }, PACKAGES).companySlug).toBeUndefined()
    expect(validateProvisionForm({ ...VALID, adminEmail: 'not-an-email' }, PACKAGES).adminEmail).toBeTruthy()
    const short = 'x'.repeat(MIN_ADMIN_PASSWORD_LENGTH - 1)
    expect(validateProvisionForm({ ...VALID, adminPassword: short, adminPasswordConfirm: short }, PACKAGES).adminPassword).toBeTruthy()
    expect(validateProvisionForm({ ...VALID, adminPasswordConfirm: PASSWORD + '!' }, PACKAGES).adminPasswordConfirm).toBeTruthy()
  })

  it('applies the backend length limits', () => {
    expect(validateProvisionForm({ ...VALID, companyName: 'A' }, PACKAGES).companyName).toBeTruthy()
    expect(validateProvisionForm({ ...VALID, companyName: 'x'.repeat(101) }, PACKAGES).companyName).toBeTruthy()
    expect(validateProvisionForm({ ...VALID, adminDisplayName: 'x'.repeat(101) }, PACKAGES).adminDisplayName).toBeTruthy()
    expect(validateProvisionForm({ ...VALID, companySlug: 'a'.repeat(64) }, PACKAGES).companySlug).toBeTruthy()
    expect(validateProvisionForm({ ...VALID, notes: 'n'.repeat(1001) }, PACKAGES).notes).toBeTruthy()
  })

  it('accepts only a package from the loaded active list (no hardcoded codes)', () => {
    expect(validateProvisionForm({ ...VALID, packageId: 'pkg-old' }, PACKAGES).packageId).toBeTruthy()
    expect(validateProvisionForm({ ...VALID, packageId: 'made-up' }, PACKAGES).packageId).toBeTruthy()
    expect(validateProvisionForm(VALID, [])).toHaveProperty('packageId')
  })

  it('never puts the password into an error message', () => {
    const errors = validateProvisionForm({ ...VALID, adminPassword: PASSWORD, adminPasswordConfirm: 'other' }, PACKAGES)
    expect(JSON.stringify(errors)).not.toContain(PASSWORD)
  })
})

describe('payload contract', () => {
  it('matches the backend ProvisionCustomerDto exactly, trimmed, with no type or capability fields', () => {
    const payload = buildProvisionPayload(VALID)
    expect(payload).toEqual({
      companyName: 'Acme Lojistik',
      companySlug: 'acme-lojistik',
      packageId: 'pkg-1',
      adminEmail: 'ayse@acme.example',
      adminDisplayName: 'Ayşe Yılmaz',
      adminPassword: PASSWORD,
      notes: 'deneme',
    })
    expect(JSON.stringify(payload)).not.toMatch(/"type"|ROOT|canEnterData|canAggregateChildren|PasswordConfirm/)
  })

  it('omits an empty slug and empty notes instead of inventing a slug', () => {
    const payload = buildProvisionPayload({ ...VALID, companySlug: '  ', notes: '' })
    expect(payload).not.toHaveProperty('companySlug')
    expect(payload).not.toHaveProperty('notes')
  })

  it('posts to the real endpoint', () => {
    expect(PROVISION_ENDPOINT).toBe('/api/v1/platform/saas/customers/provision')
  })
})

describe('runProvision', () => {
  it('posts the DTO to the endpoint and refreshes the tenant list on success', async () => {
    const d = deps()
    const outcome = await runProvision(d)
    expect(d.post).toHaveBeenCalledTimes(1)
    expect(d.post).toHaveBeenCalledWith(PROVISION_ENDPOINT, buildProvisionPayload(VALID))
    expect(d.refreshTenants).toHaveBeenCalledTimes(1)
    expect(outcome.status).toBe('success')
  })

  it('clears the whole form, including the password, after success', async () => {
    const outcome = await runProvision(deps())
    expect(outcome.status === 'success' && outcome.nextForm).toEqual(EMPTY_PROVISION_FORM)
    expect(JSON.stringify(outcome)).not.toContain(PASSWORD)
  })

  it('shows the root tenant, admin, subscription and data area status without any credential', async () => {
    const outcome = await runProvision(deps())
    expect(outcome.status === 'success' && outcome.result).toEqual({
      tenantName: 'Acme Lojistik',
      tenantSlug: 'acme-lojistik',
      tenantType: 'ROOT',
      adminEmail: 'ayse@acme.example',
      adminDisplayName: 'Ayşe Yılmaz',
      packageName: 'Başlangıç',
      subscriptionStatus: 'ACTIVE',
      schemaStatus: 'READY',
    })
    expect(JSON.stringify(summarizeProvisionResult(API_RESPONSE))).not.toMatch(/passwordHash|adminPassword|S3cret/)
  })

  it('refuses a second submit while one is in flight (single request)', async () => {
    let release!: (value: unknown) => void
    const post = vi.fn().mockReturnValue(new Promise(resolve => (release = resolve)))
    const shared = { current: false }
    const first = runProvision(deps({ post, inFlight: shared }))
    const second = await runProvision(deps({ post, inFlight: shared }))
    expect(second).toEqual({ status: 'busy' })
    expect(post).toHaveBeenCalledTimes(1)
    release(API_RESPONSE)
    expect((await first).status).toBe('success')
    expect(shared.current).toBe(false)
  })

  it('releases the guard after a failure so the user can retry', async () => {
    const shared = { current: false }
    const post = vi.fn().mockRejectedValue(new ApiError('Conflict', 409, {}))
    await runProvision(deps({ post, inFlight: shared }))
    expect(shared.current).toBe(false)
  })

  it('does not call the API when validation fails', async () => {
    const d = deps({ form: { ...VALID, adminEmail: 'bad' } })
    const outcome = await runProvision(d)
    expect(outcome.status).toBe('invalid')
    expect(d.post).not.toHaveBeenCalled()
  })

  it('keeps nothing but an error view on failure (inputs stay with the caller) and shows no password', async () => {
    const post = vi.fn().mockRejectedValue(new ApiError('boom', 500, { message: PASSWORD }))
    const outcome = await runProvision(deps({ post }))
    expect(outcome.status).toBe('error')
    expect(JSON.stringify(outcome)).not.toContain(PASSWORD)
    expect(outcome.status === 'error' && 'nextForm' in outcome).toBe(false)
  })

  it('refreshes the list after a possibly-incomplete failure (the root may exist), not after a plain validation error', async () => {
    const incomplete = deps({ post: vi.fn().mockRejectedValue(new ApiError('x', 500, { code: 'SCHEMA_PROVISIONING_FAILED' })) })
    await runProvision(incomplete)
    expect(incomplete.refreshTenants).toHaveBeenCalledTimes(1)
    const plain = deps({ post: vi.fn().mockRejectedValue(new ApiError('Bu e-posta adresi zaten kullanımda', 409, {})) })
    await runProvision(plain)
    expect(plain.refreshTenants).not.toHaveBeenCalled()
  })

  it('a failing list refresh does not turn a completed provisioning into an error', async () => {
    const outcome = await runProvision(deps({ refreshTenants: vi.fn().mockRejectedValue(new Error('list down')) }))
    expect(outcome.status).toBe('success')
  })

  it('writes nothing to storage or the console', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem, getItem: vi.fn() })
    vi.stubGlobal('sessionStorage', { setItem, getItem: vi.fn() })
    await runProvision(deps())
    await runProvision(deps({ post: vi.fn().mockRejectedValue(new ApiError('x', 500, {})) }))
    expect(setItem).not.toHaveBeenCalled()
    for (const spy of [log, error, warn]) expect(spy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('error messages', () => {
  it('SCHEMA_PROVISIONING_FAILED is safe and discloses the possibly-incomplete state (Q-DP17)', () => {
    const view = describeProvisionError(new ApiError('Customer schema provisioning failed', 500, { code: 'SCHEMA_PROVISIONING_FAILED' }))
    expect(view).toEqual({ message: PROVISION_SCHEMA_FAILED_MESSAGE, possiblyIncomplete: true })
    expect(view.message).toContain(PROVISION_INCOMPLETE_NOTICE)
    expect(view.message).not.toMatch(/cust_|postgres|schema provisioning failed/i)
  })

  it('SCHEMA_ARCHIVED and registry conflicts get static friendly messages', () => {
    expect(describeProvisionError(new ApiError('Schema is archived and cannot be provisioned', 409, { code: 'SCHEMA_ARCHIVED' })).message).toBe(PROVISION_ARCHIVED_MESSAGE)
    const conflict = describeProvisionError(new ApiError('Registry status changed during provisioning', 409, { code: 'REGISTRY_STATE_CONFLICT' }))
    expect(conflict.message).not.toMatch(/Registry/)
    expect(conflict.possiblyIncomplete).toBe(true)
  })

  it('shows plain 409 conflicts (e-mail / slug in use) using the backend text', () => {
    const view = describeProvisionError(new ApiError('Bu e-posta adresi zaten kullanımda', 409, {}))
    expect(view).toEqual({ message: 'Bu e-posta adresi zaten kullanımda', possiblyIncomplete: false })
  })

  it('maps 400/404 validation-style errors to their short backend message', () => {
    expect(describeProvisionError(new ApiError('Aktif paket bulunamadı', 404, {})).message).toBe('Aktif paket bulunamadı')
  })

  it('maps 5xx to a safe message that warns the customer may exist, without internal detail', () => {
    const view = describeProvisionError(new ApiError('connection to postgresql://u:pw@db failed', 500, {}))
    expect(view).toEqual({ message: PROVISION_SERVER_ERROR_MESSAGE, possiblyIncomplete: true })
    expect(view.message).not.toMatch(/postgres|pw@/)
  })

  it('maps a network failure to a safe message that warns the request may have completed', () => {
    const view = describeProvisionError(new TypeError('Failed to fetch'))
    expect(view).toEqual({ message: PROVISION_NETWORK_MESSAGE, possiblyIncomplete: true })
    expect(view.message).not.toContain('Failed to fetch')
  })

  it('maps ROOT_PROVISIONING_REQUIRED without technical terms', () => {
    const view = describeProvisionError(new ApiError('x', 400, { code: 'ROOT_PROVISIONING_REQUIRED' }))
    expect(view.message).not.toMatch(/ROOT_PROVISIONING_REQUIRED|HTTP|400/)
  })

  it('unauthorised users get the permission message (the backend decides; no permission logic client-side)', () => {
    expect(describeProvisionError(new ApiError('Forbidden resource', 403, {})).message).toBe(PROVISION_FORBIDDEN_MESSAGE)
    expect(describeProvisionError(new ApiError('Unauthorized', 401, {})).message).toBe(PROVISION_FORBIDDEN_MESSAGE)
  })

  it.each([
    ['overlong message', new ApiError('x'.repeat(500), 400, {})],
    ['empty message', new ApiError('', 409, {})],
    ['plain Error', new Error('UNAUTHORIZED')],
    ['non-error', 'boom'],
  ])('falls back safely for %s', (_label, error) => {
    expect(describeProvisionError(error).message).toBe(PROVISION_FALLBACK_MESSAGE)
  })
})

describe('sources', () => {
  const webSrc = join(__dirname, '..')
  const modal = readFileSync(join(webSrc, 'components', 'customer-provision-modal.tsx'), 'utf8')
  const lib = readFileSync(join(webSrc, 'lib', 'customer-provision.ts'), 'utf8')
  const page = readFileSync(join(webSrc, 'app', '(platform)', 'system', 'tenants', 'page.tsx'), 'utf8')

  it('never touches persistent storage, the URL, analytics or the console', () => {
    for (const source of [modal, lib]) {
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|console\.|window\.location|history\.|router\.|URLSearchParams|analytics|track\(/)
    }
  })

  it('renders password inputs as password fields with new-password autocomplete, and never echoes the password', () => {
    expect(modal.match(/type="password"/g)).toHaveLength(2)
    expect(modal).toContain('autoComplete="new-password"')
    expect(modal).not.toMatch(/\{form\.adminPassword\}\s*<|>\s*\{form\.adminPassword/)
  })

  it('has every DTO field, a package select fed from props, and disables submit while running', () => {
    for (const id of ['provision-company-name', 'provision-company-slug', 'provision-package', 'provision-admin-name', 'provision-admin-email', 'provision-admin-password', 'provision-notes']) {
      expect(modal).toContain(id)
    }
    expect(modal).toMatch(/activePackages\.map/)
    expect(modal).toMatch(/disabled=\{submitting\}/)
    expect(modal).toContain('inFlight')
  })

  it('does not hand-build a tenant type, hardcode packages or generate a slug', () => {
    for (const source of [modal, lib]) {
      expect(source).not.toMatch(/type:\s*['"]ROOT['"]|canEnterData|canAggregateChildren/)
      expect(source).not.toMatch(/slugify|toLowerCase\(\)\.replace/)
    }
  })

  it('states the Q-DP17 risk in the form itself and clears credentials when the dialog closes', () => {
    expect(modal).toContain('PROVISION_INCOMPLETE_NOTICE')
    expect(modal).toMatch(/function close\(\)[\s\S]{0,300}setForm\(\{ \.\.\.EMPTY_PROVISION_FORM \}\)/)
  })

  it('is wired into the tenants page with a list refresh, keeping the child form and list intact', () => {
    expect(page).toContain('<CustomerProvisionModal')
    expect(page).toMatch(/onProvisioned=\{loadTenants\}/)
    expect(page).toContain('Müşteri Provision Et')
    expect(page).toContain('Yeni Alt Tenant')
    expect(page).toContain('buildChildTenantPayload(')
  })

  it('keeps the Metnex style contract', () => {
    expect(modal).toContain('app-input-dense')
    expect(modal).toContain('app-button-primary-dense')
    expect(modal).toContain('dark:border-rose-900/60')
  })
})
