import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { main } from './reconcile-cli-entry'

const fixturePath = join(__dirname, 'fixtures', 'sample-dry-run-input.json')
const conflictFixturePath = join(__dirname, 'fixtures', 'sample-dry-run-input-conflict.json')

describe('reconcile CLI entry — usage errors (exit code 2)', () => {
  let stderrSpy: jest.SpyInstance
  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => stderrSpy.mockRestore())

  it('exits 2 when --before/--after are missing', () => {
    expect(main([])).toBe(2)
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringMatching(/--before/))
  })

  it('exits 2 when only --before is given', () => {
    expect(main(['--before', fixturePath])).toBe(2)
  })

  it('exits 2 for an unknown flag', () => {
    expect(main(['--before', fixturePath, '--after', fixturePath, '--bogus', 'x'])).toBe(2)
  })

  it('exits 2 when a fixture file does not exist', () => {
    expect(main(['--before', '/nonexistent.json', '--after', fixturePath])).toBe(2)
  })

  it('exits 2 for malformed JSON in --after', () => {
    const dir = mkdtempSync(join(tmpdir(), 'metnex-reconcile-test-'))
    const badPath = join(dir, 'bad.json')
    writeFileSync(badPath, '{ not json')
    try {
      expect(main(['--before', fixturePath, '--after', badPath])).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('reconcile CLI entry — real execution', () => {
  let stdoutSpy: jest.SpyInstance
  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })
  afterEach(() => stdoutSpy.mockRestore())

  it('exits 0 and reports UNRESOLVED for identical --before/--after fixtures (the fixture has a permanently-unresolved user by design)', () => {
    // sample-dry-run-input.json intentionally includes an unresolved-tenant user (legacyId '2')
    // with no approved mapping entry at all — comparing it to itself is a genuine no-change
    // comparison, but the overall status correctly still surfaces UNRESOLVED (it takes priority
    // over "nothing changed" — an unresolved user is never something to silently report as fine).
    const exitCode = main(['--before', fixturePath, '--after', fixturePath])
    expect(exitCode).toBe(0)
    const written = stdoutSpy.mock.calls[0][0] as string
    const report = JSON.parse(written)
    expect(report.reconciliationStatus).toBe('UNRESOLVED')
    expect(report.added).toEqual([])
    expect(report.removed).toEqual([])
    expect(report.changed).toEqual([])
  })

  it('exits 1 and reports BLOCKED when --after is the conflict fixture', () => {
    const exitCode = main(['--before', fixturePath, '--after', conflictFixturePath])
    expect(exitCode).toBe(1)
    const report = JSON.parse(stdoutSpy.mock.calls[0][0] as string)
    expect(report.reconciliationStatus).toBe('BLOCKED')
  })

  it('writes the report to --output instead of stdout when given', () => {
    const dir = mkdtempSync(join(tmpdir(), 'metnex-reconcile-test-'))
    const outPath = join(dir, 'reconciliation.json')
    try {
      const exitCode = main(['--before', fixturePath, '--after', fixturePath, '--output', outPath])
      expect(exitCode).toBe(0)
      expect(stdoutSpy).not.toHaveBeenCalled()
      const report = JSON.parse(readFileSync(outPath, 'utf8'))
      expect(report.reconciliationStatus).toBe('UNRESOLVED') // same fixture-vs-itself caveat as above
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
