import { Injectable } from '@nestjs/common'
import type { reportArtifacts } from '../../db/schema'
import type { ReportDataset, ReportDatasetProvider, ReportDatasetRow } from './report-dataset.contract'

/**
 * TASK-027.55 — a development-only simulation dataset for the reporting analysis screen. Distinct
 * from the demo provider DEC-0012 removed: never registered by default, never seeds anything to
 * the database, and only exists when BOTH `NODE_ENV=development` AND `REPORTING_DEV_FIXTURES=true`
 * are set (see `isDevFixtureEnabled`). Neither this file nor `reporting.module.ts` ever writes a
 * `report_artifacts` row for it — `DEV_FIXTURE_ARTIFACT` below is an in-memory stand-in that
 * `ReportingService.getArtifact`/`listArtifacts` substitute for a DB lookup, gated by the same
 * env check, so zero database writes happen in any environment.
 */
export const DEV_FIXTURE_ARTIFACT_CODE = 'DEV_REPORTING_FIXTURE'

export function isDevFixtureEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['NODE_ENV'] === 'development' && env['REPORTING_DEV_FIXTURES'] === 'true'
}

export const DEV_FIXTURE_ARTIFACT: typeof reportArtifacts.$inferSelect = {
  id: 'dev-fixture-in-memory',
  code: DEV_FIXTURE_ARTIFACT_CODE,
  title: 'Geliştirme Simülasyon Verisi',
  description: 'Yalnızca development ortamında, tenant başına deterministik üretilen simülasyon verisi — gerçek işletme/SCADA verisi değildir.',
  moduleKey: 'DEV_FIXTURE',
  viewMode: 'TABLE_CHART',
  defaultPreviewFormat: 'HTML',
  primaryOutputFormat: null,
  // TASK-027.56 — no templatePath, so exportReport never resolves a templateId for this artifact;
  // the renderer's own default/generic template handles a null templateId (verified against the
  // already-running dev Jasper container). PDF/XLSX are both supported so the export buttons on
  // the analysis screen have something real to exercise end-to-end in dev.
  supportedOutputFormats: ['PDF', 'XLSX'],
  printStrategy: 'NONE',
  templatePath: null,
  isActive: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

/**
 * TASK-027.56 — a synthetic first row `ReportingService.exportReport` prepends to the dataset
 * before rendering, so the "Geliştirme simülasyon verisi" label is visible in the exported
 * PDF/XLSX bytes themselves, not just on-screen. This works on both the Jasper path and the
 * in-process fallback path without touching the JRXML template or renderer code (out of scope for
 * this task) — the renderer's default template already tabulates whatever rows it receives
 * (verified against the running dev Jasper container: an extra row's `label` text appears in the
 * decompressed PDF content stream). It is never returned by `loadData`/`renderHtml` — only
 * `exportReport` uses it — and only when `isDevFixtureEnabled()` and the code matches.
 */
export function buildDevFixtureExportLabelRow(): ReportDatasetRow {
  return {
    no: '',
    label: 'Geliştirme simülasyon verisi',
    occurredAt: new Date().toISOString(),
    status: 'INFO',
    quantity: 0,
    unitPrice: 0,
    amount: 0,
  }
}

const STATUSES = ['COMPLETED', 'PENDING', 'FAILED'] as const
const LABELS = [
  'Vardiya Kontrolü',
  'Ekipman Bakımı',
  'Kalite Denetimi',
  'Stok Sayımı',
  'Güvenlik Turu',
  'Sensör Kalibrasyonu',
  'Üretim Hattı Kontrolü',
  'Enerji Tüketim Ölçümü',
]
const ROW_COUNT = 60
const DAY_SPAN = 90

function hashSeed(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** mulberry32 — small, fast, deterministic PRNG; not cryptographic, not meant to be. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DevFixtureFilters {
  q?: string
  status?: string
}

@Injectable()
export class DevFixtureDatasetProvider implements ReportDatasetProvider<DevFixtureFilters> {
  supports(artifactCode: string): boolean {
    return artifactCode === DEV_FIXTURE_ARTIFACT_CODE
  }

  async loadDataset(tenantId: string, filters: DevFixtureFilters): Promise<ReportDataset> {
    // Seeded from tenantId alone (never a real row/secret) — same tenant + same filters always
    // produces the same rows; different tenants never see each other's rows.
    const rng = mulberry32(hashSeed(tenantId))
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const todayMs = today.getTime()
    const rows: ReportDatasetRow[] = []

    for (let i = 0; i < ROW_COUNT; i += 1) {
      const daysAgo = Math.floor(rng() * DAY_SPAN)
      const occurredAt = new Date(todayMs - daysAgo * 24 * 60 * 60 * 1000).toISOString()
      const label = LABELS[Math.floor(rng() * LABELS.length)]!
      const status = STATUSES[Math.floor(rng() * STATUSES.length)]!
      const quantity = 1 + Math.floor(rng() * 40)
      const unitPrice = Math.round((10 + rng() * 490) * 100) / 100
      rows.push({
        no: `FIX-${String(i + 1).padStart(4, '0')}`,
        label,
        occurredAt,
        status,
        quantity,
        unitPrice,
        amount: Math.round(quantity * unitPrice * 100) / 100,
      })
    }

    const filtered = rows.filter(row => {
      if (filters.status && row.status !== filters.status) return false
      if (filters.q && !row.label.toLowerCase().includes(filters.q.toLowerCase())) return false
      return true
    })

    return {
      rows: filtered.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()),
      totalAmount: Math.round(filtered.reduce((sum, row) => sum + row.amount, 0) * 100) / 100,
    }
  }
}
