export interface MfaAdvisoryInput {
  mfaEnabled: boolean
  tenantMfaRequired: boolean
  isSystemAdmin: boolean
}

export interface MfaAdvisory {
  mfaSetupRequired?: true
  mfaSetupRecommended?: true
}

export function computeMfaAdvisory(input: MfaAdvisoryInput): MfaAdvisory {
  if (input.mfaEnabled) return {}
  if (input.tenantMfaRequired) return { mfaSetupRequired: true }
  if (input.isSystemAdmin) return { mfaSetupRecommended: true }
  return {}
}
