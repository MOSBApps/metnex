import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { buildWorkbookXlsx } from '../../../xlsx-writer'
import type { ProjectedAnalysis, ProjectedComparison } from '../../api/scada-api.projection'
import { buildExportFile, exportFileName } from '../scada-export.builder'
import { csvCell, buildScadaCsv } from '../scada-export.csv'
import { buildAnalysisModel, buildComparisonModel, isEmptyModel, type ExportMeta } from '../scada-export.model'
import { buildScadaPdfRows } from '../scada-export.pdf'
import { buildPngCaptionLines } from '../scada-export.png'
import { UNIT_UNSPECIFIED_LABEL } from '../scada-export.contract'
import { buildScadaXlsx, xlsxCell } from '../scada-export.xlsx'
import { csvField, neutraliseFormula, safeFileSegment } from '../spreadsheet-safe'

const META: ExportMeta = {
  artifactCode: 'ART_1',
  title: 'SCADA analiz raporu',
  generatedAt: '2026-06-01T00:00:00.000Z',
  developmentLabel: null,
  sourceNames: new Map([['cat-1', 'Kaynak Ü']]),
  plan: { bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul', timeRange: { startAt: '2026-01-01T00:00:00.000Z', endAt: '2026-01-02T00:00:00.000Z' }, statistics: ['SUM', 'AVERAGE'], filters: { qualityStates: ['MISSING_VALUE'], onlyAnalysisAllowed: true } as never, presetId: 'adhoc', presetVersion: 1, comparison: { mode: 'NONE' } as never },
}

const point = (over: Record<string, unknown> = {}) => ({ t: '2026-01-01T00:00:00.000Z', localWallTime: '2026-01-01T03:00:00', value: 5, quality: 'VALID', qualityFlags: [] as string[], isComplete: true, classification: 'X', ...over })
const series = (over: Record<string, unknown> = {}) => ({
  seriesKey: 'K', sourceCatalogId: 'cat-1', label: 'Şebeke', unit: 'kWh', valueType: 'INDEX', analysisAllowed: true, status: 'OK', codes: [] as string[], points: [point()],
  statistics: { status: 'OK', sum: 5, average: 5 }, qualitySummary: { totalBuckets: 1, validBuckets: 1, missingValues: 0, invalidValues: 0, counterResetUnresolved: 0, dstAmbiguous: 0, dstNonexistent: 0, incompleteBuckets: 0, analysisAllowed: true, highestSeverity: 'VALID' }, virtual: null, ...over,
})
const analysis = (over: Record<string, unknown> = {}): ProjectedAnalysis => ({ artifactCode: 'ART_1', status: 'OK', code: null, interval: 'HOURLY', timezone: 'Europe/Istanbul', range: { startAt: '', endAt: '' }, preset: null, series: [series()] as never, excluded: [], sources: [], virtualColumnFailures: [], pointFilter: { qualityStates: [], onlyAnalysisAllowed: false }, ...over }) as ProjectedAnalysis

describe('CSV cell rules', () => {
  it.each([['=1+1'], ['+SUM(A1)'], ['-2+3'], ['@cmd'], ['\tTAB'], ['\rCR']])('text %j is neutralised with a leading apostrophe', raw => {
    expect(neutraliseFormula(raw)).toBe(`'${raw}`)
    expect(csvCell(raw).replace(/^"|"$/g, '')).toContain(`'${raw.replace(/"/g, '""')}`)
  })

  it('a real number is written as a number: a negative delta is NOT turned into text', () => {
    expect(csvCell(-12.5)).toBe('-12.5')
    expect(csvCell(0)).toBe('0')
  })

  it('null / undefined / NaN / Infinity are EMPTY — never 0', () => {
    for (const v of [null, undefined as never, Number.NaN, Number.POSITIVE_INFINITY]) expect(csvCell(v)).toBe('')
  })

  it('RFC 4180: comma, quote, CR and LF force quotes and quotes are doubled; Turkish text is untouched', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('line1\nline2')).toBe('"line1\nline2"')
    expect(csvField('line1\r\nline2')).toBe('"line1\r\nline2"')
    expect(csvField('Şebeke ğüşiöçİı')).toBe('Şebeke ğüşiöçİı')
    expect(csvCell(true)).toBe('Evet')
    expect(csvCell(false)).toBe('Hayır')
  })

  it('a hostile series label cannot become a formula in the CSV file', () => {
    const model = buildAnalysisModel(analysis({ series: [series({ label: '=HYPERLINK("http://evil","x")' })] }), META)
    const text = buildScadaCsv(model).toString('utf8')
    expect(text).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`)
    expect(text).not.toMatch(/(^|,)=HYPERLINK/m)
  })
})

describe('XLSX writer and cells', () => {
  it('a hostile text cell is neutralised, a number stays numeric, null is the visible dash (not 0)', () => {
    expect(xlsxCell('=1+1')).toBe("'=1+1")
    expect(xlsxCell(-3)).toBe(-3)
    expect(xlsxCell(null)).toBe('—')
    expect(xlsxCell(Number.NaN)).toBe('—')
  })

  it('the workbook writer refuses a bad / duplicate sheet name and drops XML-illegal control characters', () => {
    expect(() => buildWorkbookXlsx([])).toThrow('WORKBOOK_EMPTY')
    for (const bad of ['', 'a/b', 'a:b', 'x'.repeat(32), "it's"]) expect(() => buildWorkbookXlsx([{ name: bad, rows: [] }])).toThrow('WORKBOOK_SHEET_NAME_INVALID')
    expect(() => buildWorkbookXlsx([{ name: 'A', rows: [] }, { name: 'a', rows: [] }])).toThrow('WORKBOOK_SHEET_NAME_INVALID')
    const out = buildWorkbookXlsx([{ name: 'A', rows: [['ok\u0000\u0008x', null, 3]] }]).toString('utf8')
    expect(out).toContain('okx')
    expect(out).toContain('<c r="C1"><v>3</v></c>')
    expect(out).not.toContain('r="B1"')
  })

  it('an analysis workbook: sheets Analysis / Statistics / Quality, no Comparison; every sheet opens with the label block', () => {
    const z = buildScadaXlsx(buildAnalysisModel(analysis(), { ...META, developmentLabel: 'Dev etiketi' })).toString('utf8')
    expect([...z.matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1])).toEqual(['Analysis', 'Statistics', 'Quality'])
    expect(z.match(/Dev etiketi/g)?.length).toBe(3)
  })
})

describe('the export model', () => {
  it('a missing value stays null; an empty unit says Birim belirtilmemiş; a virtual series keeps id and versions but never an expression', () => {
    const model = buildAnalysisModel(analysis({ series: [series({ unit: '', points: [point({ value: null, quality: 'MISSING_VALUE', qualityFlags: ['MISSING_VALUE'], isComplete: false })], virtual: { virtualColumnId: 'vc-1', versions: [1, 2], sourceSeriesKeys: ['A'], expression: 'A + 1' } })] }), META)
    const row = model.analysis!.rows[0]!
    expect(row).toMatchObject({ value: null, unit: UNIT_UNSPECIFIED_LABEL, quality: 'MISSING_VALUE', qualityFlags: ['MISSING_VALUE'], isComplete: false, virtualColumnId: 'vc-1', virtualColumnVersions: [1, 2], sourceName: 'Kaynak Ü', analysisAllowed: true })
    expect(JSON.stringify(model)).not.toMatch(/expression|A \+ 1/)
    expect(model.warnings.join(' ')).toContain('Kalite uyarısı')
  })

  it('PARTIAL / excluded / failed virtual columns / blocked analysis are visible warnings', () => {
    const m = buildAnalysisModel(analysis({ status: 'PARTIAL', excluded: [{ seriesKey: 'X', sourceCatalogId: 'cat-1', code: 'SERIES_ANALYSIS_BLOCKED' }], virtualColumnFailures: [{ virtualColumnId: 'vc-9', code: 'X' }], series: [series({ analysisAllowed: false })] }), META)
    expect(m.status).toBe('PARTIAL')
    expect(m.warnings.join('\n')).toMatch(/Kısmi sonuç[\s\S]*1 seri sonuç dışında[\s\S]*1 sanal kolon hesaplanamadı[\s\S]*analiz izni yok/)
  })

  it('the empty rule: BLOCKED or no rows ⇒ empty', () => {
    expect(isEmptyModel(buildAnalysisModel(analysis({ series: [series({ points: [] })] }), META))).toBe(true)
    expect(isEmptyModel(buildAnalysisModel(analysis({ status: 'BLOCKED' }), META))).toBe(true)
    expect(isEmptyModel(buildAnalysisModel(analysis(), META))).toBe(false)
  })

  it('a comparison model keeps deltas, statuses, reasons and warns about non-comparable rows', () => {
    const cmp = { artifactCode: 'ART_1', status: 'OK', code: null, mode: 'PERIOD', bucketInterval: 'HOURLY', timezone: 'Europe/Istanbul', comparability: 'PARTIALLY_COMPARABLE', rows: [{ t: 't1', comparisonT: 't2', seriesLabel: 'S', comparisonSeriesLabel: 'S', sourceLabel: 'A', comparisonSourceLabel: 'A', baseline: 10, comparison: 4, absoluteDelta: -6, percentageDelta: -60, quality: 'VALID', status: 'COMPARABLE', reasonCode: null, baselineReason: null, comparisonReason: null }, { t: 't3', comparisonT: 't4', seriesLabel: 'S', comparisonSeriesLabel: 'S', sourceLabel: 'A', comparisonSourceLabel: 'A', baseline: null, comparison: 4, absoluteDelta: null, percentageDelta: null, quality: 'MISSING_VALUE', status: 'BASELINE_MISSING', reasonCode: 'MISSING', baselineReason: null, comparisonReason: null }], unmatchedSeries: [], summary: { totalRows: 2 }, preset: null, sources: [] } as unknown as ProjectedComparison
    const m = buildComparisonModel(cmp, { ...META, plan: { ...META.plan, comparison: { mode: 'PERIOD', comparisonRange: { startAt: 'a', endAt: 'b' } } as never } }, ['cat-1'])
    expect(m.comparison!.rows[0]).toMatchObject({ baseline: 10, comparison: 4, absoluteDelta: -6, percentageDelta: -60 })
    expect(m.comparison!.rows[1]).toMatchObject({ baseline: null, absoluteDelta: null, status: 'BASELINE_MISSING', reasonCode: 'MISSING' })
    expect(m.filters.comparisonRange).toEqual({ startAt: 'a', endAt: 'b' })
    expect(m.warnings.join('\n')).toMatch(/Karşılaştırılabilirlik: PARTIALLY_COMPARABLE[\s\S]*hesaplanamadı[\s\S]*Kalite uyarısı/)
    const csv = buildScadaCsv(m).toString('utf8').split('\r\n')
    expect(csv[1]).toContain(',10,4,-6,-60,VALID,COMPARABLE,,')
    expect(csv[2]).toContain(',,4,,,MISSING_VALUE,BASELINE_MISSING,MISSING,')
  })
})

describe('PDF rows and PNG caption', () => {
  it('rows carry title, label, filters, warnings, summary, quality and data; a null is the dash; a virtual series shows id + version only', () => {
    const model = buildAnalysisModel(analysis({ series: [series({ points: [point({ value: null, quality: 'MISSING_VALUE', qualityFlags: ['MISSING_VALUE'] })], virtual: { virtualColumnId: 'vc-1', versions: [3], sourceSeriesKeys: ['A'] } })] }), { ...META, developmentLabel: 'Dev etiketi' })
    const rows = buildScadaPdfRows(model)
    expect(rows[0]).toMatchObject({ kind: 'TITLE', c1: 'SCADA analiz raporu' })
    const flat = rows.map(r => [r.kind, r.c1, r.c2, r.c3, r.c4, r.c5, r.c6, r.c7, r.c8].join('|')).join('\n')
    expect(flat).toContain('META|Veri etiketi|Dev etiketi')
    expect(flat).toContain('META|Kalite durumu filtresi|MISSING_VALUE')
    expect(flat).toContain('SECTION|Özet (istatistikler)')
    expect(flat).toContain('SECTION|Kalite')
    expect(flat).toContain('SECTION|Veri tablosu')
    expect(flat).toContain('Şebeke [sanal vc-1 v3]')
    expect(flat).toMatch(/DATA\|2026-01-01T00:00:00.000Z\|Şebeke \[sanal vc-1 v3\]\|Kaynak Ü\|—\|kWh\|MISSING_VALUE\|MISSING_VALUE\|Evet \/ Evet/)
    expect(rows.every(r => Object.keys(r).length === 9)).toBe(true)
  })

  it('the PNG caption has the title, filters, warnings, comparison info, virtual series and the development label; it is bounded', () => {
    const model = buildAnalysisModel(analysis({ series: [series({ virtual: { virtualColumnId: 'vc-1', versions: [1], sourceSeriesKeys: ['A'] } })] }), { ...META, developmentLabel: 'Dev etiketi' })
    const lines = buildPngCaptionLines(model)
    expect(lines[0]).toBe('SCADA analiz raporu')
    expect(lines).toContain('Dev etiketi')
    expect(lines).toContain('Sanal seri: Şebeke (v1)')
    expect(lines.some(l => l.startsWith('Kalite durumu filtresi: MISSING_VALUE'))).toBe(true)
    expect(lines.length).toBeLessThanOrEqual(24)
    expect(lines.every(l => l.length <= 140)).toBe(true)
    expect(JSON.stringify(lines)).not.toMatch(/expression/)
  })
})

describe('file names and the builder', () => {
  it('names are header-safe and free of the client input alphabet', () => {
    expect(safeFileSegment('../a b"\r\nX')).toBe('a_b_X')
    expect(safeFileSegment('***')).toBe('export')
    expect(exportFileName('ART/../1', 'CSV', '2026-06-01T00:00:00.000Z')).toBe('scada_ART_1_2026-06-01.csv')
    expect(exportFileName('A', 'XLSX', '2026-06-01T00:00:00.000Z')).toMatch(/\.xlsx$/)
  })

  it('the fallback PDF is a real PDF header, never an HTTP / JSON body', async () => {
    const out = await buildExportFile('PDF', buildAnalysisModel(analysis(), META), undefined)
    expect(out.file.buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(out.rendererMode).toBe('FALLBACK')
  })
})

describe('static guarantees of the export module', () => {
  const dir = path.resolve(__dirname, '..')
  const files = readdirSync(dir).filter(f => f.endsWith('.ts'))
  const code = (f: string) => readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

  it('no export file reads the expression, a physical name or SQL, opens a driver / fs / socket, or logs', () => {
    for (const f of files) {
      const c = code(f)
      expect(c).not.toMatch(/\.expression\b|expression:|\.execute\(|\bsql`|information_schema|from\s+['"](mssql|tedious|pg|fs|node:fs|http|https|net|child_process|vm)['"]|\beval\s*\(|console\.|Logger\b|\w\.table\b|dateColumn|timeColumn/)
    }
  })

  it('introduces no permission code and no new audit action name', () => {
    for (const f of files) {
      const c = code(f)
      expect([...c.matchAll(/['"`]([A-Z]+:[A-Z_]+:[A-Z_]+)['"`]/g)].map(m => m[1])).toEqual([])
      expect([...c.matchAll(/['"`](REPORT_EXPORT_[A-Z_]+|SCADA_QUERY_[A-Z_]+)['"`]/g)].map(m => m[1])).toEqual([])
    }
    const adapter = readFileSync(path.resolve(dir, '../adapter/platform-scada-export-audit.ts'), 'utf8')
    expect([...adapter.matchAll(/['"`](REPORT_EXPORT_[A-Z_]+)['"`]/g)].map(m => m[1]).sort()).toEqual(['REPORT_EXPORT_FAILED', 'REPORT_EXPORT_SUCCEEDED'])
  })
})
