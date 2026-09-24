import { readdirSync, readFileSync } from 'fs'
import path from 'path'

const DIR = path.resolve(__dirname, '..')
const prod = readdirSync(DIR).filter(f => f.endsWith('.ts'))
const text = (f: string) => readFileSync(path.join(DIR, f), 'utf8')

describe('SCADA multi-series static guarantees (TASK-027.68)', () => {
  it('has the module files', () => expect(prod).toEqual(expect.arrayContaining(['scada-series.contract.ts', 'scada-multi-series.service.ts', 'series-statistics.ts', 'series-quality.ts', 'series-rollup.ts', 'series-adapters.ts'])))
  it('is pure: no driver, ORM, fs, network, process, env, logging, randomness, clock or timers', () => {
    for (const f of prod) {
      expect(text(f)).not.toMatch(/from\s+['"](mssql|tedious|pg|drizzle-orm[^'"]*|fs|node:fs|http|https|net|child_process|@nestjs\/common)['"]|require\(/)
      expect(text(f)).not.toMatch(/process\.env|console\.|Logger|logger\.|Math\.random|Date\.now\(|setTimeout|setInterval|new Date\(\)/)
    }
  })
  it('never turns a missing value into 0 (no `?? 0`, `|| 0`, `Number(null)`)', () => {
    for (const f of prod) expect(text(f)).not.toMatch(/\?\?\s*0\b|\|\|\s*0\b|Number\(\s*null|Math\.max\(\s*0/)
  })
  it('defines no severity order of its own (it uses the central 027.67 constant) and no audit action / table', () => {
    for (const f of prod) {
      expect(text(f)).not.toMatch(/const\s+\w*SEVERITY\w*\s*=|SCADA_QUERY_|platform_audit|platformAudit/)
      expect(text(f)).not.toMatch(/\b(select|insert|update|delete)\b[^\n]*\b(from|into|set)\b|information_schema/i)
    }
    expect(text('series-quality.ts')).toMatch(/mostCritical/)
  })
  it('names no tenant-rule word (the shared guard does that) and holds no credential-like string', () => {
    for (const f of prod) expect(text(f)).not.toMatch(/sirket|mosedas|mosedaş|Server=|Password\s*=|BotToken|Salt/i)
  })
})
