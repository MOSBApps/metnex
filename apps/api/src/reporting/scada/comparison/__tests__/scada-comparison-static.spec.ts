import { readdirSync, readFileSync } from 'fs'
import path from 'path'

const DIR = path.resolve(__dirname, '..')
const prod = readdirSync(DIR).filter(f => f.endsWith('.ts'))
const text = (f: string) => readFileSync(path.join(DIR, f), 'utf8')

describe('SCADA comparison static guarantees (TASK-027.69)', () => {
  it('has the module files', () => expect(prod).toEqual(expect.arrayContaining(['scada-comparison.contract.ts', 'scada-comparison.service.ts', 'period-comparison.ts', 'source-comparison.ts', 'comparison-quality.ts', 'comparison-core.ts', 'comparison-math.ts'])))
  it('is pure: no driver, ORM, fs, network, process, env, logging, randomness, clock or timers', () => {
    for (const f of prod) {
      expect(text(f)).not.toMatch(/from\s+['"](mssql|tedious|pg|drizzle-orm[^'"]*|fs|node:fs|http|https|net|child_process|@nestjs\/common)['"]|require\(/)
      expect(text(f)).not.toMatch(/process\.env|console\.|Logger|logger\.|Math\.random|Date\.now\(|setTimeout|setInterval|new Date\(\)/)
    }
  })
  it('never fills a missing value with 0, never pairs by position and has no tolerance/epsilon', () => {
    for (const f of prod) {
      expect(text(f)).not.toMatch(/\?\?\s*0\b|\|\|\s*0\b|Number\.EPSILON|epsilon|tolerance|toleran/i)
      expect(text(f)).not.toMatch(/\[\s*i\s*\]|\.entries\(\)\s*\)\s*\{[^}]*index|zip\(|\.map\(\(\w+,\s*i\)\s*=>\s*[^)]*\[\s*i\s*\]/)
    }
  })
  it('defines no severity order of its own (central 027.67 constant) and no audit action / table / SQL', () => {
    for (const f of prod) {
      expect(text(f)).not.toMatch(/const\s+\w*SEVERITY\w*\s*=|SCADA_QUERY_|platform_audit|platformAudit/)
      expect(text(f)).not.toMatch(/\b(select|insert|update|delete)\b[^\n]*\b(from|into|set)\b|information_schema/i)
    }
  })
  it('names no tenant-rule word and holds no credential-like string', () => {
    for (const f of prod) expect(text(f)).not.toMatch(/sirket|mosedas|mosedaş|Server=|Password\s*=|BotToken|Salt/i)
  })
})
