import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { main } from './dry-run-cli-entry'

const fixturePath = join(__dirname, 'fixtures', 'sample-dry-run-input.json')
const conflictFixturePath = join(__dirname, 'fixtures', 'sample-dry-run-input-conflict.json')

describe('CLI entry — usage errors (exit code 2)', () => {
  let stderrSpy: jest.SpyInstance
  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => stderrSpy.mockRestore())

  it('exits 2 when --input is missing', () => {
    expect(main([])).toBe(2)
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringMatching(/--input/))
  })

  it('exits 2 for an unknown flag', () => {
    expect(main(['--bogus', 'x'])).toBe(2)
  })

  it('exits 2 when the input file does not exist', () => {
    expect(main(['--input', '/nonexistent/path/does-not-exist.json'])).toBe(2)
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringMatching(/okunamadı/))
  })

  it('exits 2 for malformed JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'metnex-cli-test-'))
    const badPath = join(dir, 'bad.json')
    require('fs').writeFileSync(badPath, '{ not valid json')
    try {
      expect(main(['--input', badPath])).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits 2 when required top-level fields are missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'metnex-cli-test-'))
    const badPath = join(dir, 'missing-fields.json')
    require('fs').writeFileSync(badPath, JSON.stringify({ foo: 'bar' }))
    try {
      expect(main(['--input', badPath])).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('CLI entry — real dry-run execution', () => {
  let stdoutSpy: jest.SpyInstance
  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })
  afterEach(() => stdoutSpy.mockRestore())

  it('exits 0 and writes a JSON report to stdout for the successful/mixed fixture', () => {
    const exitCode = main(['--input', fixturePath, '--run-id', 'entry-test-1'])
    expect(exitCode).toBe(0)
    expect(stdoutSpy).toHaveBeenCalledTimes(1)
    const written = stdoutSpy.mock.calls[0][0] as string
    const report = JSON.parse(written)
    expect(report.migrationRunId).toBe('entry-test-1')
    expect(report.applyPerformed).toBe(false)
  })

  it('exits 1 for the conflict fixture and never opens a real DB (no crash, no hang)', () => {
    const exitCode = main(['--input', conflictFixturePath])
    expect(exitCode).toBe(1)
  })

  it('writes the report to --output instead of stdout when given', () => {
    const dir = mkdtempSync(join(tmpdir(), 'metnex-cli-test-'))
    const outPath = join(dir, 'report.json')
    try {
      const exitCode = main(['--input', fixturePath, '--output', outPath])
      expect(exitCode).toBe(0)
      expect(stdoutSpy).not.toHaveBeenCalled()
      const report = JSON.parse(readFileSync(outPath, 'utf8'))
      expect(report.applyPerformed).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
