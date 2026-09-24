import { readdirSync, readFileSync } from 'fs'
import path from 'path'

const DIR = __dirname
const prod = readdirSync(DIR).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
const text = (f: string) => readFileSync(path.join(DIR, f), 'utf8')
const core = prod.filter(f => f !== 'platform-scada-query-audit.ts')

describe('SCADA adapter static guarantees (TASK-027.64)', () => {
  it('has production files', () => expect(prod.length).toBeGreaterThanOrEqual(6))
  it('imports no SQL Server driver, ORM, fs, network or process module (driver is a port; no dependency added)', () => {
    for (const f of core) expect(text(f)).not.toMatch(/from\s+['"](mssql|tedious|msnodesqlv8|pg|drizzle-orm[^'"]*|fs|http|https|net|child_process)['"]|require\(/)
  })
  it('never reads process.env or holds credential-like strings', () => {
    for (const f of prod) expect(text(f)).not.toMatch(/process\.env|Server=|Data Source=|Password\s*=|BotToken|Salt/i)
  })
  it('has no INFORMATION_SCHEMA discovery and executes SQL only through the driver port', () => {
    for (const f of prod) expect(text(f)).not.toMatch(/information_schema|\.execute\(|\.query\(|sql`/i)
  })
  it('only the query builder contains SQL text; no DML/DDL keyword text anywhere else', () => {
    for (const f of prod.filter(f => f !== 'sqlserver-query-builder.ts')) expect(text(f)).not.toMatch(/\bSELECT\b\s+(TOP|\[|\*)|\b(INSERT INTO|DELETE FROM|DROP TABLE|TRUNCATE)\b/)
  })
  it('never names the tenant-rule words the guards own', () => {
    for (const f of prod) expect(text(f)).not.toMatch(/sirket|mosedas|mosedaş/i)
  })
})
