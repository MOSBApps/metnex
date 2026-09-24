import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('ScadaAggregationEngine Static Security Scans (TASK-027.66)', () => {
  const targetDir = path.resolve(__dirname, '..')

  const files = [
    path.join(targetDir, 'scada-aggregation.contract.ts'),
    path.join(targetDir, 'scada-aggregation.service.ts'),
    path.join(targetDir, 'hourly-aggregation.ts'),
    path.join(targetDir, 'daily-aggregation.ts'),
    path.join(targetDir, 'negative-delta.policy.ts'),
  ]

  it('1. no production file imports SQL drivers, PostgreSQL or ORM', () => {
    for (const file of files) {
      const code = readFileSync(file, 'utf8')
      expect(code).not.toMatch(/from\s+['"](mssql|tedious|pg|drizzle-orm)['"]/)
      expect(code).not.toMatch(/require\(['"](mssql|tedious|pg|drizzle-orm)['"]\)/)
    }
  })

  it('2. no production code executes raw SQL queries', () => {
    for (const file of files) {
      const code = readFileSync(file, 'utf8')
      expect(code).not.toMatch(/\.query\(|\.execute\(|\bsql`/)
    }
  })

  it('3. no production code contains hardcoded credentials, secret keys, or connection strings', () => {
    for (const file of files) {
      const code = readFileSync(file, 'utf8')
      expect(code).not.toMatch(/Password=|User Id=|SecretKey=|DATABASE_URL=/i)
    }
  })
})
