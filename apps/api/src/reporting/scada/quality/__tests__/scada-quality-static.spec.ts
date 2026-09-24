import { readdirSync, readFileSync } from 'fs'
import path from 'path'

const DIR = path.resolve(__dirname, '..')
const prod = readdirSync(DIR).filter(f => f.endsWith('.ts'))
const text = (f: string) => readFileSync(path.join(DIR, f), 'utf8')

describe('SCADA data-quality static guarantees (TASK-027.67)', () => {
  it('has the module files', () => expect(prod).toEqual(expect.arrayContaining(['scada-data-quality.contract.ts', 'scada-counter-rollover.service.ts', 'scada-dst-quality.service.ts', 'rollover-policy.port.ts', 'data-quality.errors.ts', 'scada-data-quality.service.ts'])))
  it('is pure: no driver, ORM, fs, network, process, env, logging, timers or randomness', () => {
    for (const f of prod) {
      expect(text(f)).not.toMatch(/from\s+['"](mssql|tedious|pg|drizzle-orm[^'"]*|fs|node:fs|http|https|net|child_process|@nestjs\/common)['"]|require\(/)
      expect(text(f)).not.toMatch(/process\.env|console\.|Logger|logger\.|Math\.random|Date\.now\(|setTimeout|setInterval|new Date\(\)/)
    }
  })
  it('never selects a policy by column name and never hard-codes a roll-over constant', () => {
    for (const f of prod) {
      expect(text(f)).not.toMatch(/100000|1e5|Turbin|\(S\)|\bFark\b|seriesKey\s*\.\s*(includes|startsWith|endsWith|match|search)\(|new RegExp|\.match\(/)
    }
  })
  it('has no SQL, no audit action, no tenant-rule words and no credential-like strings', () => {
    for (const f of prod) {
      expect(text(f)).not.toMatch(/\b(select|insert|update|delete)\b[^\n]*\b(from|into|set)\b|information_schema|SCADA_QUERY_|platform_audit|platformAudit/i)
      expect(text(f)).not.toMatch(/sirket|mosedas|mosedaş|Server=|Password\s*=|BotToken|Salt/i)
    }
  })
  it('does not silently turn a missing/negative value into 0 (no `?? 0`, `|| 0`, Math.max(0…))', () => {
    for (const f of prod) expect(text(f)).not.toMatch(/\?\?\s*0\b|\|\|\s*0\b|Math\.max\(\s*0|Math\.abs\(/)
  })
})
