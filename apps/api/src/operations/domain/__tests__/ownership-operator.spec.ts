import {
  resolveEffectiveOwnershipAndOperator,
  validateAssetOwnershipReference,
  validateOperatorReference,
  type AssetOwnershipReference,
  type OperatorReference,
} from '../ownership-operator.contract'

const ownership = (over: Partial<AssetOwnershipReference> = {}): AssetOwnershipReference => ({
  assetReferenceId: 'gt1-turbine',
  ownerExternalSystem: 'BEAM',
  ownerExternalId: 'BEAM-ASSET-001',
  validity: { effectiveFrom: '2020-01-01T00:00:00.000Z', effectiveTo: null },
  ...over,
})
const operator = (over: Partial<OperatorReference> = {}): OperatorReference => ({
  assetReferenceId: 'gt1-turbine',
  operatorTenantId: 't-mosb-enerji',
  operationCenterId: null,
  validity: { effectiveFrom: '2020-01-01T00:00:00.000Z', effectiveTo: null },
  ...over,
})

describe('Varlık sahibi ve işletmeci farklı olabilir', () => {
  it('AssetOwnershipReference and OperatorReference are structurally separate — neither field set implies the other', () => {
    expect(Object.keys(ownership())).not.toContain('operatorTenantId')
    expect(Object.keys(operator())).not.toContain('ownerExternalId')
  })

  it('resolves an owner (BEAM) and a DIFFERENT operator (a Metnex tenant) for the same asset at the same instant', () => {
    const r = resolveEffectiveOwnershipAndOperator([ownership()], [operator()], '2024-06-01T00:00:00.000Z')
    expect(r.owner).toEqual(ownership())
    expect(r.operator).toEqual(operator())
    expect(r.owner!.ownerExternalId).not.toBe(r.operator!.operatorTenantId)
  })

  it('an asset can have an owner with NO operator record yet (gap is reported as null, never invented)', () => {
    const r = resolveEffectiveOwnershipAndOperator([ownership()], [], '2024-06-01T00:00:00.000Z')
    expect(r.owner).not.toBeNull()
    expect(r.operator).toBeNull()
  })
})

describe('Geçmiş sahiplik değişimi korunur', () => {
  it('an operator change over time is resolved to the record whose validity window contains the query instant — the earlier record is never lost or overwritten', () => {
    const before = operator({ operatorTenantId: 't-mosb', validity: { effectiveFrom: '2020-01-01T00:00:00.000Z', effectiveTo: '2023-01-01T00:00:00.000Z' } })
    const after = operator({ operatorTenantId: 't-mosb-enerji', validity: { effectiveFrom: '2023-01-01T00:00:00.000Z', effectiveTo: null } })
    const history = [before, after]
    expect(resolveEffectiveOwnershipAndOperator([], history, '2021-06-01T00:00:00.000Z').operator).toEqual(before)
    expect(resolveEffectiveOwnershipAndOperator([], history, '2024-01-01T00:00:00.000Z').operator).toEqual(after)
    // both records still exist in the array — nothing was deleted to make the change
    expect(history).toHaveLength(2)
  })

  it('an ownership change over time behaves the same way for AssetOwnershipReference', () => {
    const before = ownership({ ownerExternalId: 'BEAM-OLD', validity: { effectiveFrom: '2019-01-01T00:00:00.000Z', effectiveTo: '2022-01-01T00:00:00.000Z' } })
    const after = ownership({ ownerExternalId: 'BEAM-NEW', validity: { effectiveFrom: '2022-01-01T00:00:00.000Z', effectiveTo: null } })
    expect(resolveEffectiveOwnershipAndOperator([before, after], [], '2020-01-01T00:00:00.000Z').owner).toEqual(before)
    expect(resolveEffectiveOwnershipAndOperator([before, after], [], '2023-01-01T00:00:00.000Z').owner).toEqual(after)
  })

  it('an instant before any recorded validity window resolves to null, not the closest record', () => {
    const r = resolveEffectiveOwnershipAndOperator([ownership({ validity: { effectiveFrom: '2022-01-01T00:00:00.000Z', effectiveTo: null } })], [], '2019-01-01T00:00:00.000Z')
    expect(r.owner).toBeNull()
  })
})

describe('Geçersiz veya süresi bitmiş external reference reddedilir', () => {
  it('a malformed validity window (effectiveTo <= effectiveFrom) is refused by validation', () => {
    expect(validateAssetOwnershipReference(ownership({ validity: { effectiveFrom: '2024-01-01T00:00:00.000Z', effectiveTo: '2023-01-01T00:00:00.000Z' } }))).toEqual({ ok: false, code: 'VALIDITY_INVALID' })
  })

  it('an expired ownership record is never selected as effective for a later instant', () => {
    const expired = ownership({ validity: { effectiveFrom: '2020-01-01T00:00:00.000Z', effectiveTo: '2021-01-01T00:00:00.000Z' } })
    expect(resolveEffectiveOwnershipAndOperator([expired], [], '2024-01-01T00:00:00.000Z').owner).toBeNull()
  })

  it('a non-ISO instant never matches anything', () => {
    expect(resolveEffectiveOwnershipAndOperator([ownership()], [], 'not-a-date').owner).toBeNull()
  })
})

describe('Fiziksel DB adı veya secret domain çıktısına girmez', () => {
  it.each(['Server=10.0.0.5;Password=x', 'jdbc:postgresql://internal/db', 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.abc'])('a connection/secret-shaped ownerExternalId %s is refused', bad => {
    expect(validateAssetOwnershipReference(ownership({ ownerExternalId: bad }))).toEqual({ ok: false, code: 'REFERENCE_UNSAFE_VALUE' })
  })

  it('operator/ownership types carry no schema, table, or connection-string-shaped field at all', () => {
    for (const key of [...Object.keys(ownership()), ...Object.keys(operator())]) {
      expect(key).not.toMatch(/schema|table|connection|password|secret/i)
    }
  })
})

describe('validateOperatorReference', () => {
  it('accepts a well-formed operator reference', () => {
    expect(validateOperatorReference(operator())).toEqual({ ok: true })
  })

  it('rejects an empty operatorTenantId', () => {
    expect(validateOperatorReference(operator({ operatorTenantId: '' }))).toEqual({ ok: false, code: 'REFERENCE_INVALID' })
  })
})
