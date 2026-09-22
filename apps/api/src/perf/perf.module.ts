import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { DbModule } from '../db/db.module'
import { PerfAdminController } from './perf-admin.controller'
import { PerfDbDiagnosticsService } from './perf-db-diagnostics.service'
import { PerfRequestLogService } from './perf-request-log.service'
import { PerfSettingsService } from './perf-settings.service'
import { SlowRequestInterceptor } from './slow-request.interceptor'

@Module({
  imports: [DbModule],
  providers: [
    PerfDbDiagnosticsService,
    PerfRequestLogService,
    PerfSettingsService,
    SlowRequestInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: SlowRequestInterceptor,
    },
  ],
  controllers: [PerfAdminController],
  exports: [PerfSettingsService],
})
export class PerfModule {}
