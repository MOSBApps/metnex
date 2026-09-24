import { readdirSync, readFileSync } from 'fs'
import path from 'path'

const DIR = path.resolve(__dirname, '..')
const prod = readdirSync(DIR).filter(f => f.endsWith('.ts'))
const text = (f: string) => readFileSync(path.join(DIR, f), 'utf8')
const code = (f: string) => text(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '') // comments may mention the forbidden words

describe('virtual column static guarantees (TASK-027.70)', () => {
  it('has the module files', () => expect(prod).toEqual(expect.arrayContaining(['virtual-column.contract.ts', 'virtual-column-expression.ts', 'virtual-column-parser.ts', 'virtual-column-validator.ts', 'virtual-column-evaluator.ts', 'virtual-column-quality.ts', 'virtual-column.service.ts'])))
  it('runs no dynamic code: no eval, Function constructor, vm, import(), require, child process, timers, fs, network', () => {
    for (const f of prod) {
      expect(code(f)).not.toMatch(/\beval\s*\(|new\s+Function\b|\bFunction\s*\(|from\s+['"](vm|node:vm|fs|node:fs|http|https|net|child_process|worker_threads|mssql|tedious|pg|drizzle-orm[^'"]*|@nestjs\/common)['"]|require\(|\bimport\s*\(|setTimeout|setInterval|process\.env/)
    }
  })
  it('has no clock and no randomness (deterministic)', () => {
    for (const f of prod) expect(code(f)).not.toMatch(/Date\.now\(|new Date\(\)|Math\.random|performance\.now/)
  })
  it('never turns a missing value into 0 (no `?? 0`, `|| 0`)', () => {
    for (const f of prod) expect(code(f)).not.toMatch(/\?\?\s*0\b|\|\|\s*0\b/)
  })
  it('fixes no numeric limit of its own (they come from the contract) and no audit action name (Q-W519)', () => {
    for (const f of prod) {
      expect(code(f)).not.toMatch(/maxExpressionLength\s*[:=]\s*\d|maxAstDepth\s*[:=]\s*\d|maxOperatorCount\s*[:=]\s*\d|maxAbsoluteResult\s*[:=]\s*\d/)
      expect(code(f)).not.toMatch(/SCADA_QUERY_|VIRTUAL_COLUMN_(CREATED|UPDATED|DELETED|EVALUATED)|platform_audit|platformAudit/)
    }
  })
  it('names no tenant-rule word (the shared guard does) and holds no credential-like string or SQL', () => {
    for (const f of prod) {
      expect(text(f)).not.toMatch(/sirket|mosedas|mosedaş|Server=|Password\s*=|BotToken|Salt/i)
      expect(code(f)).not.toMatch(/\b(select|insert|update|delete)\b[^\n]*\b(from|into|set)\b|information_schema/i)
    }
  })
})
