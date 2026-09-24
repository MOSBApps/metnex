import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { MfaRequirementService } from '../platform/mfa-requirement.service'
import { PlatformSettingsController } from './platform-settings.controller'
import { PlatformSettingsService } from './platform-settings.service'
import { CredentialCryptoService } from './credential-crypto.service'
import { TenantSettingsService } from './tenant-settings.service'
import { TenantSettingsSmtpController } from './tenant-settings-smtp.controller'
import { TenantSettingsAiController } from './tenant-settings-ai.controller'

@Module({
  imports: [AuditModule],
  providers: [CredentialCryptoService, PlatformSettingsService, TenantSettingsService, MfaRequirementService],
  controllers: [
    PlatformSettingsController,
    TenantSettingsSmtpController,
    TenantSettingsAiController,
  ],
})
export class SettingsModule {}
