import { buildMockDb, chain } from '../../../../db/test-helpers/drizzle-mock'
import { DbScadaPresetAuthorization } from '../scada-preset-authorization'

/** TASK-027.72-R1 — the composed preset-sharing adapter uses the EXISTING role / scope model (no permission code). */
function make(user: { status: string; isSystemAdmin: boolean } | null, assignment: boolean) {
  const db = buildMockDb()
  db.select.mockReturnValueOnce(chain(user ? [user] : [])).mockReturnValueOnce(chain(assignment ? [{ id: 'a-1' }] : []))
  return { db, port: new DbScadaPresetAuthorization(db as never) }
}
const who = { userId: 'u-1', customerRootTenantId: 'root-1' }

describe('DbScadaPresetAuthorization', () => {
  it('an ACTIVE system administrator may share', async () => {
    const { port, db } = make({ status: 'ACTIVE', isSystemAdmin: true }, false)
    expect(await port.canSharePreset(who)).toBe(true)
    expect(db.select).toHaveBeenCalledTimes(1) // no role lookup needed
  })

  it('an ACTIVE TENANT_ADMIN of the preset\'s customer root may share', async () => {
    expect(await make({ status: 'ACTIVE', isSystemAdmin: false }, true).port.canSharePreset(who)).toBe(true)
  })

  it('an ordinary member (no TENANT_ADMIN assignment in that root) may not', async () => {
    expect(await make({ status: 'ACTIVE', isSystemAdmin: false }, false).port.canSharePreset(who)).toBe(false)
  })

  it.each([
    ['an inactive system administrator', { status: 'DISABLED', isSystemAdmin: true }, true],
    ['an inactive TENANT_ADMIN', { status: 'DISABLED', isSystemAdmin: false }, true],
    ['an unknown user', null, true],
  ])('%s may not', async (_n, user, assignment) => {
    expect(await make(user, assignment).port.canSharePreset(who)).toBe(false)
  })

  it('asks the database only about THIS user and THIS customer root (the where clauses are built from the arguments)', async () => {
    const { port, db } = make({ status: 'ACTIVE', isSystemAdmin: false }, true)
    await port.canSharePreset(who)
    expect(db.select).toHaveBeenCalledTimes(2)
  })
})
