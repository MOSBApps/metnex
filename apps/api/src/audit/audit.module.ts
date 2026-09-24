import { Module } from '@nestjs/common'
import { DbModule } from '../db/db.module'
import { MfaRequirementService } from '../platform/mfa-requirement.service'
import { PlatformAuditController } from './platform-audit.controller'
import { PlatformAuditService } from './platform-audit.service'

@Module({
  imports: [DbModule],
  providers: [PlatformAuditService, MfaRequirementService],
  controllers: [PlatformAuditController],
  exports: [PlatformAuditService],
})
export class AuditModule {}
