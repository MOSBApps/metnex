import { DEV_FIXTURE_ARTIFACT, DEV_FIXTURE_ARTIFACT_CODE, DevFixtureDatasetProvider, isDevFixtureEnabled } from './dev-fixture-dataset.provider'

/**
 * TASK-027.55 — the development-only simulation dataset provider. Purely synthetic and
 * tenant-seeded, same discipline as TASK-027.54's (removed) demo provider, but this one is never
 * registered outside NODE_ENV=development + REPORTING_DEV_FIXTURES=true (see
 * reporting.module.spec.ts / reporting.service.spec.ts for the registration/DB-write guards).
 */
describe('isDevFixtureEnabled', () => {
  it('is true only when NODE_ENV=development AND REPORTING_DEV_FIXTURES=true', () => {
    expect(isDevFixtureEnabled({ NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true' })).toBe(true)
  })

  it('is false when NODE_ENV=production, regardless of the flag', () => {
    expect(isDevFixtureEnabled({ NODE_ENV: 'production', REPORTING_DEV_FIXTURES: 'true' })).toBe(false)
  })

  it('is false when the flag is missing', () => {
    expect(isDevFixtureEnabled({ NODE_ENV: 'development' })).toBe(false)
  })

  it('is false when the flag is explicitly "false"', () => {
    expect(isDevFixtureEnabled({ NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'false' })).toBe(false)
  })

  it('is false for any unknown/other flag value ("1", "TRUE", "yes", ...)', () => {
    expect(isDevFixtureEnabled({ NODE_ENV: 'development', REPORTING_DEV_FIXTURES: '1' })).toBe(false)
    expect(isDevFixtureEnabled({ NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'TRUE' })).toBe(false)
    expect(isDevFixtureEnabled({ NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'yes' })).toBe(false)
  })

  it('is false when NODE_ENV is test or unset', () => {
    expect(isDevFixtureEnabled({ NODE_ENV: 'test', REPORTING_DEV_FIXTURES: 'true' })).toBe(false)
    expect(isDevFixtureEnabled({ REPORTING_DEV_FIXTURES: 'true' })).toBe(false)
  })
})

describe('DEV_FIXTURE_ARTIFACT', () => {
  it('is marked active and carries the fixed dev fixture code', () => {
    expect(DEV_FIXTURE_ARTIFACT.code).toBe(DEV_FIXTURE_ARTIFACT_CODE)
    expect(DEV_FIXTURE_ARTIFACT.isActive).toBe(true)
  })

  it('carries no secret/credential-shaped field', () => {
    expect(JSON.stringify(DEV_FIXTURE_ARTIFACT)).not.toMatch(/secret|token|password|hash|connection/i)
  })
})

describe('DevFixtureDatasetProvider', () => {
  const provider = new DevFixtureDatasetProvider()

  it('supports() matches only its own artifact code', () => {
    expect(provider.supports(DEV_FIXTURE_ARTIFACT_CODE)).toBe(true)
    expect(provider.supports('SOME_OTHER_ARTIFACT')).toBe(false)
  })

  it('is deterministic: the same tenant + same filters always produces byte-identical rows', async () => {
    const first = await provider.loadDataset('tenant-a', {})
    const second = await provider.loadDataset('tenant-a', {})
    expect(first).toEqual(second)
  })

  it('two different tenants never see the same rows (no cross-tenant leakage)', async () => {
    const a = await provider.loadDataset('tenant-a', {})
    const b = await provider.loadDataset('tenant-b', {})
    expect(a.rows).not.toEqual(b.rows)
    const aNos = new Set(a.rows.map(r => r.no))
    for (const row of b.rows) {
      // same `no` sequence exists in both (FIX-0001..) but the actual row content must differ
      expect(aNos.has(row.no)).toBe(true)
    }
    expect(a.rows.map(r => r.label)).not.toEqual(b.rows.map(r => r.label))
  })

  it('every row matches the ReportDatasetRow shape, all required fields present', async () => {
    const { rows } = await provider.loadDataset('tenant-a', {})
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['amount', 'label', 'no', 'occurredAt', 'quantity', 'status', 'unitPrice'])
      expect(['COMPLETED', 'PENDING', 'FAILED']).toContain(row.status)
      expect(row.amount).toBeCloseTo(row.quantity * row.unitPrice, 2)
    }
  })

  it('status filter narrows to an exact match', async () => {
    const { rows } = await provider.loadDataset('tenant-a', { status: 'FAILED' })
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.status).toBe('FAILED')
  })

  it('q filter is a case-insensitive substring match on the label', async () => {
    const { rows } = await provider.loadDataset('tenant-a', { q: 'vardiya' })
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.label.toLowerCase()).toContain('vardiya')
  })

  it('carries no secret/credential-shaped value in any row', async () => {
    const { rows } = await provider.loadDataset('tenant-a', {})
    expect(JSON.stringify(rows)).not.toMatch(/secret|token|password|hash/i)
  })
})
