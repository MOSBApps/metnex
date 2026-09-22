import { Module } from '@nestjs/common'
import { DbModule } from '../db/db.module'
import { JwtAuthGuard } from '../platform/jwt-auth.guard'
import { PermissionGuard } from '../platform/permission.guard'
import { REPORT_DATASET_PROVIDERS, type ReportDatasetProvider } from './dataset/report-dataset.contract'
import { ReportDatasetResolver } from './dataset/report-dataset.resolver'
import { ReportingController } from './reporting.controller'
import { ReportingService } from './reporting.service'
import { ReportRenderService } from './report-render.service'
import { TemplateRegistryService } from './templates/template-registry'

/**
 * No dataset provider is registered by default — reporting core has no
 * built-in dataset (the former demo compatibility provider was removed).
 * A future domain module registers its own provider here by overriding this
 * token with its own factory/array.
 */
const DEFAULT_DATASET_PROVIDERS: ReportDatasetProvider[] = []

@Module({
  imports: [DbModule],
  controllers: [ReportingController],
  providers: [
    ReportingService,
    ReportRenderService,
    ReportDatasetResolver,
    TemplateRegistryService,
    { provide: REPORT_DATASET_PROVIDERS, useValue: DEFAULT_DATASET_PROVIDERS },
    JwtAuthGuard,
    PermissionGuard,
  ],
})
export class ReportingModule {}
