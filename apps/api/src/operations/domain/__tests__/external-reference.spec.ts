import { isSafeExternalReferenceValue, validateExternalSystemReference, type ExternalSystemReference } from '../external-reference.contract'
import { validateFacilityReference, validateMachineReference, type FacilityReference, type MachineReference } from '../facility-machine.contract'

const ref = (over: Partial<ExternalSystemReference> = {}): ExternalSystemReference => ({
  externalSystem: 'BEAM',
  externalId: 'BEAM-GT1-001',
  tenantId: 't-mosb-enerji',
  operationCenterId: null,
  ...over,
})

describe('isSafeExternalReferenceValue', () => {
  it.each(['BEAM-001', 'ERP-CUST-42', 'ext_id.123', 'SAP-GT1'])('accepts a plain opaque id %s', v => {
    expect(isSafeExternalReferenceValue(v)).toBe(true)
  })

  it.each([
    ['a connection string fragment', 'Server=10.0.0.5;Password=x'],
    ['a jdbc uri', 'jdbc:postgresql://internal/db'],
    ['a postgres uri', 'postgres://user:pass@host/db'],
    ['a bearer-shaped jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123'],
    ['a control character', 'abc\u0007def'],
    ['an empty string', ''],
    ['too long', 'x'.repeat(257)],
  ] as const)('rejects %s', (_n, v) => {
    expect(isSafeExternalReferenceValue(v)).toBe(false)
  })

  it('rejects a non-string value', () => {
    expect(isSafeExternalReferenceValue(42)).toBe(false)
  })
})

describe('MOSEDAŞ is a valid external SYSTEM name — never a tenant', () => {
  it('accepts a MOSEDAS external system reference scoped to a real (non-MOSEDAŞ) tenant', () => {
    expect(validateExternalSystemReference(ref({ externalSystem: 'MOSEDAS', externalId: 'ORDER-2026-001' }))).toEqual({ ok: true })
  })

  it('this file contains no code path that creates a tenant record for any external system name', () => {
    const src = require('node:fs').readFileSync(require.resolve('../external-reference.contract'), 'utf8')
    expect(src).not.toMatch(/createTenant|new\s+Tenant\b|INSERT INTO\s+tenants/i)
  })
})

describe('validateExternalSystemReference', () => {
  it('rejects an unknown system name', () => {
    expect(validateExternalSystemReference(ref({ externalSystem: 'UNKNOWN' as never }))).toEqual({ ok: false, code: 'EXTERNAL_REFERENCE_INVALID' })
  })
  it('rejects a missing tenantId', () => {
    expect(validateExternalSystemReference(ref({ tenantId: '' }))).toEqual({ ok: false, code: 'EXTERNAL_REFERENCE_INVALID' })
  })
  it('accepts a null operationCenterId (tenant-wide reference)', () => {
    expect(validateExternalSystemReference(ref({ operationCenterId: null }))).toEqual({ ok: true })
  })
  it('rejects an unsafe externalId', () => {
    expect(validateExternalSystemReference(ref({ externalId: 'Password=hunter2' }))).toEqual({ ok: false, code: 'EXTERNAL_REFERENCE_UNSAFE_VALUE' })
  })
})

describe('FacilityReference / MachineReference — Fiziksel DB adı veya secret domain çıktısına girmez', () => {
  const facility = (over: Partial<FacilityReference> = {}): FacilityReference => ({
    facilityReferenceId: 'fac-1',
    operationCenterId: 'oc-komur-1',
    ownerExternalSystem: 'BEAM',
    ownerExternalId: 'BEAM-FAC-1',
    displayName: 'Kömür Kazanı Tesisi',
    status: 'ACTIVE',
    ...over,
  })
  const machine = (over: Partial<MachineReference> = {}): MachineReference => ({
    machineReferenceId: 'mac-1',
    facilityReferenceId: 'fac-1',
    ownerExternalSystem: 'BEAM',
    ownerExternalId: 'BEAM-MAC-1',
    displayName: 'GT1',
    status: 'ACTIVE',
    ...over,
  })

  it('accepts a well-formed facility and machine reference', () => {
    expect(validateFacilityReference(facility())).toEqual({ ok: true })
    expect(validateMachineReference(machine())).toEqual({ ok: true })
  })

  it('neither type has a field named after a physical DB/schema/table/connection concept', () => {
    for (const key of [...Object.keys(facility()), ...Object.keys(machine())]) {
      expect(key).not.toMatch(/database|schema|table|connection|secret|password/i)
    }
  })

  it('rejects a connection-string-shaped ownerExternalId on a facility', () => {
    expect(validateFacilityReference(facility({ ownerExternalId: 'Data Source=x;User Id=y;Pwd=z' }))).toEqual({ ok: false, code: 'REFERENCE_UNSAFE_VALUE' })
  })

  it('rejects a connection-string-shaped ownerExternalId on a machine', () => {
    expect(validateMachineReference(machine({ ownerExternalId: 'jdbc:mssql://10.0.0.5;databaseName=secret' }))).toEqual({ ok: false, code: 'REFERENCE_UNSAFE_VALUE' })
  })

  it('rejects a machine reference with no operationCenterId-scoped facility link', () => {
    expect(validateMachineReference(machine({ facilityReferenceId: '' }))).toEqual({ ok: false, code: 'REFERENCE_INVALID' })
  })
})
