import { SetMetadata } from '@nestjs/common'

export const REQUIRE_MFA_SETUP_COMPLETE_KEY = 'requireMfaSetupComplete'

export const RequireMfaSetupComplete = () => SetMetadata(REQUIRE_MFA_SETUP_COMPLETE_KEY, true)
