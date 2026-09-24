import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BadGatewayException, BadRequestException } from '@nestjs/common'
import type { ScadaQueryAuditEntry } from '../../adapter/scada-readonly.port'
import type { TenantRecord } from '../../catalog/tenant-guards'
import { ScadaCsvFixtureProvider } from '../../fixture/scada-csv-fixture.provider'
import { SCADA_FIXTURE_DEVELOPMENT_LABEL } from '../../fixture/scada-fixture-artifact'
import type { ScadaExportAuditEntry, ScadaExportResult } from '../../export/scada-export.contract'
import { DEV_FIXTURE_API_LIMITS, DEV_FIXTURE_ZONE_ENV, createDevCsvFixture, fixtureCatalogId } from '../dev-csv-scada-fixture'
import { SCADA_FIXTURE_SCOPE_BRIDGE_ENV } from '../dev-fixture-scope-resolver'
import { DevVirtualColumnStore } from '../dev-virtual-column.store'
import { ScadaApiError } from '../scada-api.contract'
import { ScadaAnalysisApiService } from '../scada-analysis-api.service'

/** TASK-027.74 — SCADA analysis export over a temp CSV fixture (synthetic; no real data, no database, no Jasper service). */
const ZONE = 'Europe/Istanbul'
const ALL_ON = { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true', [SCADA_FIXTURE_SCOPE_BRIDGE_ENV]: 'true', [DEV_FIXTURE_ZONE_ENV]: ZONE } as NodeJS.ProcessEnv
const SECRET = '424242'
const CAT = fixtureCatalogId('s')
const rootOf = (t: string) => (t.startsWith('a') ? 'root-A' : 'root-B')
const tenantOf = (t: string): TenantRecord => ({ id: t, type: 'STANDARD', status: 'ACTIVE', slug: `slug-${t}` })

const dirs: string[] = []
afterAll(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })))

const HEADER = 'ID;KAYIT_TARIHI;KAYIT_SAATI;A_COUNTER;C_INDEX;D_REAL;B_OTHER'
const csv = (n = 10, opts: { missingA?: number } = {}) =>
  [HEADER, ...Array.from({ length: n }, (_, i) => `${i + 1};1.02.2026;${String(i).padStart(2, '0')}:00:00;${i === opts.missingA ? '' : 100 + 5 * i};${300 + 2 * i};${20 + (i % 3)};${i}`)].join('\n')
const col = (name: string, valueType: 'INDEX' | 'REAL_VALUE' | null, verified = true, extra: Record<string, unknown> = {}) => ({ sourceColumn: name, label: name, verified, valueType, evidenceRefs: ['TEST:evidence'], ...extra })

function provider(text: string) {
  const root = mkdtempSync(path.join(tmpdir(), 'metnex-exp-'))
  dirs.push(root)
  mkdirSync(path.join(root, 'veriler/manifest'), { recursive: true })
  mkdirSync(path.join(root, 'veriler/raw'), { recursive: true })
  writeFileSync(path.join(root, 'veriler/raw/s.csv'), text)
  const columns = [col('A_COUNTER', 'INDEX', true, { label: 'Sayaç A' }), col('C_INDEX', 'INDEX', true, { label: 'Endeks C', unit: 'kWh' }), col('D_REAL', 'REAL_VALUE', true, { unit: 'C', dailyOperation: 'AVERAGE' }), col('B_OTHER', null, false)]
  const entry = { catalogId: 'scada-cat-s', sourceKey: 's', logicalSourceName: 'Kaynak s', file: 'veriler/raw/s.csv', table: 'phys_s', idColumn: 'ID', dateColumn: 'KAYIT_TARIHI', timeColumn: 'KAYIT_SAATI', timezone: 'UNVERIFIED', status: 'DEVELOPMENT_FIXTURE', mappingStatus: 'UNVERIFIED', sha256: createHash('sha256').update(text, 'utf8').digest('hex'), rowCount: 0, columnCount: 7, developmentOnly: true, columns }
  writeFileSync(path.join(root, 'veriler/manifest/scada-fixtures.manifest.json'), JSON.stringify({ version: '1', generatedAt: 'x', description: 't', developmentOnly: true, sources: [entry] }))
  return new ScadaCsvFixtureProvider(root)
}

interface Renderer {
  configured: boolean
  calls: Array<{ artifactCode: string; templateId: string | null; format: string; rows: Array<Record<string, string>> }>
  fail?: unknown
}

function harness(over: { text?: string; renderer?: Renderer | null; exportAudit?: 'none' | 'fail' | 'ok'; queryThrows?: unknown } = {}) {
  const audits: ScadaQueryAuditEntry[] = []
  const exportAudits: ScadaExportAuditEntry[] = []
  const audit = { record: async (e: ScadaQueryAuditEntry) => void audits.push(e) }
  const store = new DevVirtualColumnStore()
  let offset = 0
  let flipped = false
  let n = 0
  const clock = { nowMs: () => Date.parse('2026-06-01T00:00:00.000Z') + offset, correlationId: () => `srv-${++n}` }
  const fixture = createDevCsvFixture({ provider: provider(over.text ?? csv()), tenants: { get: async id => tenantOf(id) }, env: ALL_ON })
  const renderer = over.renderer === undefined ? null : over.renderer
  const svc = new ScadaAnalysisApiService({
    scopes: { resolve: async t => { if (t.startsWith('x')) throw new Error('registry unavailable'); return { tenantId: t, customerRootTenantId: flipped ? 'root-Z' : rootOf(t), dataScopeTenantIds: [t] } } },
    callers: { describe: async (_u, t) => ({ tenant: tenantOf(t), userActive: true }) },
    artifacts: { assertExists: async () => undefined },
    clock,
    audit,
    presetAuthorization: { canSharePreset: ({ userId }) => userId.endsWith('-admin') },
    sources: fixture.catalog,
    query: over.queryThrows ? { runMany: async () => { throw over.queryThrows } } : fixture.queryService(audit, clock),
    virtualColumns: store,
    virtualColumnManager: store,
    limits: { get: () => DEV_FIXTURE_API_LIMITS },
    ...(over.exportAudit === 'none' ? {} : { exportAudit: { record: async (e: ScadaExportAuditEntry) => { if (over.exportAudit === 'fail') throw new Error('Server=10.0.0.5;Password=hunter2'); exportAudits.push(e) } } }),
    ...(renderer ? { exportRenderer: { isConfigured: () => renderer.configured, render: async (i: { rows: unknown[] }) => { renderer.calls.push(JSON.parse(JSON.stringify(i))); if (renderer.fail) throw renderer.fail; return { buffer: Buffer.from('%PDF-jasper'), contentType: 'application/pdf', fileName: 'x.pdf' } } } } : {}),
  })
  return { svc, store, audits, exportAudits, tick: (ms: number) => void (offset += ms), flipRoot: () => void (flipped = true) }
}

const call = (user: string, tenant: string, format: unknown, body?: unknown) => ({ actor: { id: user }, tenantId: tenant, routeCode: 'SCADA_HOURLY_ANALYSIS', body, param: format })
const analysisBody = (over: Record<string, unknown> = {}) => ({ sourceCatalogIds: [CAT], seriesKeys: ['A_COUNTER', 'C_INDEX'], startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T02:00:00.000Z', bucketInterval: 'HOURLY', timezone: ZONE, ...over })
const periodBody = () => ({ mode: 'PERIOD', sourceCatalogIds: [CAT], seriesKeys: ['C_INDEX'], baseline: { startAt: '2026-01-31T21:00:00.000Z', endAt: '2026-02-01T00:00:00.000Z' }, comparison: { startAt: '2026-02-01T00:00:00.000Z', endAt: '2026-02-01T03:00:00.000Z' }, bucketInterval: 'HOURLY', timezone: ZONE })
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: ScadaApiError) => e.code)
const file = (r: ScadaExportResult) => {
  if (r.kind !== 'FILE') throw new Error('not a file')
  return r
}

/** Minimal reader of the STORED zip the workbook writer produces. */
function unzip(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>()
  let off = 0
  while (buf.readUInt32LE(off) === 0x04034b50) {
    const size = buf.readUInt32LE(off + 18)
    const nameLen = buf.readUInt16LE(off + 26)
    const extra = buf.readUInt16LE(off + 28)
    const name = buf.subarray(off + 30, off + 30 + nameLen).toString('utf8')
    out.set(name, buf.subarray(off + 30 + nameLen + extra, off + 30 + nameLen + extra + size).toString('utf8'))
    off += 30 + nameLen + extra + size
  }
  return out
}
const sheetNames = (z: Map<string, string>) => [...(z.get('xl/workbook.xml') ?? '').matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1])
const cellsOf = (z: Map<string, string>, n: number) => [...(z.get(`xl/worksheets/sheet${n}.xml`) ?? '').matchAll(/<c r="([A-Z]+\d+)"( t="inlineStr")?>(?:<is><t[^>]*>([^<]*)<\/t><\/is>|<v>([^<]*)<\/v>)<\/c>/g)].map(m => ({ ref: m[1]!, text: m[2] ? m[3]! : null, num: m[2] ? null : Number(m[4]) }))
const csvLines = (r: ScadaExportResult) => file(r).buffer.toString('utf8').replace(/^﻿/, '').split('\r\n')

describe('CSV export of an analysis', () => {
  it('is RFC 4180 UTF-8 with BOM and CRLF, has the quality columns and a development label, and returns nothing but static file facts', async () => {
    const h = harness()
    const r = file(await h.svc.runExport(call('a-user', 'a-t1', 'CSV', { analysis: analysisBody() })))
    expect(r.contentType).toBe('text/csv; charset=utf-8')
    expect(r.fileName).toMatch(/^scada_SCADA_HOURLY_ANALYSIS_2026-06-01\.csv$/)
    expect(r.buffer.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    const lines = csvLines(r)
    expect(lines[0]).toBe('Zaman (UTC),Yerel zaman,Seri,Kaynak,Değer,Birim,Değer tipi,Kalite,Kalite bayrakları,Tam,Analiz izni,Sanal kolon,Sanal kolon sürümü,Aralık başlangıç (UTC),Aralık bitiş (UTC),Kovalama,Zaman dilimi,Kalite filtresi,Sonuç durumu,Veri etiketi')
    expect(lines[lines.length - 1]).toBe('')
    const data = lines.slice(1, -1)
    expect(data.length).toBeGreaterThan(0)
    for (const line of data) {
      expect(line).toContain(SCADA_FIXTURE_DEVELOPMENT_LABEL)
      expect(line).toMatch(/,HOURLY,Europe\/Istanbul,Tümü,/)
    }
    expect(data.some(l => l.includes('Sayaç A') && l.includes('Kaynak s'))).toBe(true)
    expect(data.some(l => l.includes('Endeks C') && l.includes(',kWh,INDEX,'))).toBe(true)
    expect(h.exportAudits).toHaveLength(1)
  })

  it('a value type without a verified unit says "Birim belirtilmemiş" — never an invented unit', async () => {
    const h = harness()
    const lines = csvLines(await h.svc.runExport(call('a-user', 'a-t1', 'CSV', { analysis: analysisBody({ seriesKeys: ['A_COUNTER'] }) })))
    for (const l of lines.slice(1, -1)) expect(l).toContain(',Birim belirtilmemiş,INDEX,')
  })

  it('a missing reading stays EMPTY (never 0) and carries its quality flag in a separate column', async () => {
    const h = harness({ text: csv(10, { missingA: 3 }) })
    const lines = csvLines(await h.svc.runExport(call('a-user', 'a-t1', 'CSV', { analysis: analysisBody({ seriesKeys: ['A_COUNTER'] }) })))
    const flagged = lines.slice(1, -1).filter(l => /MISSING_VALUE|INVALID/.test(l))
    expect(flagged.length).toBeGreaterThan(0)
    for (const l of flagged) {
      const cells = l.split(',')
      expect(cells[4]).toBe('') // Değer
      expect(cells[4]).not.toBe('0')
      expect(cells[7]).not.toBe('VALID')
    }
  })
})

describe('virtual column export', () => {
  async function withVirtual(h: ReturnType<typeof harness>) {
    await h.svc.createVirtualColumn({ actor: { id: 'a-admin' }, tenantId: 'a-t1', routeCode: 'SCADA_HOURLY_ANALYSIS', body: { label: 'Toplam sanal', unit: 'kWh', catalogId: CAT, seriesKey: 'TOTAL', expression: `A_COUNTER + C_INDEX + ${SECRET} - ${SECRET}`, inputSeriesKeys: ['A_COUNTER', 'C_INDEX'] } })
    await h.svc.activateVirtualColumn({ actor: { id: 'a-admin' }, tenantId: 'a-t1', routeCode: 'SCADA_HOURLY_ANALYSIS', param: 'vc-1' })
  }

  it('the virtual series carries its column id and version in every format — and the expression never appears in ANY file', async () => {
    const h = harness({ renderer: { configured: true, calls: [] } })
    await withVirtual(h)
    const body = { analysis: analysisBody({ seriesKeys: ['C_INDEX'], virtualColumnIds: ['vc-1'] }) }
    const csvOut = csvLines(await h.svc.runExport(call('a-user', 'a-t1', 'CSV', body)))
    expect(csvOut.some(l => l.includes('Toplam sanal') && l.includes(',vc-1,1,'))).toBe(true)
    const xlsx = file(await h.svc.runExport(call('a-user', 'a-t1', 'XLSX', body)))
    const z = unzip(xlsx.buffer)
    expect(cellsOf(z, 1).some(c => c.text === 'vc-1')).toBe(true)
    const png = await h.svc.runExport(call('a-user', 'a-t1', 'PNG', body))
    expect(png.kind === 'PNG_CAPTION' && png.captionLines.some(l => l.includes('Sanal seri: Toplam sanal (v1)'))).toBe(true)
    const all = [...csvOut, xlsx.buffer.toString('utf8'), JSON.stringify(png)].join('\n')
    expect(all).not.toMatch(new RegExp(`${SECRET}|expression|A_COUNTER \\+|createdBy`))
    await h.svc.runExport(call('a-user', 'a-t1', 'PDF', body))
  })
})

describe('XLSX export', () => {
  it('has the Analysis / Statistics / Quality sheets, a label block, numeric cells, and "—" for a missing value', async () => {
    const h = harness({ text: csv(10, { missingA: 3 }) })
    const r = file(await h.svc.runExport(call('a-user', 'a-t1', 'XLSX', { analysis: analysisBody({ seriesKeys: ['A_COUNTER'] }) })))
    expect(r.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const z = unzip(r.buffer)
    expect(sheetNames(z)).toEqual(['Analysis', 'Statistics', 'Quality'])
    const analysis = cellsOf(z, 1)
    const texts = analysis.filter(c => c.text !== null).map(c => c.text)
    expect(texts).toEqual(expect.arrayContaining(['Veri etiketi', SCADA_FIXTURE_DEVELOPMENT_LABEL, 'Kalite durumu filtresi', 'Tümü', 'Aralık (UTC)', 'Kalite bayrakları', 'Kalite', 'Sanal kolon', 'Sanal kolon sürümü', 'Birim belirtilmemiş']))
    expect(analysis.some(c => c.text === '—')).toBe(true) // the missing value / null cells are visible, not 0
    expect(analysis.some(c => c.num !== null && !Number.isNaN(c.num))).toBe(true) // real numeric cells
    expect(analysis.filter(c => c.num === 0).length).toBe(0) // a missing value never became 0
    const stats = cellsOf(z, 2).filter(c => c.text !== null).map(c => c.text)
    expect(stats).toEqual(expect.arrayContaining(['Seri', 'Toplam', 'Ortalama', 'Min', 'Maks', 'Geçerli adet', 'Eksik adet']))
    const qualityCells = cellsOf(z, 3)
    expect(qualityCells.some(c => c.text === 'Sayaç A')).toBe(true) // the series has its own Quality row
    expect(qualityCells.some(c => c.num === 5)).toBe(true) // total buckets of the series (5 hourly buckets, numeric)
    const quality = cellsOf(z, 3).filter(c => c.text !== null).map(c => c.text)
    expect(quality).toEqual(expect.arrayContaining(['Toplam kova', 'Eksik', 'Geçersiz', 'Sayaç sıfırlama çözülmedi', 'DST belirsiz', 'Tamamlanmamış']))
  })

  it('a comparison result produces a Comparison sheet', async () => {
    const h = harness()
    const r = file(await h.svc.runExport(call('a-user', 'a-t1', 'XLSX', { comparison: periodBody() })))
    const z = unzip(r.buffer)
    expect(sheetNames(z)).toEqual(['Comparison'])
    const texts = cellsOf(z, 1).filter(c => c.text !== null).map(c => c.text)
    expect(texts).toEqual(expect.arrayContaining(['Temel', 'Karşılaştırma', 'Mutlak fark', 'Yüzde fark', 'Karşılaştırma aralığı (UTC)', SCADA_FIXTURE_DEVELOPMENT_LABEL]))
  })
})

describe('comparison export (CSV / PNG)', () => {
  it('CSV lists the baseline, comparison, deltas, quality and status per row — deltas stay numeric, not neutralised', async () => {
    const h = harness()
    const lines = csvLines(await h.svc.runExport(call('a-user', 'a-t1', 'CSV', { comparison: periodBody() })))
    expect(lines[0]).toMatch(/^Zaman \(UTC\),Karşılaştırma zamanı \(UTC\),Seri,Karşılaştırma serisi,Kaynak,Karşılaştırma kaynağı,Temel,Karşılaştırma,Mutlak fark,Yüzde fark,Kalite,Durum,Neden,/)
    expect(lines.length).toBeGreaterThan(2)
    expect(lines.slice(1, -1).join('\n')).not.toMatch(/,'-\d/)
  })

  it('PNG caption mentions the comparison and the comparison range', async () => {
    const h = harness()
    const r = await h.svc.runExport(call('a-user', 'a-t1', 'PNG', { comparison: periodBody() }))
    expect(r.kind).toBe('PNG_CAPTION')
    if (r.kind !== 'PNG_CAPTION') return
    expect(r.captionLines.some(l => l.startsWith('Karşılaştırma aralığı'))).toBe(true)
    expect(r.captionLines.some(l => l.startsWith('Karşılaştırma: PERIOD'))).toBe(true)
  })
})

describe('PNG caption', () => {
  it('holds the title, the active filters, the quality / partial warnings and the development label; the audit says the browser draws it', async () => {
    const h = harness({ text: csv(10, { missingA: 3 }) })
    const r = await h.svc.runExport(call('a-user', 'a-t1', 'PNG', { analysis: analysisBody({ seriesKeys: ['A_COUNTER'] }) }))
    expect(r.kind).toBe('PNG_CAPTION')
    if (r.kind !== 'PNG_CAPTION') return
    expect(r.fileName).toMatch(/^scada_SCADA_HOURLY_ANALYSIS_2026-06-01\.png$/)
    expect(r.captionLines[0]).toContain('SCADA analiz raporu')
    expect(r.captionLines).toContain(SCADA_FIXTURE_DEVELOPMENT_LABEL)
    expect(r.captionLines.some(l => l.startsWith('Kalite durumu filtresi:'))).toBe(true)
    expect(r.captionLines.some(l => l.startsWith('Aralık (UTC):'))).toBe(true)
    expect(r.captionLines.some(l => l.startsWith('Uyarı: Kalite uyarısı'))).toBe(true)
    expect(r.exportId).toMatch(/^srv-/)
    expect(h.exportAudits).toEqual([]) // the bytes do not exist yet: NO success is recorded by step 1
  })
})

describe('PNG completion (the success audit only after the browser produced the bytes)', () => {
  const complete = (user: string, tenant: string, body: unknown, code = 'SCADA_HOURLY_ANALYSIS') => ({ actor: { id: user }, tenantId: tenant, routeCode: code, body })
  async function step1(h: ReturnType<typeof harness>, user = 'a-user', tenant = 'a-t1') {
    const r = await h.svc.runExport(call(user, tenant, 'PNG', { analysis: analysisBody() }))
    if (r.kind !== 'PNG_CAPTION') throw new Error('not a caption')
    return r.exportId
  }

  it('step 1 writes NO export success; the completion writes exactly one REPORT_EXPORT_SUCCEEDED (PNG, CLIENT_RENDERED) with static facts', async () => {
    const h = harness()
    const exportId = await step1(h)
    expect(h.exportAudits).toEqual([])
    expect(await h.svc.completePngExport(complete('a-user', 'a-t1', { exportId, outcome: 'SUCCEEDED' }))).toEqual({ recorded: true })
    expect(h.exportAudits).toEqual([expect.objectContaining({ actorId: 'a-user', tenantId: 'a-t1', artifactCode: 'SCADA_HOURLY_ANALYSIS', format: 'PNG', result: 'SUCCEEDED', reasonCode: 'OK', rendererMode: 'NONE', delivery: 'CLIENT_RENDERED', simulation: true, rowCount: expect.any(Number) })])
  })

  it('a client-side render failure is recorded as FAILED with the static reason CLIENT_RENDER_FAILED', async () => {
    const h = harness()
    const exportId = await step1(h)
    await h.svc.completePngExport(complete('a-user', 'a-t1', { exportId, outcome: 'FAILED' }))
    expect(h.exportAudits).toEqual([expect.objectContaining({ result: 'FAILED', reasonCode: 'CLIENT_RENDER_FAILED', format: 'PNG' })])
  })

  it('the completion is re-verified: another actor, another tenant, another artifact, an unknown id, a replay and an expired id are all refused (nothing recorded)', async () => {
    const h = harness()
    const ok = { outcome: 'SUCCEEDED' }
    let id = await step1(h)
    expect(await codeOf(h.svc.completePngExport(complete('a-other', 'a-t1', { exportId: id, ...ok })))).toBe('SCADA_EXPORT_CONTEXT_INVALID')
    id = await step1(h)
    expect(await codeOf(h.svc.completePngExport(complete('a-user', 'a-t2', { exportId: id, ...ok })))).toBe('SCADA_EXPORT_CONTEXT_INVALID')
    id = await step1(h)
    expect(await codeOf(h.svc.completePngExport(complete('a-user', 'a-t1', { exportId: id, ...ok }, 'OTHER_ARTIFACT')))).toBe('SCADA_EXPORT_CONTEXT_INVALID')
    expect(await codeOf(h.svc.completePngExport(complete('a-user', 'a-t1', { exportId: 'never-issued', ...ok })))).toBe('SCADA_EXPORT_CONTEXT_INVALID')
    id = await step1(h)
    expect(await codeOf(h.svc.completePngExport(complete('a-user', 'a-t1', { exportId: id, ...ok })))).toBe('OK')
    expect(await codeOf(h.svc.completePngExport(complete('a-user', 'a-t1', { exportId: id, ...ok })))).toBe('SCADA_EXPORT_CONTEXT_INVALID') // replay
    id = await step1(h)
    h.tick(6 * 60 * 1000)
    expect(await codeOf(h.svc.completePngExport(complete('a-user', 'a-t1', { exportId: id, ...ok })))).toBe('SCADA_EXPORT_CONTEXT_INVALID') // expired
    expect(h.exportAudits.filter(a => a.result === 'SUCCEEDED')).toHaveLength(1)
  })

  it('another customer root cannot complete this root\'s export even with the right id (the root is re-resolved now)', async () => {
    const h = harness()
    const id = await step1(h)
    expect(await codeOf(h.svc.completePngExport(complete('b-user', 'b-t1', { exportId: id, outcome: 'SUCCEEDED' })))).toBe('SCADA_EXPORT_CONTEXT_INVALID')
    expect(h.exportAudits).toEqual([])
  })

  it('the customer root is re-resolved at completion: the same actor and tenant under a DIFFERENT root is refused', async () => {
    const h = harness()
    const id = await step1(h)
    h.flipRoot()
    expect(await codeOf(h.svc.completePngExport(complete('a-user', 'a-t1', { exportId: id, outcome: 'SUCCEEDED' })))).toBe('SCADA_EXPORT_CONTEXT_INVALID')
    expect(h.exportAudits).toEqual([])
  })

  it('a wrong caller consumes nothing useful: the pending export is single-use even for a refused attempt', async () => {
    const h = harness()
    const id = await step1(h)
    await codeOf(h.svc.completePngExport(complete('a-other', 'a-t1', { exportId: id, outcome: 'SUCCEEDED' })))
    expect(await codeOf(h.svc.completePngExport(complete('a-user', 'a-t1', { exportId: id, outcome: 'SUCCEEDED' })))).toBe('SCADA_EXPORT_CONTEXT_INVALID')
  })

  it('a failed audit write ⇒ SCADA_AUDIT_FAILED (the browser must NOT deliver the file); without the audit port ⇒ 503', async () => {
    const h = harness()
    const id = await step1(h)
    const failing = harness({ exportAudit: 'fail' })
    const fid = await step1(failing) // step 1 records no success, so it does not touch the failing writer
    expect(await codeOf(failing.svc.completePngExport(complete('a-user', 'a-t1', { exportId: fid, outcome: 'SUCCEEDED' })))).toBe('SCADA_AUDIT_FAILED')
    const none = harness({ exportAudit: 'none' })
    expect(await codeOf(none.svc.completePngExport(complete('a-user', 'a-t1', { exportId: id, outcome: 'SUCCEEDED' })))).toBe('SCADA_SOURCE_NOT_CONFIGURED')
  })

  it.each([[{}], [{ exportId: 'x' }], [{ outcome: 'SUCCEEDED' }], [{ exportId: 'a b', outcome: 'SUCCEEDED' }], [{ exportId: 'ok-1', outcome: 'DONE' }], [{ exportId: 'ok-1', outcome: 'SUCCEEDED', tenantId: 'evil' }], [{ exportId: 'ok-1', outcome: 'SUCCEEDED', rowCount: 9 }], [[]], [null]])('the completion body %j is refused (only exportId + outcome)', async body => {
    const h = harness()
    expect(['SCADA_REQUEST_INVALID', 'SCADA_REQUEST_UNKNOWN_FIELD']).toContain(await codeOf(h.svc.completePngExport(complete('a-user', 'a-t1', body))))
    expect(h.exportAudits).toEqual([])
  })
})

describe('PDF through the existing Jasper seam', () => {
  it('sends the allowlisted scada-analysis-report template with title, filters, label, warnings, summary, quality and the data table — never the expression', async () => {
    const renderer: Renderer = { configured: true, calls: [] }
    const h = harness({ text: csv(10, { missingA: 3 }), renderer })
    const r = file(await h.svc.runExport(call('a-user', 'a-t1', 'PDF', { analysis: analysisBody({ seriesKeys: ['A_COUNTER'] }) })))
    expect(r.buffer.toString()).toBe('%PDF-jasper')
    expect(r.fileName).toMatch(/\.pdf$/)
    expect(renderer.calls).toHaveLength(1)
    const c = renderer.calls[0]!
    expect(c).toMatchObject({ artifactCode: 'SCADA_HOURLY_ANALYSIS', templateId: 'scada-analysis-report', format: 'PDF' })
    const kinds = c.rows.map(x => x.kind)
    expect(kinds[0]).toBe('TITLE')
    expect(kinds).toEqual(expect.arrayContaining(['META', 'NOTE', 'SECTION', 'HEADER', 'DATA']))
    const flat = c.rows.map(x => [x.c1, x.c2, x.c3, x.c4, x.c5, x.c6, x.c7, x.c8].join('|')).join('\n')
    expect(flat).toContain(SCADA_FIXTURE_DEVELOPMENT_LABEL)
    expect(flat).toContain('Kalite durumu filtresi|Tümü')
    expect(flat).toContain('Kalite uyarısı')
    expect(flat).toContain('Özet (istatistikler)')
    expect(flat).toContain('Veri tablosu')
    expect(flat).toMatch(/MISSING_VALUE/)
    expect(flat).not.toMatch(/expression|createdBy|phys_s|KAYIT_|Server=|Password/)
    expect(h.exportAudits[0]).toMatchObject({ format: 'PDF', rendererMode: 'JASPER', delivery: 'SERVER_FILE' })
  })

  it('without a configured renderer the existing built-in fallback PDF is used (audited as FALLBACK)', async () => {
    const h = harness({ renderer: { configured: false, calls: [] } })
    const r = file(await h.svc.runExport(call('a-user', 'a-t1', 'PDF', { analysis: analysisBody() })))
    expect(r.buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(h.exportAudits[0]).toMatchObject({ rendererMode: 'FALLBACK' })
  })

  it('a renderer failure becomes a static code: no renderer text, no bytes, a FAILED export audit', async () => {
    const renderer: Renderer = { configured: true, calls: [], fail: new BadGatewayException('Renderer hata döndürdü: jdbc:postgresql://internal/secret') }
    const h = harness({ renderer })
    const err = await h.svc.runExport(call('a-user', 'a-t1', 'PDF', { analysis: analysisBody() })).catch(e => e)
    expect(err).toBeInstanceOf(ScadaApiError)
    expect(err.code).toBe('SCADA_EXPORT_RENDER_FAILED')
    expect(err.status).toBe(502)
    expect(JSON.stringify(err)).not.toMatch(/jdbc|internal|secret/)
    expect(h.exportAudits).toEqual([expect.objectContaining({ result: 'FAILED', reasonCode: 'SCADA_EXPORT_RENDER_FAILED', format: 'PDF' })])
    expect(JSON.stringify(h.exportAudits)).not.toMatch(/jdbc|internal|secret/)
  })

  it('a renderer "payload too large" answer is the static limit code', async () => {
    const renderer: Renderer = { configured: true, calls: [], fail: new BadRequestException('Render payload çok büyük') }
    const h = harness({ renderer })
    expect(await codeOf(h.svc.runExport(call('a-user', 'a-t1', 'PDF', { analysis: analysisBody() })))).toBe('SCADA_LIMIT_EXCEEDED')
  })
})

describe('empty and blocked results are never downloaded as a success', () => {
  it.each(['CSV', 'XLSX', 'PDF', 'PNG'])('%s of a range without any reading ⇒ SCADA_EXPORT_EMPTY (409), no bytes, one FAILED export audit', async format => {
    const h = harness({ renderer: { configured: true, calls: [] } })
    const empty = analysisBody({ startAt: '2030-01-01T00:00:00.000Z', endAt: '2030-01-01T03:00:00.000Z' })
    const err = await h.svc.runExport(call('a-user', 'a-t1', format, { analysis: empty })).catch(e => e)
    expect(err).toBeInstanceOf(ScadaApiError)
    expect(err.code).toBe('SCADA_EXPORT_EMPTY')
    expect(err.status).toBe(409)
    expect(h.exportAudits).toEqual([expect.objectContaining({ result: 'FAILED', reasonCode: 'SCADA_EXPORT_EMPTY' })])
    expect(h.exportAudits.every(a => a.result === 'FAILED')).toBe(true)
    expect(h.exportAudits.some(a => a.result === 'SUCCEEDED')).toBe(false)
  })
})

describe('audit', () => {
  it('a failed export audit write ⇒ SCADA_AUDIT_FAILED and NO bytes (fail-closed), without leaking the writer error', async () => {
    const h = harness({ exportAudit: 'fail' })
    const err = await h.svc.runExport(call('a-user', 'a-t1', 'CSV', { analysis: analysisBody() })).catch(e => e)
    expect(err).toBeInstanceOf(ScadaApiError)
    expect(err.code).toBe('SCADA_AUDIT_FAILED')
    expect(JSON.stringify(err)).not.toMatch(/hunter2|Server=/)
  })

  it('without an export audit port every export is refused (503) — nothing is delivered unrecorded', async () => {
    const h = harness({ exportAudit: 'none' })
    expect(await codeOf(h.svc.runExport(call('a-user', 'a-t1', 'CSV', { analysis: analysisBody() })))).toBe('SCADA_SOURCE_NOT_CONFIGURED')
  })

  it('the success record is written only after the file exists and carries static facts only (no filter, label, name, SQL, row)', async () => {
    const h = harness()
    await h.svc.runExport(call('a-user', 'a-t1', 'XLSX', { analysis: analysisBody() }))
    expect(h.exportAudits).toEqual([{ actorId: 'a-user', tenantId: 'a-t1', artifactCode: 'SCADA_HOURLY_ANALYSIS', format: 'XLSX', kind: 'ANALYSIS', result: 'SUCCEEDED', reasonCode: 'OK', rendererMode: 'NONE', delivery: 'SERVER_FILE', rowCount: expect.any(Number), simulation: true, correlationId: expect.stringMatching(/^srv-/) }])
    expect(JSON.stringify(h.exportAudits)).not.toMatch(/Sayaç|Kaynak s|phys_s|KAYIT_|A_COUNTER|scada-cat/)
  })

  it('a rejected request records one FAILED export audit with a static reason and still returns the static error', async () => {
    const h = harness()
    expect(await codeOf(h.svc.runExport(call('a-user', 'a-t1', 'CSV', { analysis: analysisBody({ seriesKeys: ['NOPE'] }) })))).not.toBe('OK')
    expect(h.exportAudits).toHaveLength(1)
    expect(h.exportAudits[0]).toMatchObject({ result: 'FAILED', format: 'CSV', kind: 'ANALYSIS' })
    expect(h.exportAudits[0]!.reasonCode).toMatch(/^SCADA_[A-Z_]+$/)
  })
})

describe('tenant isolation, request shape and redaction', () => {
  it('a tenant whose scope cannot be resolved gets a static scope denial for every format — nothing delivered, one FAILED audit each', async () => {
    const h = harness({ renderer: { configured: true, calls: [] } })
    for (const format of ['CSV', 'XLSX', 'PDF', 'PNG']) {
      const err = await h.svc.runExport(call('x-user', 'x-t1', format, { analysis: analysisBody() })).catch(e => e)
      expect(err).toBeInstanceOf(ScadaApiError)
      expect(err.code).toBe('SCADA_SCOPE_DENIED')
    }
    expect(h.exportAudits.map(a => [a.result, a.tenantId, a.reasonCode])).toEqual(Array(4).fill(['FAILED', 'x-t1', 'SCADA_SCOPE_DENIED']))
  })

  it('another customer root cannot export through a virtual column of this root (its store is per root): static error, nothing delivered', async () => {
    const h = harness()
    await h.svc.createVirtualColumn({ actor: { id: 'a-admin' }, tenantId: 'a-t1', routeCode: 'SCADA_HOURLY_ANALYSIS', body: { label: 'Toplam sanal', unit: 'kWh', catalogId: CAT, seriesKey: 'TOTAL', expression: 'A_COUNTER + C_INDEX', inputSeriesKeys: ['A_COUNTER', 'C_INDEX'] } })
    await h.svc.activateVirtualColumn({ actor: { id: 'a-admin' }, tenantId: 'a-t1', routeCode: 'SCADA_HOURLY_ANALYSIS', param: 'vc-1' })
    const body = { analysis: analysisBody({ seriesKeys: ['C_INDEX'], virtualColumnIds: ['vc-1'] }) }
    expect(await codeOf(h.svc.runExport(call('a-user', 'a-t1', 'CSV', body)))).toBe('OK')
    const err = await h.svc.runExport(call('b-user', 'b-t1', 'CSV', body)).catch(e => e)
    expect(err).toBeInstanceOf(ScadaApiError)
    expect(err.code).not.toBe('OK')
    expect(h.exportAudits.filter(a => a.tenantId === 'b-t1').every(a => a.result === 'FAILED')).toBe(true)
  })

  it.each([['csv'], ['HTML'], [''], [undefined], [42], ['CSV;']])('format %j is refused before anything is read', async format => {
    const h = harness()
    expect(await codeOf(h.svc.runExport(call('a-user', 'a-t1', format, { analysis: analysisBody() })))).toBe('SCADA_EXPORT_FORMAT_INVALID')
    expect(h.audits.filter(a => a.actionCode === 'SCADA_QUERY_SUCCEEDED')).toEqual([])
  })

  it.each([
    [{}, 'SCADA_REQUEST_INVALID'],
    [{ analysis: analysisBody(), comparison: periodBody() }, 'SCADA_REQUEST_INVALID'],
    [{ analysis: 'x' }, 'SCADA_REQUEST_INVALID'],
    [{ analysis: analysisBody(), rows: [] }, 'SCADA_REQUEST_UNKNOWN_FIELD'],
    [{ analysis: analysisBody(), actorId: 'evil' }, 'SCADA_REQUEST_UNKNOWN_FIELD'],
    [[], 'SCADA_REQUEST_INVALID'],
    [null, 'SCADA_REQUEST_INVALID'],
  ])('the export body %j is refused with %s (a client can send no rows, actor or tenant)', async (body, expected) => {
    const h = harness()
    expect(await codeOf(h.svc.runExport(call('a-user', 'a-t1', 'CSV', body)))).toBe(expected)
  })

  it('a raw provider error never leaves: static code, no text in the response or in either audit', async () => {
    const h = harness({ queryThrows: new Error('Server=10.0.0.5;Database=scada;Password=hunter2 SELECT * FROM phys_s') })
    const err = await h.svc.runExport(call('a-user', 'a-t1', 'CSV', { analysis: analysisBody() })).catch(e => e)
    expect(err.code).toBe('SCADA_SOURCE_UNAVAILABLE')
    expect(JSON.stringify([err, h.audits, h.exportAudits])).not.toMatch(/hunter2|Server=|phys_s|SELECT|Database=/)
  })
})
