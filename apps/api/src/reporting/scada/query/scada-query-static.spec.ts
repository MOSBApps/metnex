import { readdirSync, readFileSync } from 'fs'
import path from 'path'

const DIR = __dirname
const prod = readdirSync(DIR).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
const text = (f: string) => readFileSync(path.join(DIR, f), 'utf8')

describe('SCADA analysis query static guarantees (TASK-027.65)', () => {
  it('has production files', () => expect(prod).toEqual(expect.arrayContaining(['scada-analysis-query.service.ts', 'scada-time-window.service.ts', 'scada-query.errors.ts', 'scada-analysis-query.contract.ts'])))
  it('imports no driver, ORM, fs, network, process or logging module (it only talks to the adapter port and the catalog)', () => {
    for (const f of prod) expect(text(f)).not.toMatch(/from\s+['"](mssql|tedious|msnodesqlv8|pg|drizzle-orm[^'"]*|fs|node:fs|http|https|net|child_process|@nestjs\/common)['"]|require\(/)
  })
  it('contains no SQL text, no INFORMATION_SCHEMA, no raw-query execution', () => {
    for (const f of prod) expect(text(f)).not.toMatch(/\b(select|insert|update|delete)\b[^\n]*\b(from|into|set)\b|information_schema|\.execute\(|\.query\(|sql`/i)
  })
  it('never logs (rows, requests or errors): no console / Logger use', () => {
    for (const f of prod) expect(text(f)).not.toMatch(/console\.|Logger|logger\./)
  })
  it('holds no credential-like values and never reads the environment', () => {
    for (const f of prod) expect(text(f)).not.toMatch(/process\.env|Server=|Data Source=|Password\s*=|BotToken|Salt|connectionString\s*[:=]\s*['"]/i)
  })
  it('never names the tenant-rule words the catalog guards own, and defines no audit action / table', () => {
    for (const f of prod) {
      expect(text(f)).not.toMatch(/sirket|mosedas|mosedaş/i)
      expect(text(f)).not.toMatch(/SCADA_QUERY_(SUCCEEDED|DENIED|FAILED)|platform_audit_logs|platformAudit/)
    }
  })
  it('has no numeric default for the Q-W521 buffer (no literal buffer/hour constants in the service)', () => {
    const src = text('scada-analysis-query.service.ts') + text('scada-time-window.service.ts')
    expect(src).not.toMatch(/forwardBufferMs\s*(\?\?|\|\||=|:)\s*\d/)
    expect(src).not.toMatch(/buffer\w*\s*(=|:)\s*[1-9]/i) // 0 = "no buffer" (REAL_VALUE), never a default amount
  })
  it('delta / aggregation / roll-over / clamping are not implemented here', () => {
    for (const f of prod) expect(text(f)).not.toMatch(/\bLEAD\b|Math\.max\(\s*0|rollover|roll-over\s*\(|\bgroupBy\b|\breduce\(/i)
  })
})
