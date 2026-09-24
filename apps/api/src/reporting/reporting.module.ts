import { Module, type Provider } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { DbModule } from '../db/db.module'
import { JwtAuthGuard } from '../platform/jwt-auth.guard'
import { MfaRequirementService } from '../platform/mfa-requirement.service'
import { PermissionGuard } from '../platform/permission.guard'
import { DevFixtureDatasetProvider, isDevFixtureEnabled } from './dataset/dev-fixture-dataset.provider'
import { REPORT_DATASET_PROVIDERS, type ReportDatasetProvider } from './dataset/report-dataset.contract'
import { ReportDatasetResolver } from './dataset/report-dataset.resolver'
import { ReportingController } from './reporting.controller'
import { ReportingService } from './reporting.service'
import { ReportRenderService } from './report-render.service'
import { TemplateRegistryService } from './templates/template-registry'
import { scadaApiControllers, scadaApiProviders } from './scada/api/scada-api.providers'
import { TenantScopeModule } from '../tenant-scope/tenant-scope.module'
import { TenantHeaderFormatGuard } from '../platform/guards/tenant-header-format.guard'
import { TenantMembershipGuard } from '../platform/tenant-membership.guard'

// TASK-027.55 — evaluated once, when this module is loaded at boot (same moment `main.ts` has
// already run `dotenv.config()`), never re-checked per-request here. DEC-0012 still holds: outside
// dev-fixture mode this resolves to the exact same empty-array registration as before — the
// `DevFixtureDatasetProvider` class is not even added to `providers` in that case, so Nest's DI
// container never instantiates or registers it (see reporting.module.spec.ts's static + behavioural
// guards for this).
const devFixtureProviders: Provider[] = isDevFixtureEnabled() ? [DevFixtureDatasetProvider] : []
const reportDatasetProvidersProvider: Provider = isDevFixtureEnabled()
  ? {
      provide: REPORT_DATASET_PROVIDERS,
      useFactory: (devFixture: DevFixtureDatasetProvider): ReportDatasetProvider[] => [devFixture],
      inject: [DevFixtureDatasetProvider],
    }
  : { provide: REPORT_DATASET_PROVIDERS, useValue: [] satisfies ReportDatasetProvider[] }

@Module({
  imports: [DbModule, AuditModule, TenantScopeModule],
  controllers: [ReportingController, ...scadaApiControllers()],
  providers: [
    ReportingService,
    ReportRenderService,
    ReportDatasetResolver,
    TemplateRegistryService,
    ...devFixtureProviders,
    reportDatasetProvidersProvider,
    ...scadaApiProviders(),
    JwtAuthGuard,
    TenantHeaderFormatGuard,
    TenantMembershipGuard,
    PermissionGuard,
    MfaRequirementService,
  ],
})
export class ReportingModule {}
