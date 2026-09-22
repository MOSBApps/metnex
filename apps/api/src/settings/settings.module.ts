import { Module } from '@nestjs/common'
import { PlatformSettingsController } from './platform-settings.controller'
import { PlatformSettingsService } from './platform-settings.service'
import { CredentialCryptoService } from './credential-crypto.service'
import { TenantSettingsService } from './tenant-settings.service'
import { TenantSettingsSmtpController } from './tenant-settings-smtp.controller'
import { TenantSettingsAiController } from './tenant-settings-ai.controller'

@Module({
  providers: [CredentialCryptoService, PlatformSettingsService, TenantSettingsService],
  controllers: [
    PlatformSettingsController,
    TenantSettingsSmtpController,
    TenantSettingsAiController,
  ],
})
export class SettingsModule {}
