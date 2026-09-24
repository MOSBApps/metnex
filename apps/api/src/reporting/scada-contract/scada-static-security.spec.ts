import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * TASK-027.58 — static security scans over the real source tree. They need no SQL Server, no
 * Docker and no secrets: they pin properties of the repository itself.
 *
 * "Production file" below = a `.ts` file under apps/api/src that is not a spec and not part of the
 * test-only `scada-contract/` directory.
 */
const API_ROOT = path.resolve(__dirname, '../../..')
const SRC = path.join(API_ROOT, 'src')
const REPO_ROOT = path.resolve(API_ROOT, '../..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/')
const isSpec = (file: string) => file.endsWith('.spec.ts') || file.endsWith('.spec.tsx')
const productionFiles = walk(SRC).filter(file => !isSpec(file) && !rel(file).startsWith('reporting/scada-contract/'))
const read = (file: string) => readFileSync(file, 'utf8')
const offenders = (files: string[], pattern: RegExp) => files.filter(file => pattern.test(read(file))).map(rel)

describe('SCADA/DMS static security scans (TASK-027.58)', () => {
  it('BLOCKER EVIDENCE: no SQL Server driver dependency and no driver import exists — there is no real adapter to test yet', () => {
    const pkg = JSON.parse(readFileSync(path.join(API_ROOT, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(declared.filter(name => /^(mssql|tedious|msnodesqlv8|node-mssql)$/.test(name))).toEqual([])
    expect(offenders(productionFiles, /from\s+['"](mssql|tedious|msnodesqlv8)['"]|require\(['"](mssql|tedious|msnodesqlv8)['"]\)/)).toEqual([])
  })

  it('no production SCADA adapter/provider/port/catalog symbol is declared outside the bounded module `reporting/scada/`', () => {
    // TASK-027.64: the SCADA bounded module (`reporting/scada/`) now legitimately declares its port/adapter symbols; nowhere else may.
    expect(offenders(productionFiles.filter(file => !rel(file).startsWith('reporting/scada/')), /\b(class|interface|abstract class|const|function|type)\s+\w*Scada\w*/)).toEqual([])
  })

  it('no production code performs runtime INFORMATION_SCHEMA discovery', () => {
    expect(offenders(productionFiles, /information_schema/i)).toEqual([])
  })

  it('no production authorization/scope/reporting/audit code reads or names the Sirket field (only the identity-migration source type may declare it)', () => {
    const guarded = productionFiles.filter(file => !rel(file).startsWith('migration/'))
    expect(offenders(guarded, /sirket/i)).toEqual([])
  })

  it('no production code outside the identity-migration source mapping references MOSEDAŞ — it is not created or modelled as a tenant', () => {
    // The catalog tenant guard names it only to REJECT it (DEC-0014/DEC-0015 Q-SC01 C) — the single allowed exception.
    const guarded = productionFiles.filter(file => !rel(file).startsWith('migration/') && rel(file) !== 'reporting/scada/catalog/tenant-guards.ts')
    expect(offenders(guarded, /mosedas|mosedaş/i)).toEqual([])
  })

  it('the checked-in SQL migrations never insert a MOSEDAŞ tenant', () => {
    const migrationsDir = path.join(API_ROOT, 'drizzle')
    const sqlFiles: string[] = []
    const collect = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name)
        if (statSync(full).isDirectory()) collect(full)
        else if (full.endsWith('.sql')) sqlFiles.push(full)
      }
    }
    collect(migrationsDir)
    expect(sqlFiles.length).toBeGreaterThan(0)
    expect(sqlFiles.filter(file => /mosedas|mosedaş/i.test(readFileSync(file, 'utf8')))).toEqual([])
  })

  it('reporting core never executes raw SQL (it only reaches data through a dataset provider)', () => {
    const reporting = productionFiles.filter(file => rel(file).startsWith('reporting/'))
    expect(reporting.length).toBeGreaterThan(0)
    expect(offenders(reporting, /\.execute\(|\bsql`|\.query\(/)).toEqual([])
  })

  it('the test-only reference port / contract helpers are not imported by any production file', () => {
    expect(offenders(productionFiles, /scada-contract|reference-scada-port|scada-readonly-port/)).toEqual([])
  })

  it('the web app never references a SQL Server driver, a SQL Server connection string or SCADA credentials', () => {
    const webSrc = path.join(REPO_ROOT, 'apps/web/src')
    const files = walk(webSrc).filter(file => !file.endsWith('.spec.ts') && !file.endsWith('.spec.tsx'))
    const hits = files.filter(file => /from\s+['"](mssql|tedious)['"]|Server=[^;]+;.*(Password|User Id)=|SCADA_[A-Z_]*(PASSWORD|CONNECTION|SECRET)/i.test(read(file)))
    expect(hits).toEqual([])
  })

  it('no synthetic/demo SCADA provider is registered: reporting module registers no provider by default (DEC-0012)', () => {
    // TASK-027.72: the module may name the SCADA API controller and its provider registration function — nothing else. The
    // simulation classes, port tokens and any provider of real / synthetic SCADA data stay out of the module file (the
    // registration function only adds the simulation behind isDevFixtureEnabled; scada-api-wiring.spec.ts pins that).
    const moduleSource = read(path.join(SRC, 'reporting/reporting.module.ts'))
    const mentions = [...moduleSource.matchAll(/\w*scada\w*/gi)].map(m => m[0]).filter((name, i, all) => all.indexOf(name) === i).sort()
    expect(mentions).toEqual(['scadaApiControllers', 'scada', 'scadaApiProviders'].sort()) // 'scada' = the two import path segments
  })
})
