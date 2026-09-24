import { createHash } from 'node:crypto'
import { assertTimeZone } from '../catalog/catalog-rules'
import { isDevFixtureEnabled } from '../../dataset/dev-fixture-dataset.provider'
import type { ScadaCsvFixtureProvider } from './scada-csv-fixture.provider'

/**
 * TASK-027.73-R1 — the ONE central contract of the development CSV snapshot artifact. The artifact code, its data origin, the
 * development label, the fixture catalog ids and the fixture time-zone rule live here and nowhere else (the reporting service, the
 * SCADA API and the tests import them). Nothing here is persisted: the artifact is an in-memory descriptor that exists only
 * while `isDevFixtureEnabled(env)` (NODE_ENV=development AND REPORTING_DEV_FIXTURES=true) — never a `report_artifacts` row,
 * never seeded, never created at module init.
 */
export const SCADA_FIXTURE_ARTIFACT_CODE = 'SCADA_HOURLY_ANALYSIS'
export const SCADA_FIXTURE_DATA_ORIGIN = 'DEVELOPMENT_CSV_SNAPSHOT'
export const SCADA_FIXTURE_DEVELOPMENT_LABEL = 'Geliştirme CSV snapshot verisi'
export const SCADA_FIXTURE_ZONE_ENV = 'REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE'

export type ScadaFixtureTimezoneStatus = 'DEVELOPMENT_OVERRIDE' | 'UNVERIFIED'

/** The fixture zone is a development OVERRIDE only (the manifest declares UNVERIFIED); it is never a catalog verification. */
export function fixtureSourceZone(env: NodeJS.ProcessEnv): string | null {
  const zone = env[SCADA_FIXTURE_ZONE_ENV]
  try {
    assertTimeZone(zone)
    return zone as string
  } catch {
    return null
  }
}

export const fixtureTimezoneStatus = (env: NodeJS.ProcessEnv): ScadaFixtureTimezoneStatus => (fixtureSourceZone(env) ? 'DEVELOPMENT_OVERRIDE' : 'UNVERIFIED')

/** Deterministic opaque UUID for a manifest source (the manifest's own `scada-cat-*` ids are not catalog UUIDs). */
export function fixtureCatalogId(sourceKey: string): string {
  const h = createHash('sha256').update(`metnex-dev-scada-fixture:${sourceKey}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

export interface ScadaFixtureArtifact {
  code: string
  name: string
  description: string
  status: 'DEVELOPMENT_ONLY'
  developmentOnly: true
  supportedIntervals: readonly ['HOURLY', 'DAILY']
  supportedFormats: readonly ['CHART', 'TABLE']
  sourceCatalogIds: string[]
  timezoneStatus: ScadaFixtureTimezoneStatus
  dataOrigin: typeof SCADA_FIXTURE_DATA_ORIGIN
}

/** Present ONLY when the development fixture flag is on; `null` in every other environment (the artifact does not exist there). */
export function buildScadaFixtureArtifact(env: NodeJS.ProcessEnv, provider?: Pick<ScadaCsvFixtureProvider, 'loadManifest'>): ScadaFixtureArtifact | null {
  if (!isDevFixtureEnabled(env)) return null
  let sourceCatalogIds: string[] = []
  try {
    sourceCatalogIds = provider ? provider.loadManifest(env).sources.map(s => fixtureCatalogId(s.sourceKey)).sort() : []
  } catch {
    sourceCatalogIds = [] // an unreadable manifest is reported by the catalog endpoint, never leaked here
  }
  return {
    code: SCADA_FIXTURE_ARTIFACT_CODE,
    name: 'SCADA Saatlik/Günlük Analiz (geliştirme CSV snapshot)',
    description: `${SCADA_FIXTURE_DEVELOPMENT_LABEL}: geliştirme ortamındaki gerçek CSV snapshot'ı; üretim verisi ve katalog doğrulaması değildir.`,
    status: 'DEVELOPMENT_ONLY',
    developmentOnly: true,
    supportedIntervals: ['HOURLY', 'DAILY'],
    supportedFormats: ['CHART', 'TABLE'],
    sourceCatalogIds,
    timezoneStatus: fixtureTimezoneStatus(env),
    dataOrigin: SCADA_FIXTURE_DATA_ORIGIN,
  }
}

/** The `report_artifacts`-shaped in-memory row the reporting list / lookup serve for this artifact (never written anywhere). */
export function scadaFixtureArtifactRow(artifact: ScadaFixtureArtifact) {
  return {
    id: 'dev-scada-csv-fixture-in-memory',
    code: artifact.code,
    title: artifact.name,
    description: artifact.description,
    moduleKey: 'DEV_FIXTURE',
    viewMode: 'TABLE_CHART',
    defaultPreviewFormat: 'HTML',
    primaryOutputFormat: null,
    supportedOutputFormats: [] as string[],
    printStrategy: 'NONE',
    templatePath: null,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    developmentOnly: true,
    dataOrigin: artifact.dataOrigin,
    developmentLabel: SCADA_FIXTURE_DEVELOPMENT_LABEL,
    timezoneStatus: artifact.timezoneStatus,
  }
}
