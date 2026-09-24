import { ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { PERMISSION_KEY, PermissionGuard } from './permission.guard'

/**
 * TASK-027.57 — `PermissionGuard` had no direct unit test file before this task, despite gating
 * nearly every protected endpoint in the platform. This file exercises the actual authorization
 * decision (unchanged by this task) plus the one behavior this task added: a best-effort
 * `REPORT_EXPORT_DENIED` audit write, scoped narrowly to `REQUIRE_PERMISSION('REPORT:ARTIFACT:EXPORT')`
 * denials only — every other permission code's deny path is asserted to NOT audit, proving the
 * scoping is real, not accidental.
 */
function ctx(opts: {
  required?: string
  user?: { id: string; isSystemAdmin: boolean } | null
  headers?: Record<string, string>
  params?: Record<string, string>
}) {
  const request = { user: opts.user, headers: opts.headers ?? {}, params: opts.params ?? {} }
  const handler = () => undefined
  class Controller {}
  if (opts.required) Reflect.defineMetadata(PERMISSION_KEY, opts.required, handler)
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => Controller,
  } as never
}

function harness() {
  const db = buildMockDb()
  const auditService = { log: jest.fn(async () => undefined) }
  const guard = new PermissionGuard(new Reflector(), db as never, auditService as never)
  return { db, auditService, guard }
}

describe('PermissionGuard — baseline authorization (unchanged by TASK-027.57)', () => {
  it('allows the request through with no DB access when no permission is required', async () => {
    const h = harness()
    await expect(h.guard.canActivate(ctx({ user: { id: 'u1', isSystemAdmin: false } }))).resolves.toBe(true)
    expect(h.db.select).not.toHaveBeenCalled()
  })

  it('denies (false, no throw) when no user is attached to the request', async () => {
    const h = harness()
    await expect(h.guard.canActivate(ctx({ required: 'REPORT:ARTIFACT:EXPORT', user: null }))).resolves.toBe(false)
    expect(h.auditService.log).not.toHaveBeenCalled()
  })

  it('a system administrator bypasses every check, including for REPORT:ARTIFACT:EXPORT — no DB read, no audit', async () => {
    const h = harness()
    await expect(
      h.guard.canActivate(ctx({ required: 'REPORT:ARTIFACT:EXPORT', user: { id: 'admin-1', isSystemAdmin: true } })),
    ).resolves.toBe(true)
    expect(h.db.select).not.toHaveBeenCalled()
    expect(h.auditService.log).not.toHaveBeenCalled()
  })

  it('grants a tenant-scoped permission the user actually holds, no audit on the allow path', async () => {
    const h = harness()
    h.db.select
      .mockReturnValueOnce(chain([{ id: 'root-1', type: 'ROOT', customerRootId: null }])) // tenant lookup
      .mockReturnValueOnce(chain([])) // no TENANT_ADMIN short-circuit
      .mockReturnValueOnce(chain([{ permissionCode: 'REPORT:ARTIFACT:EXPORT' }])) // held permission

    await expect(
      h.guard.canActivate(
        ctx({ required: 'REPORT:ARTIFACT:EXPORT', user: { id: 'u1', isSystemAdmin: false }, headers: { 'x-tenant-id': 'root-1' } }),
      ),
    ).resolves.toBe(true)
    expect(h.auditService.log).not.toHaveBeenCalled()
  })

  it('a global TENANT_ADMIN assignment still short-circuits to granted, no audit', async () => {
    const h = harness()
    h.db.select
      .mockReturnValueOnce(chain([{ id: 'root-1', type: 'ROOT', customerRootId: null }]))
      .mockReturnValueOnce(chain([{ id: 'assignment-1' }])) // TENANT_ADMIN assignment found

    await expect(
      h.guard.canActivate(
        ctx({ required: 'REPORT:ARTIFACT:EXPORT', user: { id: 'u1', isSystemAdmin: false }, headers: { 'x-tenant-id': 'root-1' } }),
      ),
    ).resolves.toBe(true)
    expect(h.auditService.log).not.toHaveBeenCalled()
  })
})

describe('PermissionGuard — TASK-027.57 export denial audit (scoped narrowly)', () => {
  it('denying REPORT:ARTIFACT:EXPORT throws AND writes a REPORT_EXPORT_DENIED audit entry', async () => {
    const h = harness()
    h.db.select
      .mockReturnValueOnce(chain([{ id: 'root-1', type: 'ROOT', customerRootId: null }]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([])) // no permission rows — denied

    const error = await h.guard
      .canActivate(
        ctx({
          required: 'REPORT:ARTIFACT:EXPORT',
          user: { id: 'u1', isSystemAdmin: false },
          headers: { 'x-tenant-id': 'root-1' },
          params: { code: 'DEMO_ARTIFACT', format: 'PDF' },
        }),
      )
      .catch(e => e)

    expect(error).toBeInstanceOf(ForbiddenException)
    expect(h.auditService.log).toHaveBeenCalledWith({
      actorId: 'u1',
      actionCode: 'REPORT_EXPORT_DENIED',
      entityType: 'ReportArtifact',
      entityId: 'DEMO_ARTIFACT',
      summary: expect.any(String),
      metadata: {
        tenantId: 'root-1',
        format: 'PDF',
        result: 'DENIED',
        reasonCode: 'PERMISSION_DENIED',
      },
    })
  })

  it('the denial audit is written before the ForbiddenException is thrown (deny is decided first, audited, then thrown — never after provider/render, which never runs at all since the controller method is never reached)', async () => {
    const h = harness()
    h.db.select
      .mockReturnValueOnce(chain([{ id: 'root-1', type: 'ROOT', customerRootId: null }]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))
    const callOrder: string[] = []
    h.auditService.log.mockImplementationOnce(async () => {
      callOrder.push('audit')
    })

    await h.guard
      .canActivate(ctx({ required: 'REPORT:ARTIFACT:EXPORT', user: { id: 'u1', isSystemAdmin: false }, headers: { 'x-tenant-id': 'root-1' } }))
      .catch(() => callOrder.push('thrown'))

    expect(callOrder).toEqual(['audit', 'thrown'])
  })

  it('a denial for any OTHER permission code is never audited — the scoping is real, not incidental', async () => {
    const h = harness()
    h.db.select
      .mockReturnValueOnce(chain([{ id: 'root-1', type: 'ROOT', customerRootId: null }]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))

    const error = await h.guard
      .canActivate(
        ctx({ required: 'CUSTOMER:ADMIN:VIEW', user: { id: 'u1', isSystemAdmin: false }, headers: { 'x-tenant-id': 'root-1' } }),
      )
      .catch(e => e)

    expect(error).toBeInstanceOf(ForbiddenException)
    expect(h.auditService.log).not.toHaveBeenCalled()
  })

  it('falls back to entityId "unknown" when the route has no :code param', async () => {
    const h = harness()
    h.db.select
      .mockReturnValueOnce(chain([{ id: 'root-1', type: 'ROOT', customerRootId: null }]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))

    await h.guard
      .canActivate(ctx({ required: 'REPORT:ARTIFACT:EXPORT', user: { id: 'u1', isSystemAdmin: false }, headers: { 'x-tenant-id': 'root-1' } }))
      .catch(() => undefined)

    expect(h.auditService.log).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'unknown' }))
  })

  it('an audit-write failure never changes the deny outcome — still throws ForbiddenException (fail closed either way)', async () => {
    const h = harness()
    h.db.select
      .mockReturnValueOnce(chain([{ id: 'root-1', type: 'ROOT', customerRootId: null }]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))
    h.auditService.log.mockRejectedValueOnce(new Error('audit db down'))

    const error = await h.guard
      .canActivate(ctx({ required: 'REPORT:ARTIFACT:EXPORT', user: { id: 'u1', isSystemAdmin: false }, headers: { 'x-tenant-id': 'root-1' } }))
      .catch(e => e)

    expect(error).toBeInstanceOf(ForbiddenException) // still denies — audit outage never turns a deny into an allow
  })

  it('the audit metadata never carries a credential/secret-shaped field', async () => {
    const h = harness()
    h.db.select
      .mockReturnValueOnce(chain([{ id: 'root-1', type: 'ROOT', customerRootId: null }]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))

    await h.guard
      .canActivate(
        ctx({
          required: 'REPORT:ARTIFACT:EXPORT',
          user: { id: 'u1', isSystemAdmin: false },
          headers: { 'x-tenant-id': 'root-1' },
          params: { code: 'A1', format: 'PDF' },
        }),
      )
      .catch(() => undefined)

    const entry = (h.auditService.log.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(JSON.stringify(entry)).not.toMatch(/password|token|secret|hash|cookie|postgres:\/\//i)
  })
})
