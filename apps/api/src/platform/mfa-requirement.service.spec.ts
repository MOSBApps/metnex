import { buildMockDb, chain } from '../db/test-helpers/drizzle-mock'
import { MfaRequirementService } from './mfa-requirement.service'

/**
 * TASK-027.60 — this service had no direct unit coverage before this task. `isActorActive` is the
 * exact function whose result the "Hesap devre dışı" message hinges on (via MfaEnforcementGuard),
 * so its ACTIVE/INACTIVE/LOCKED/not-found distinctions are pinned here directly against the DB
 * mock, independent of the guard-level bug (wrong field read) that this task also fixed.
 */
function harness() {
  const db = buildMockDb()
  const service = new MfaRequirementService(db as never)
  return { db, service }
}

describe('MfaRequirementService.isActorActive', () => {
  it('returns true for a user whose DB status is ACTIVE', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ status: 'ACTIVE' }]))
    await expect(h.service.isActorActive('u1')).resolves.toBe(true)
  })

  it('returns false for a user whose DB status is INACTIVE', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ status: 'INACTIVE' }]))
    await expect(h.service.isActorActive('u1')).resolves.toBe(false)
  })

  it('returns false for a user whose DB status is LOCKED', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([{ status: 'LOCKED' }]))
    await expect(h.service.isActorActive('u1')).resolves.toBe(false)
  })

  it('returns false when no user row matches the id at all (deleted/never existed/stale token)', async () => {
    const h = harness()
    h.db.select.mockReturnValueOnce(chain([]))
    await expect(h.service.isActorActive('missing-user')).resolves.toBe(false)
  })
})
