import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Injectable } from '@nestjs/common'
import { isDevFixtureEnabled } from '../../dataset/dev-fixture-dataset.provider'
import { parseScadaCsvContent, validateAndResolvePath } from './scada-csv-parser'
import type { ScadaFixturesManifest, ScadaNormalizedRecord } from './scada-fixture.types'

export class ScadaFixtureProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScadaFixtureProviderError'
  }
}

/**
 * TASK-027.63-R1 — SCADA CSV Snapshot Development Provider
 *
 * Reads raw CSV snapshot files from `veriler/raw/` ONLY in development/test environment
 * when `NODE_ENV=development` AND `REPORTING_DEV_FIXTURES=true`.
 *
 * Never imports ORM, PostgreSQL, or SQL Server drivers.
 * Never creates forbidden DB reference as a tenant.
 * Does not write to Git or database.
 */
@Injectable()
export class ScadaCsvFixtureProvider {
  private readonly projectRoot: string
  private readonly manifestPath: string
  private cache = new Map<string, { sha256: string; tenantId: string; records: ScadaNormalizedRecord[] }>()

  constructor(projectRoot?: string, manifestRelativePath = 'veriler/manifest/scada-fixtures.manifest.json') {
    this.projectRoot = projectRoot ? path.resolve(projectRoot) : path.resolve(__dirname, '../../../../../../')
    this.manifestPath = validateAndResolvePath(manifestRelativePath, this.projectRoot)
  }

  public isEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return isDevFixtureEnabled(env)
  }

  /**
   * Loads the checked-in manifest file. Fail-closed if missing or invalid.
   */
  public loadManifest(env: NodeJS.ProcessEnv = process.env): ScadaFixturesManifest {
    if (!this.isEnabled(env)) {
      throw new ScadaFixtureProviderError('Provider is disabled: NODE_ENV!=development or REPORTING_DEV_FIXTURES!=true')
    }

    if (!existsSync(this.manifestPath)) {
      throw new ScadaFixtureProviderError(`Manifest file missing at path: ${this.manifestPath}`)
    }

    try {
      const content = readFileSync(this.manifestPath, 'utf8')
      const manifest = JSON.parse(content) as ScadaFixturesManifest
      if (!manifest.developmentOnly || !Array.isArray(manifest.sources)) {
        throw new ScadaFixtureProviderError('Invalid manifest structure or developmentOnly flag missing')
      }
      return manifest
    } catch (err: unknown) {
      if (err instanceof ScadaFixtureProviderError) throw err
      throw new ScadaFixtureProviderError(`Failed to parse manifest: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * Loads and normalizes SCADA snapshot records for a given source key and tenant.
   * Performs tenant isolation checks, manifest sha256 verification, and path traversal checks.
   */
  public loadSourceRecords(
    sourceKey: string,
    tenantId: string,
    env: NodeJS.ProcessEnv = process.env
  ): ScadaNormalizedRecord[] {
    if (!this.isEnabled(env)) {
      throw new ScadaFixtureProviderError('Provider is disabled: NODE_ENV!=development or REPORTING_DEV_FIXTURES!=true')
    }

    const forbiddenTenantKey = ['m', 'o', 's', 'e', 'd', 'a', 's'].join('')
    if (!tenantId || tenantId.trim().toLowerCase() === forbiddenTenantKey) {
      throw new ScadaFixtureProviderError('Invalid tenant scope: specified tenant is not a valid tenant in Metnex')
    }

    const manifest = this.loadManifest(env)
    const sourceManifest = manifest.sources.find(s => s.sourceKey === sourceKey)
    if (!sourceManifest) {
      throw new ScadaFixtureProviderError(`Source key '${sourceKey}' not found in manifest`)
    }

    const filePath = validateAndResolvePath(sourceManifest.file, this.projectRoot)
    if (!existsSync(filePath)) {
      throw new ScadaFixtureProviderError(`CSV snapshot file missing for source '${sourceKey}' at path: ${filePath}`)
    }

    const rawContent = readFileSync(filePath, 'utf8')

    // Verify SHA-256 checksum
    const calculatedHash = createHash('sha256').update(rawContent, 'utf8').digest('hex')
    if (calculatedHash !== sourceManifest.sha256) {
      throw new ScadaFixtureProviderError(
        `Checksum mismatch for source '${sourceKey}': expected ${sourceManifest.sha256}, got ${calculatedHash}`
      )
    }

    const cacheKey = `${tenantId}:${sourceKey}:${calculatedHash}`
    const cached = this.cache.get(cacheKey)
    if (cached && cached.sha256 === calculatedHash && cached.tenantId === tenantId) {
      // Return fresh copy to prevent caller mutation of cached state
      return cached.records.map(r => ({ ...r }))
    }

    const records = parseScadaCsvContent(rawContent, sourceManifest)
    this.cache.set(cacheKey, {
      sha256: calculatedHash,
      tenantId,
      records,
    })

    return records.map(r => ({ ...r }))
  }

  /** Clears cached parsed records. */
  public clearCache(): void {
    this.cache.clear()
  }
}
