export interface LoginTokenResponse {
  accessToken: string
  user?: { tenants?: Array<{ slug: string }> }
}

export interface MfaChallengeResponse {
  requiresMfa: true
  method: 'TOTP'
  mfaChallengeToken: string
}

export type LoginResult = LoginTokenResponse | MfaChallengeResponse

export type LoginStep = 'mfa-challenge' | 'tenant-select' | 'done'

export function decideLoginStep(res: LoginResult): LoginStep {
  if ('requiresMfa' in res && res.requiresMfa) return 'mfa-challenge'
  const tokenRes = res as LoginTokenResponse
  const tenants = tokenRes.user?.tenants ?? []
  return tenants.length > 1 ? 'tenant-select' : 'done'
}

export function buildMfaChallengePayload(
  useRecoveryCode: boolean,
  input: string,
): { code?: string; recoveryCode?: string } {
  return useRecoveryCode ? { recoveryCode: input } : { code: input }
}

export function sanitizeNumericCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6)
}
