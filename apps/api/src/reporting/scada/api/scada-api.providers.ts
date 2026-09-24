import { randomUUID } from 'node:crypto'
import type { Provider } from '@nestjs/common'
import { PlatformAuditService } from '../../../audit/platform-audit.service'
import { DB, type Db } from '../../../db/db.module'
import { TenantScopeService } from '../../../tenant-scope/tenant-scope.service'
import { isDevFixtureEnabled } from '../../dataset/dev-fixture-dataset.provider'
import { ReportingService } from '../../reporting.service'
import { PlatformScadaExportAudit } from '../adapter/platform-scada-export-audit'
import { PlatformScadaQueryAudit } from '../adapter/platform-scada-query-audit'
import { SCADA_EXPORT_AUDIT, SCADA_EXPORT_RENDERER } from '../export/scada-export.contract'
import { ReportRenderService } from '../../report-render.service'
import { ScadaCsvFixtureProvider } from '../fixture/scada-csv-fixture.provider'
import { DevPresetStore } from './dev-preset.store'
import { DevVirtualColumnStore } from './dev-virtual-column.store'
import { ScadaPresetController } from './scada-preset.controller'
import { ScadaAnalysisController } from './scada-analysis.controller'
import { ScadaVirtualColumnController } from './scada-virtual-column.controller'
import { DevFixtureScopeResolver, isDevFixtureScopeBridgeEnabled } from './dev-fixture-scope-resolver'
import { DevCsvFixtureLimits, createDevCsvFixture, type DevCsvScadaFixture } from './dev-csv-scada-fixture'
import { ScadaAnalysisApiService } from './scada-analysis-api.service'
import {
  SCADA_ANALYSIS_QUERY,
  SCADA_API_AUDIT,
  SCADA_API_LIMITS,
  SCADA_DEV_CSV_FIXTURE,
  SCADA_DEV_SCOPE_RESOLVER,
  SCADA_PRESET_AUTHORIZATION,
  SCADA_PRESET_STORE,
  SCADA_ROLLOVER_POLICIES,
  SCADA_SOURCE_CATALOG,
  SCADA_VIRTUAL_COLUMN_STORE,
  type ScadaApiClock,
  type ScadaApiLimitsProvider,
  type ScadaApiPorts,
  type ScadaPresetManagementPort,
  type ScadaVirtualColumnManagementPort,
} from './scada-api.contract'
import { loadScadaApiLimits } from './scada-api.env'
import { DbScadaCallerDirectory } from './scada-caller.directory'
import { DbScadaPresetAuthorization } from './scada-preset-authorization'

const optional = (token: string) => ({ token, optional: true as const })

const runtimeClock: ScadaApiClock = { nowMs: () => Date.now(), correlationId: () => randomUUID() }

const isPresetManager = (v: unknown): v is ScadaPresetManagementPort => !!v && typeof (v as Record<string, unknown>)['append'] === 'function' && typeof (v as Record<string, unknown>)['nextIdentity'] === 'function'

const isManager = (v: unknown): v is ScadaVirtualColumnManagementPort => !!v && typeof (v as Record<string, unknown>)['append'] === 'function' && typeof (v as Record<string, unknown>)['setStatus'] === 'function'

/** Controllers of the SCADA API: the development-only virtual column controller exists ONLY behind the four development gates. */
export function scadaApiControllers(env: NodeJS.ProcessEnv = process.env) {
  return [ScadaAnalysisController, ...(isDevFixtureScopeBridgeEnabled(env) ? [ScadaVirtualColumnController, ScadaPresetController] : [])]
}

/**
 * TASK-027.72-R1 — the COMPOSITION ROOT of the SCADA API, evaluated ONCE when the reporting module is loaded (same moment and
 * same switch as the reporting dataset fixture).
 *
 * Real, always registered: the audit port (`PlatformScadaQueryAudit`), the preset authorization adapter (existing role / scope
 * model, no new permission), the caller directory and the API service itself.
 * Registered ONLY here, ONLY when `isDevFixtureEnabled(env)`: the development CSV fixture (catalog + read adapter under the
 * REAL 027.65 query service) and its development limits. In every other environment the CSV provider is never constructed, no
 * file is read, no default provider is invented and no database is contacted for source data.
 * NOT registered anywhere yet (no production adapter exists — Q-W535 stays open for the real SQL Server provider): the catalog,
 * query, preset store, virtual column store and roll-over policy tokens. A missing token is not an error at boot: the
 * endpoints answer 503 SCADA_SOURCE_NOT_CONFIGURED (roll-over falls back to "no policy", which leaves a counter reset
 * UNRESOLVED — never guessed).
 */
export function scadaApiProviders(env: NodeJS.ProcessEnv = process.env): Provider[] {
  const dev = isDevFixtureEnabled(env)
  // TASK-027.73-R4: the registry-free development scope exists ONLY behind four gates (development, fixture flag, explicit bridge flag, valid zone).
  const bridge = isDevFixtureScopeBridgeEnabled(env)
  const fixtures: Provider[] = dev
    ? [
        {
          provide: SCADA_DEV_CSV_FIXTURE,
          useFactory: (db: Db) => createDevCsvFixture({ provider: new ScadaCsvFixtureProvider(), tenants: { get: id => new DbScadaCallerDirectory(db).tenant(id) }, env }),
          inject: [DB],
        },
        { provide: SCADA_SOURCE_CATALOG, useFactory: (fixture: DevCsvScadaFixture) => fixture.catalog, inject: [SCADA_DEV_CSV_FIXTURE] },
        { provide: SCADA_ANALYSIS_QUERY, useFactory: (fixture: DevCsvScadaFixture, audit: ScadaApiPorts['audit']) => fixture.queryService(audit, runtimeClock), inject: [SCADA_DEV_CSV_FIXTURE, SCADA_API_AUDIT] },
        { provide: SCADA_API_LIMITS, useValue: new DevCsvFixtureLimits() },
      ]
    : [
        // production / test: the limits come from the environment only (missing or invalid ⇒ the endpoints fail closed)
        { provide: SCADA_API_LIMITS, useValue: { get: () => loadScadaApiLimits(env) } satisfies ScadaApiLimitsProvider },
      ]
  return [
    ...fixtures,
    // TASK-027.71-R1: the in-memory development virtual column store exists behind the SAME four gates and nowhere else
    ...(bridge ? [{ provide: SCADA_VIRTUAL_COLUMN_STORE, useValue: new DevVirtualColumnStore() } satisfies Provider] : []),
    // TASK-027.59-R1: the in-memory development preset store exists behind the SAME four gates and nowhere else
    ...(bridge ? [{ provide: SCADA_PRESET_STORE, useValue: new DevPresetStore() } satisfies Provider] : []),
    ...(bridge ? [{ provide: SCADA_DEV_SCOPE_RESOLVER, useFactory: (db: Db) => new DevFixtureScopeResolver(db), inject: [DB] } satisfies Provider] : []),
    { provide: SCADA_API_AUDIT, useFactory: (audit: PlatformAuditService) => new PlatformScadaQueryAudit(audit), inject: [PlatformAuditService] },
    { provide: SCADA_EXPORT_AUDIT, useFactory: (audit: PlatformAuditService) => new PlatformScadaExportAudit(audit), inject: [PlatformAuditService] },
    { provide: SCADA_EXPORT_RENDERER, useExisting: ReportRenderService },
    { provide: SCADA_PRESET_AUTHORIZATION, useFactory: (db: Db) => new DbScadaPresetAuthorization(db), inject: [DB] },
    {
      provide: ScadaAnalysisApiService,
      useFactory: (scopes: TenantScopeService | DevFixtureScopeResolver, reporting: ReportingService, db: Db, audit: ScadaApiPorts['audit'], presetAuthorization: ScadaApiPorts['presetAuthorization'], exportAudit: ScadaApiPorts['exportAudit'], exportRenderer: ScadaApiPorts['exportRenderer'], ...ports: unknown[]) =>
        new ScadaAnalysisApiService({
          scopes,
          callers: new DbScadaCallerDirectory(db),
          artifacts: { assertExists: async (tenantId, code) => void (await reporting.getArtifact(tenantId, code)) },
          clock: runtimeClock,
          audit,
          presetAuthorization,
          exportAudit,
          exportRenderer,
          sources: ports[0] as ScadaApiPorts['sources'],
          query: ports[1] as ScadaApiPorts['query'],
          presets: ports[2] as ScadaApiPorts['presets'],
          presetManager: isPresetManager(ports[2]) ? ports[2] : undefined,
          virtualColumns: ports[3] as ScadaApiPorts['virtualColumns'],
          virtualColumnManager: isManager(ports[3]) ? ports[3] : undefined,
          limits: ports[4] as ScadaApiPorts['limits'],
          rollover: ports[5] as ScadaApiPorts['rollover'],
        }),
      inject: [bridge ? SCADA_DEV_SCOPE_RESOLVER : TenantScopeService, ReportingService, DB, SCADA_API_AUDIT, SCADA_PRESET_AUTHORIZATION, SCADA_EXPORT_AUDIT, SCADA_EXPORT_RENDERER, optional(SCADA_SOURCE_CATALOG), optional(SCADA_ANALYSIS_QUERY), optional(SCADA_PRESET_STORE), optional(SCADA_VIRTUAL_COLUMN_STORE), optional(SCADA_API_LIMITS), optional(SCADA_ROLLOVER_POLICIES)],
    },
  ]
}
