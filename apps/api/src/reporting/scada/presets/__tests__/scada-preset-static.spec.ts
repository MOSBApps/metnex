import { readdirSync, readFileSync } from 'fs'
import path from 'path'

const DIR = path.resolve(__dirname, '..')
const prod = readdirSync(DIR).filter(f => f.endsWith('.ts'))
const text = (f: string) => readFileSync(path.join(DIR, f), 'utf8')
const code = (f: string) => text(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

describe('SCADA preset static guarantees (TASK-027.71)', () => {
  it('has the module files', () => expect(prod).toEqual(expect.arrayContaining(['scada-preset.contract.ts', 'scada-preset.validator.ts', 'scada-preset.service.ts', 'scada-preset-versioning.ts', 'scada-preset-resolver.ts', 'scada-preset-security.ts'])))
  it('is pure: no driver, ORM, fs, network, process, env, logging, timers, clock, randomness or dynamic code', () => {
    for (const f of prod) {
      expect(code(f)).not.toMatch(/from\s+['"](mssql|tedious|pg|drizzle-orm[^'"]*|fs|node:fs|http|https|net|child_process|vm|@nestjs\/common)['"]|require\(|\beval\s*\(|new\s+Function\b|\bimport\s*\(/)
      expect(code(f)).not.toMatch(/process\.env|console\.|Logger|logger\.|Math\.random|Date\.now\(|new Date\(\)|setTimeout|setInterval/)
    }
  })
  it('defines no permission code (Q-W517) and no audit action / entity name (Q-W519)', () => {
    for (const f of prod) {
      expect(code(f)).not.toMatch(/['"`][a-z]+(\.[a-z_]+){1,3}['"`]\s*(,|\)|\])?\s*\/\/\s*permission/i)
      expect(code(f)).not.toMatch(/SCADA_QUERY_|SCADA_PRESET_(CREATED|UPDATED|DELETED|SHARED|RESOLVED)|PRESET_(CREATED|UPDATED|DELETED|SHARED)|platform_audit|platformAudit|permissionCode|PERMISSION_/)
    }
  })
  it('holds no SQL, credential-like string or tenant-rule word (the shared guard does that)', () => {
    for (const f of prod) {
      expect(code(f)).not.toMatch(/\b(select|insert|update|delete)\b[^\n]*\b(from|into|set)\b|information_schema/i)
      expect(text(f)).not.toMatch(/sirket|mosedas|mosedaş|Server=\w|Password\s*=\s*\w|BotToken|PasswordSalt/i)
    }
  })
  it('never turns a missing value into a default (no `?? 0`, `|| 0`)', () => {
    for (const f of prod) expect(code(f)).not.toMatch(/\?\?\s*0\b|\|\|\s*0\b/)
  })
})
