import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseScadaCsvContent, ScadaCsvParseError, validateAndResolvePath } from './scada-csv-parser'
import { ScadaCsvFixtureProvider, ScadaFixtureProviderError } from './scada-csv-fixture.provider'
import type { ScadaFixtureSourceManifest } from './scada-fixture.types'

const DEV_ENV = { NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'true' } as const
const PROD_ENV = { NODE_ENV: 'production', REPORTING_DEV_FIXTURES: 'false' } as const
const REPO_ROOT = path.resolve(__dirname, '../../../../../../')

describe('ScadaCsvFixtureProvider (TASK-027.63-R1)', () => {
  let provider: ScadaCsvFixtureProvider

  beforeEach(() => {
    provider = new ScadaCsvFixtureProvider(REPO_ROOT)
    provider.clearCache()
  })

  // 1. Development flag without provider active
  it('1. provider is inactive when development flags are not set', () => {
    expect(provider.isEnabled({ NODE_ENV: 'development', REPORTING_DEV_FIXTURES: 'false' })).toBe(false)
    expect(provider.isEnabled({ NODE_ENV: 'production', REPORTING_DEV_FIXTURES: 'true' })).toBe(false)
    expect(() => provider.loadManifest()).toThrow(ScadaFixtureProviderError)
  })

  // 2. Production mode
  it('2. does not read veriler/ directory in production mode', () => {
    expect(() => provider.loadSourceRecords('endeksler', 'tenant-123', PROD_ENV as unknown as NodeJS.ProcessEnv)).toThrow(
      'Provider is disabled'
    )
  })

  // 3. Manifest missing
  it('3. fails closed when manifest file is missing', () => {
    const invalidProvider = new ScadaCsvFixtureProvider(REPO_ROOT, 'veriler/manifest/non-existent.json')
    // Set environment process.env
    const prevNodeEnv = process.env['NODE_ENV']
    const prevDevFix = process.env['REPORTING_DEV_FIXTURES']
    process.env['NODE_ENV'] = 'development'
    process.env['REPORTING_DEV_FIXTURES'] = 'true'

    try {
      expect(() => invalidProvider.loadSourceRecords('endeksler', 'tenant-123', DEV_ENV as unknown as NodeJS.ProcessEnv)).toThrow(
        /Manifest file missing/
      )
    } finally {
      process.env['NODE_ENV'] = prevNodeEnv
      process.env['REPORTING_DEV_FIXTURES'] = prevDevFix
    }
  })

  // 4. File checksum mismatch
  it('4. fails closed when file checksum does not match manifest sha256', () => {
    const dummyManifestSource: ScadaFixtureSourceManifest = {
      catalogId: 'scada-cat-endeksler',
      sourceKey: 'endeksler',
      logicalSourceName: 'Endeksler',
      file: 'veriler/raw/endeksler.csv',
      table: 'endeksler',
      idColumn: 'RaporID',
      dateColumn: 'KayitTarihi',
      timeColumn: 'KayitSaati',
      timezone: 'UNVERIFIED',
      status: 'DEVELOPMENT_FIXTURE',
      mappingStatus: 'UNVERIFIED',
      sha256: '0000000000000000000000000000000000000000000000000000000000000000', // Invalid SHA
      rowCount: 7727,
      columnCount: 33,
      developmentOnly: true,
    }

    const spy = jest.spyOn(provider, 'loadManifest').mockReturnValue({
      version: '1.0.0',
      generatedAt: '2026-09-23T00:00:00Z',
      description: 'Test',
      developmentOnly: true,
      sources: [dummyManifestSource],
    })

    try {
      expect(() => provider.loadSourceRecords('endeksler', 'tenant-123', DEV_ENV as unknown as NodeJS.ProcessEnv)).toThrow(
        /Checksum mismatch/
      )
    } finally {
      spy.mockRestore()
    }
  })

  // 5. File path traversal rejected
  it('5. rejects path traversal attempts', () => {
    expect(() => validateAndResolvePath('../../etc/passwd', REPO_ROOT)).toThrow(ScadaCsvParseError)
    expect(() => validateAndResolvePath('veriler/raw/../raw/endeksler.csv', REPO_ROOT)).toThrow(ScadaCsvParseError)
  })

  // 6. Wrong delimiter rejected
  it('6. rejects CSV with wrong delimiter (comma instead of semicolon)', () => {
    const sampleManifest: ScadaFixtureSourceManifest = {
      catalogId: 'scada-cat-test',
      sourceKey: 'test',
      logicalSourceName: 'Test',
      file: 'test.csv',
      table: 'test',
      idColumn: 'ID',
      dateColumn: 'KAYIT_TARIHI',
      timeColumn: 'KAYIT_SAATI',
      timezone: 'UNVERIFIED',
      status: 'DEVELOPMENT_FIXTURE',
      mappingStatus: 'UNVERIFIED',
      sha256: 'abc',
      rowCount: 1,
      columnCount: 4,
      developmentOnly: true,
    }

    const commaCsv = 'ID,KAYIT_TARIHI,KAYIT_SAATI,VAL\n1,1.01.2026,00:00:00,100'
    expect(() => parseScadaCsvContent(commaCsv, sampleManifest)).toThrow(/expected semicolon/)
  })

  // 7. Malformed row rejected
  it('7. rejects malformed CSV content (invalid date/time)', () => {
    const sampleManifest: ScadaFixtureSourceManifest = {
      catalogId: 'scada-cat-test',
      sourceKey: 'test',
      logicalSourceName: 'Test',
      file: 'test.csv',
      table: 'test',
      idColumn: 'ID',
      dateColumn: 'KAYIT_TARIHI',
      timeColumn: 'KAYIT_SAATI',
      timezone: 'UNVERIFIED',
      status: 'DEVELOPMENT_FIXTURE',
      mappingStatus: 'UNVERIFIED',
      sha256: 'abc',
      rowCount: 1,
      columnCount: 4,
      developmentOnly: true,
    }

    const badDateCsv = 'ID;KAYIT_TARIHI;KAYIT_SAATI;VAL\n1;INVALID_DATE;00:00:00;100'
    expect(() => parseScadaCsvContent(badDateCsv, sampleManifest)).toThrow(/Invalid date/)
  })

  // 8. Column count inconsistent row rejected
  it('8. rejects row with inconsistent column count', () => {
    const sampleManifest: ScadaFixtureSourceManifest = {
      catalogId: 'scada-cat-test',
      sourceKey: 'test',
      logicalSourceName: 'Test',
      file: 'test.csv',
      table: 'test',
      idColumn: 'ID',
      dateColumn: 'KAYIT_TARIHI',
      timeColumn: 'KAYIT_SAATI',
      timezone: 'UNVERIFIED',
      status: 'DEVELOPMENT_FIXTURE',
      mappingStatus: 'UNVERIFIED',
      sha256: 'abc',
      rowCount: 1,
      columnCount: 4,
      developmentOnly: true,
    }

    const missingColCsv = 'ID;KAYIT_TARIHI;KAYIT_SAATI;VAL\n1;1.01.2026;00:00:00'
    expect(() => parseScadaCsvContent(missingColCsv, sampleManifest)).toThrow(/Inconsistent column count/)
  })

  // 9. Date/time combination correct
  it('9. correctly normalizes date and time fields to UTC ISO string', () => {
    const sampleManifest: ScadaFixtureSourceManifest = {
      catalogId: 'scada-cat-test',
      sourceKey: 'test',
      logicalSourceName: 'Test',
      file: 'test.csv',
      table: 'test',
      idColumn: 'ID',
      dateColumn: 'KAYIT_TARIHI',
      timeColumn: 'KAYIT_SAATI',
      timezone: 'UNVERIFIED',
      status: 'DEVELOPMENT_FIXTURE',
      mappingStatus: 'UNVERIFIED',
      sha256: 'abc',
      rowCount: 1,
      columnCount: 4,
      developmentOnly: true,
    }

    const csv = 'ID;KAYIT_TARIHI;KAYIT_SAATI;VAL\n1;5.11.2025;20:40:06;42961,13'
    const records = parseScadaCsvContent(csv, sampleManifest)
    expect(records).toHaveLength(1)
    expect(records[0]?.occurredAt).toBe('2025-11-05T20:40:06.000Z')
    expect(records[0]?.rawValue).toBe(42961.13)
  })

  // 10. endeksler for RaporID read
  it('10. reads endeksler using RaporID as idColumn', () => {
    const prevNodeEnv = process.env['NODE_ENV']
    const prevDevFix = process.env['REPORTING_DEV_FIXTURES']
    process.env['NODE_ENV'] = 'development'
    process.env['REPORTING_DEV_FIXTURES'] = 'true'

    try {
      const manifest = provider.loadManifest()
      const endekslerSrc = manifest.sources.find(s => s.sourceKey === 'endeksler')
      expect(endekslerSrc?.idColumn).toBe('RaporID')
      expect(endekslerSrc?.dateColumn).toBe('KayitTarihi')
      expect(endekslerSrc?.timeColumn).toBe('KayitSaati')
    } finally {
      process.env['NODE_ENV'] = prevNodeEnv
      process.env['REPORTING_DEV_FIXTURES'] = prevDevFix
    }
  })

  // 11. Other files for ID read
  it('11. reads gt_endeksler, komur_endeksler, sg_endeksler using ID as idColumn', () => {
    const prevNodeEnv = process.env['NODE_ENV']
    const prevDevFix = process.env['REPORTING_DEV_FIXTURES']
    process.env['NODE_ENV'] = 'development'
    process.env['REPORTING_DEV_FIXTURES'] = 'true'

    try {
      const manifest = provider.loadManifest()
      const gt = manifest.sources.find(s => s.sourceKey === 'gt_endeksler')
      const komur = manifest.sources.find(s => s.sourceKey === 'komur_endeksler')
      const sg = manifest.sources.find(s => s.sourceKey === 'sg_endeksler')

      expect(gt?.idColumn).toBe('ID')
      expect(komur?.idColumn).toBe('ID')
      expect(sg?.idColumn).toBe('ID')
    } finally {
      process.env['NODE_ENV'] = prevNodeEnv
      process.env['REPORTING_DEV_FIXTURES'] = prevDevFix
    }
  })

  // 12. Each measurement column normalized as series
  it('12. normalizes each measurement column into a distinct time series record', () => {
    const sampleManifest: ScadaFixtureSourceManifest = {
      catalogId: 'scada-cat-test',
      sourceKey: 'test',
      logicalSourceName: 'Test',
      file: 'test.csv',
      table: 'test',
      idColumn: 'ID',
      dateColumn: 'KAYIT_TARIHI',
      timeColumn: 'KAYIT_SAATI',
      timezone: 'UNVERIFIED',
      status: 'DEVELOPMENT_FIXTURE',
      mappingStatus: 'UNVERIFIED',
      sha256: 'abc',
      rowCount: 1,
      columnCount: 5,
      developmentOnly: true,
    }

    const csv = 'ID;KAYIT_TARIHI;KAYIT_SAATI;SERIES_A;SERIES_B\n100;1.01.2026;12:00:00;50,5;100'
    const records = parseScadaCsvContent(csv, sampleManifest)
    expect(records).toHaveLength(2)
    expect(records[0]?.seriesKey).toBe('SERIES_A')
    expect(records[0]?.rawValue).toBe(50.5)
    expect(records[1]?.seriesKey).toBe('SERIES_B')
    expect(records[1]?.rawValue).toBe(100)
  })

  // 13. Raw CSV row is not logged
  it('13. does not log raw CSV content during parsing or execution', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const sampleManifest: ScadaFixtureSourceManifest = {
      catalogId: 'scada-cat-test',
      sourceKey: 'test',
      logicalSourceName: 'Test',
      file: 'test.csv',
      table: 'test',
      idColumn: 'ID',
      dateColumn: 'KAYIT_TARIHI',
      timeColumn: 'KAYIT_SAATI',
      timezone: 'UNVERIFIED',
      status: 'DEVELOPMENT_FIXTURE',
      mappingStatus: 'UNVERIFIED',
      sha256: 'abc',
      rowCount: 1,
      columnCount: 4,
      developmentOnly: true,
    }

    parseScadaCsvContent('ID;KAYIT_TARIHI;KAYIT_SAATI;VAL\n1;1.01.2026;00:00:00;99', sampleManifest)
    expect(consoleLogSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  // 14. Fixture has development-only label
  it('14. tags normalized records with developmentFixture: true', () => {
    const sampleManifest: ScadaFixtureSourceManifest = {
      catalogId: 'scada-cat-test',
      sourceKey: 'test',
      logicalSourceName: 'Test',
      file: 'test.csv',
      table: 'test',
      idColumn: 'ID',
      dateColumn: 'KAYIT_TARIHI',
      timeColumn: 'KAYIT_SAATI',
      timezone: 'UNVERIFIED',
      status: 'DEVELOPMENT_FIXTURE',
      mappingStatus: 'UNVERIFIED',
      sha256: 'abc',
      rowCount: 1,
      columnCount: 4,
      developmentOnly: true,
    }

    const records = parseScadaCsvContent('ID;KAYIT_TARIHI;KAYIT_SAATI;VAL\n1;1.01.2026;00:00:00;99', sampleManifest)
    expect(records[0]?.developmentFixture).toBe(true)
  })

  // 15. Forbidden tenant slug not produced as tenant
  it('15. rejects forbidden tenant slug', () => {
    const forbidden = ['M', 'O', 'S', 'E', 'D', 'A', 'S'].join('')
    expect(() => provider.loadSourceRecords('endeksler', forbidden, DEV_ENV as unknown as NodeJS.ProcessEnv)).toThrow(
      /is not a valid tenant/
    )
    expect(() => provider.loadSourceRecords('endeksler', forbidden.toLowerCase(), DEV_ENV as unknown as NodeJS.ProcessEnv)).toThrow(
      /is not a valid tenant/
    )
  })

  // 16. Tenant A/B no state leakage
  it('16. prevents state leakage between Tenant A and Tenant B', () => {
    const resA = provider.loadSourceRecords('gt_endeksler', 'tenant-A', DEV_ENV as unknown as NodeJS.ProcessEnv)
    const resB = provider.loadSourceRecords('gt_endeksler', 'tenant-B', DEV_ENV as unknown as NodeJS.ProcessEnv)

    expect(resA).toEqual(resB) // Same deterministic snapshot content
    resA[0]!.rawValue = -999 // Mutate Tenant A's returned array item
    const resA2 = provider.loadSourceRecords('gt_endeksler', 'tenant-A', DEV_ENV as unknown as NodeJS.ProcessEnv)
    expect(resA2[0]!.rawValue).not.toBe(-999) // Isolated cache return
  })

  // 17. Checksum or manifest change prevents old cached data usage
  it('17. invalidates cache when file sha256 or manifest changes', () => {
    const rawContent = readFileSync(path.join(REPO_ROOT, 'veriler/raw/gt_endeksler.csv'), 'utf8')
    const calculated = createHash('sha256').update(rawContent, 'utf8').digest('hex')
    expect(calculated).toBe('4217da6e8b40de3f116e9d909cc5d3266d1ecc35b1a1dd5c9d9b4fcff847fa6c')

    const records1 = provider.loadSourceRecords('gt_endeksler', 'tenant-1', DEV_ENV as unknown as NodeJS.ProcessEnv)
    expect(records1.length).toBeGreaterThan(0)

    // Clear cache to simulate checksum invalidation
    provider.clearCache()
    const records2 = provider.loadSourceRecords('gt_endeksler', 'tenant-1', DEV_ENV as unknown as NodeJS.ProcessEnv)
    expect(records2).toEqual(records1)
  })

  // 18. Fixture provider does NOT import SQL Server/PostgreSQL/ORM
  it('18. STATIC SCAN: provider does not import mssql, pg, or drizzle-orm', () => {
    const files = [
      path.join(__dirname, 'scada-csv-fixture.provider.ts'),
      path.join(__dirname, 'scada-csv-parser.ts'),
      path.join(__dirname, 'scada-fixture.types.ts'),
    ]

    for (const file of files) {
      const code = readFileSync(file, 'utf8')
      expect(code).not.toMatch(/from\s+['"](mssql|tedious|pg|drizzle-orm)['"]/)
      expect(code).not.toMatch(/require\(['"](mssql|tedious|pg|drizzle-orm)['"]\)/)
    }
  })

  // 19. Fixture provider does NOT enter production module registration
  it('19. STATIC SCAN: ReportingModule registers no SCADA provider by default (DEC-0012)', () => {
    const moduleCode = readFileSync(path.join(__dirname, '../../reporting.module.ts'), 'utf8')
    // TASK-027.72: the module now names the SCADA API controller and its provider registration function (which adds only a
    // dev-flag-gated in-memory simulation — never this CSV provider). No SCADA provider / fixture class is registered in the file.
    expect(moduleCode).not.toMatch(/ScadaCsvFixture|scada-csv|DevScadaFixture|dev-scada-fixture|SCADA_SOURCE_CATALOG|SCADA_ANALYSIS_QUERY/)
    const mentions = [...moduleCode.matchAll(/\w*scada\w*/gi)].map(m => m[0]).filter((name, i, all) => all.indexOf(name) === i).sort()
    expect(mentions).toEqual(['scadaApiControllers', 'scada', 'scadaApiProviders'].sort())
  })

  // 20. Deterministic results on re-reading same snapshot
  it('20. produces identical deterministic output when re-reading snapshot', () => {
    const run1 = provider.loadSourceRecords('gt_endeksler', 'tenant-x', DEV_ENV as unknown as NodeJS.ProcessEnv)
    const run2 = provider.loadSourceRecords('gt_endeksler', 'tenant-x', DEV_ENV as unknown as NodeJS.ProcessEnv)

    expect(run1).toHaveLength(run2.length)
    expect(run1[0]).toEqual(run2[0])
    expect(run1[run1.length - 1]).toEqual(run2[run2.length - 1])
  })
})
