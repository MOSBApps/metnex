import { computeMfaAdvisory } from './mfa-advisory.util'

describe('computeMfaAdvisory', () => {
  it('returns empty when MFA is enabled', () => {
    expect(computeMfaAdvisory({ mfaEnabled: true, tenantMfaRequired: true, isSystemAdmin: true })).toEqual({})
  })

  it('returns mfaSetupRequired when tenant demands MFA and user is not enabled', () => {
    expect(computeMfaAdvisory({ mfaEnabled: false, tenantMfaRequired: true, isSystemAdmin: false })).toEqual({
      mfaSetupRequired: true,
    })
  })

  it('returns mfaSetupRecommended for super admin when tenant policy is false', () => {
    expect(computeMfaAdvisory({ mfaEnabled: false, tenantMfaRequired: false, isSystemAdmin: true })).toEqual({
      mfaSetupRecommended: true,
    })
  })

  it('returns empty when no requirement or recommendation applies', () => {
    expect(computeMfaAdvisory({ mfaEnabled: false, tenantMfaRequired: false, isSystemAdmin: false })).toEqual({})
  })
})
