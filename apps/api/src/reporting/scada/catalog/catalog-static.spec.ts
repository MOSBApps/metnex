import { readdirSync, readFileSync } from 'fs'
import path from 'path'

const DIR = __dirname
const prod = readdirSync(DIR).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
const text = (f: string) => readFileSync(path.join(DIR, f), 'utf8')

describe('SCADA catalog static guarantees (TASK-027.63)', () => {
  it('has production files', () => expect(prod.length).toBeGreaterThanOrEqual(6))
  it('never imports a database driver, ORM, network or fs module — mock/in-memory contract only', () => {
    for (const f of prod) expect(text(f)).not.toMatch(/from\s+['"](mssql|tedious|pg|drizzle-orm[^'"]*|fs|http|https|net|child_process)['"]|require\(/)
  })
  it('contains no SQL text and no INFORMATION_SCHEMA discovery', () => {
    for (const f of prod) expect(text(f)).not.toMatch(/\b(select|insert|update|delete)\b[^\n]*\b(from|into|set)\b|information_schema/i)
  })
  it('has no default/free authoriser and never derives ids from names', () => {
    const svc = text('catalog.service.ts')
    expect(svc).not.toMatch(/authorize:\s*async\s*\(\)\s*=>\s*true/)
    expect(svc).not.toMatch(/newId\(\s*[a-zA-Z]/)
  })
  it('VERIFIED is assigned only inside applyPreflight', () => {
    const svc = text('catalog.service.ts')
    const assignments = svc.match(/verification\s*=\s*'VERIFIED'|verification:\s*'VERIFIED'/g) ?? []
    expect(assignments).toHaveLength(2) // source-level + column-level, both in applyPreflight
    const start = svc.indexOf('applyPreflight(')
    const end = svc.indexOf('blockSource(')
    for (const m of svc.matchAll(/verification\s*=\s*'VERIFIED'|verification:\s*'VERIFIED'/g)) {
      expect(m.index!).toBeGreaterThan(start)
      expect(m.index!).toBeLessThan(end)
    }
  })
  it('holds no credential-like values', () => {
    for (const f of prod) expect(text(f)).not.toMatch(/password\s*=|Server=|Data Source=|BotToken|Salt/i)
  })
})
