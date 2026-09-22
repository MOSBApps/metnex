import { Module } from '@nestjs/common'
import { AuditModule } from './audit/audit.module'
import { PerfModule } from './perf/perf.module'
import { DbModule } from './db/db.module'
import { ReportingModule } from './reporting/reporting.module'
import { PlatformModule } from './platform/platform.module'
import { SettingsModule } from './settings/settings.module'
import { HealthController } from './health.controller'

@Module({
  imports: [
    DbModule,
    AuditModule,
    ReportingModule,
    PerfModule,
    PlatformModule,
    SettingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
