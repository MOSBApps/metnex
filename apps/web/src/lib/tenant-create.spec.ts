import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import {
  buildChildTenantPayload,
  describeTenantCreateError,
  eligibleParentTenants,
  NAME_REQUIRED_MESSAGE,
  PARENT_REQUIRED_MESSAGE,
  ROOT_PROVISIONING_REQUIRED_MESSAGE,
  TENANT_CREATE_FALLBACK_MESSAGE,
  TENANT_CREATE_FORBIDDEN_MESSAGE,
  type ParentCandidate,
} from './tenant-create'

const tenant = (overrides: Partial<ParentCandidate>): ParentCandidate => ({ id: 't', name: 'T', slug: 't', type: 'STANDARD', status: 'ACTIVE', ...overrides })
const PARENTS = [
  tenant({ id: 'root-1', name: 'Zeta Müşteri', type: 'ROOT' }),
  tenant({ id: 'std-1', name: 'Alfa Birim', type: 'STANDARD' }),
]

describe('parent candidates', () => {
  it('offers only active ROOT and STANDARD tenants, sorted by name', () => {
    const list = eligibleParentTenants([
      tenant({ id: 'platform', name: 'Platform', type: 'PLATFORM_ROOT' }),
      tenant({ id: 'suspended', name: 'Askıda', status: 'SUSPENDED' }),
      tenant({ id: 'archived', name: 'Arşiv', status: 'ARCHIVED' }),
      ...PARENTS,
    ])
    expect(list.map(item => item.id)).toEqual(['std-1', 'root-1'])
  })

  it('never lists the platform root, so no parent choice can lead to a root creation', () => {
    expect(eligibleParentTenants([tenant({ id: 'platform', type: 'PLATFORM_ROOT' })])).toEqual([])
  })
})

describe('child tenant payload', () => {
  it('sends only parentId, name and (when given) slug — never a type or capability field', () => {
    const built = buildChildTenantPayload({ parentId: 'root-1', name: '  Yeni Birim  ', slug: '  yeni-birim ' }, PARENTS)
    expect(built).toEqual({ ok: true, payload: { parentId: 'root-1', name: 'Yeni Birim', slug: 'yeni-birim' } })
    if (built.ok) {
      expect(Object.keys(built.payload).sort()).toEqual(['name', 'parentId', 'slug'])
      expect(JSON.stringify(built.payload)).not.toMatch(/ROOT|type|canEnterData|canAggregateChildren/)
    }
  })

  it('omits an empty slug', () => {
    const built = buildChildTenantPayload({ parentId: 'std-1', name: 'Birim', slug: '   ' }, PARENTS)
    expect(built).toEqual({ ok: true, payload: { parentId: 'std-1', name: 'Birim' } })
  })

  it.each(['', '   ', 'unknown', 'platform'])('refuses to build a request for the parent %p (a parentless request is what created ownerless roots)', parentId => {
    expect(buildChildTenantPayload({ parentId, name: 'Birim', slug: '' }, PARENTS)).toEqual({ ok: false, error: PARENT_REQUIRED_MESSAGE })
  })

  it('requires a name', () => {
    expect(buildChildTenantPayload({ parentId: 'root-1', name: '  ', slug: '' }, PARENTS)).toEqual({ ok: false, error: NAME_REQUIRED_MESSAGE })
  })

  it('a ROOT-looking form cannot smuggle extra fields through the builder', () => {
    const built = buildChildTenantPayload({ parentId: 'root-1', name: 'Birim', slug: '', type: 'ROOT' } as never, PARENTS)
    expect(built.ok && 'type' in built.payload).toBe(false)
  })
})

describe('error messages', () => {
  it('shows ROOT_PROVISIONING_REQUIRED as a plain, non-technical message', () => {
    const error = new ApiError('Müşteri kök tenant genel tenant oluşturma ile açılamaz; müşteri provizyon akışını kullanın', 400, {
      code: 'ROOT_PROVISIONING_REQUIRED',
      message: 'Müşteri kök tenant genel tenant oluşturma ile açılamaz; müşteri provizyon akışını kullanın',
    })
    const message = describeTenantCreateError(error)
    expect(message).toBe(ROOT_PROVISIONING_REQUIRED_MESSAGE)
    expect(message).not.toMatch(/ROOT_PROVISIONING_REQUIRED|POST|api\/v1|HTTP|400/i)
  })

  it('keeps short backend validation messages for 400/404/409', () => {
    expect(describeTenantCreateError(new ApiError('"acme-birim" slug\'ı zaten kullanımda', 409, {}))).toBe('"acme-birim" slug\'ı zaten kullanımda')
    expect(describeTenantCreateError(new ApiError('Üst kiracı bulunamadı', 404, {}))).toBe('Üst kiracı bulunamadı')
  })

  it('maps 401/403 to a permission message', () => {
    expect(describeTenantCreateError(new ApiError('Forbidden resource', 403, {}))).toBe(TENANT_CREATE_FORBIDDEN_MESSAGE)
  })

  it.each([
    ['a 500 with internal detail', new ApiError('connection to postgresql://user:secret@db failed', 500, { code: 'SCHEMA_PROVISIONING_FAILED' })],
    ['a very long unknown message', new ApiError('x'.repeat(500), 400, {})],
    ['an empty message', new ApiError('', 400, {})],
    ['a network failure', new TypeError('Failed to fetch')],
    ['a plain Error', new Error('UNAUTHORIZED')],
    ['a non-error value', 'boom'],
    ['undefined', undefined],
  ])('falls back to a safe generic message for %s', (_label, error) => {
    const message = describeTenantCreateError(error)
    expect(message).toBe(TENANT_CREATE_FALLBACK_MESSAGE)
    expect(message).not.toMatch(/postgres|secret|connection|Failed to fetch/i)
  })
})

describe('the platform tenants page', () => {
  const webSrc = join(__dirname, '..')
  const page = readFileSync(join(webSrc, 'app', '(platform)', 'system', 'tenants', 'page.tsx'), 'utf8')

  it('builds every create request through the child-only payload builder and its error mapper', () => {
    expect(page).toContain("from '@/lib/tenant-create'")
    expect(page).toContain('buildChildTenantPayload(')
    expect(page).toContain('describeTenantCreateError(err)')
    expect(page).toMatch(/apiPost\('\/api\/v1\/platform\/tenants', built\.payload\)/)
  })

  it('never posts a hand-built body, a type, or capability flags to the tenant API', () => {
    expect(page).not.toMatch(/apiPost\('\/api\/v1\/platform\/tenants',\s*\{/)
    expect(page).not.toMatch(/type:\s*['"]ROOT['"]/)
    expect(page).not.toMatch(/canEnterData|canAggregateChildren/)
  })

  it('requires a parent tenant in the form and no longer promises an automatic ROOT', () => {
    expect(page).toContain('Üst Tenant')
    expect(page).toMatch(/<select[\s\S]{0,200}createParentId[\s\S]{0,300}required/)
    expect(page).not.toMatch(/ROOT tipinde olacak/)
    expect(page).toContain('Yeni Alt Tenant')
  })

  it('keeps the tenant list, filtering, sorting and detail flows', () => {
    for (const marker of ['loadTenants', 'sortTenants', 'statusFilter', 'setSelectedTenant', "/api/v1/platform/tenants${params.size"]) {
      expect(page).toContain(marker)
    }
    expect(page).toContain('/api/v1/platform/tenants/${selectedTenant.id}')
  })

  it('does not link to a customer provisioning screen that does not exist', () => {
    expect(page).not.toMatch(/href=["']\/system\/(provision|customers)/)
  })

  it('keeps the existing style contract: dense inputs/buttons and the rose error banner with dark mode', () => {
    expect(page).toContain('app-input-dense')
    expect(page).toContain('app-button-primary-dense')
    expect(page).toContain('dark:border-rose-900/60')
  })
})
