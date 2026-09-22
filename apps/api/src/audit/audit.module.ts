import { Module } from '@nestjs/common'
import { DbModule } from '../db/db.module'
import { PlatformAuditController } from './platform-audit.controller'
import { PlatformAuditService } from './platform-audit.service'

@Module({
  imports: [DbModule],
  providers: [PlatformAuditService],
  controllers: [PlatformAuditController],
  exports: [PlatformAuditService],
})
export class AuditModule {}
