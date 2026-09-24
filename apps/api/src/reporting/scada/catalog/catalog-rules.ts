import type { DeclaredTable, LimitProfile, ObservedColumnClass, ColumnKind } from './catalog.types'

/** Stable error type: only a static code, never data-derived text. */
export class CatalogError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'CatalogError'
  }
}

export const CATALOG_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Physical database names are kept EXACTLY as approved (DEC-0016 Q-W525): spaces are allowed
 * (`MOSB ENERJI DB`), nothing is normalised, and a name that differs only by `_` vs space is a
 * DIFFERENT database. The character set is deliberately narrow (defence in depth — the profile is
 * admin-curated and the adapter must additionally use the driver's safe identifier mechanism).
 */
const PHYSICAL_DB_PATTERN = /^[\p{L}\p{N}_.-]+(?: [\p{L}\p{N}_.-]+)*$/u
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
const MAX_DB_NAME_LENGTH = 128
const MAX_DISPLAY_NAME_LENGTH = 200
const LIMIT_KEYS: ReadonlyArray<keyof LimitProfile> = ['timeoutMs', 'maxRows', 'maxColumns', 'maxPayloadBytes', 'maxRangeMs', 'poolSize', 'maxConcurrent']

export function isCatalogId(value: unknown): value is string {
  return typeof value === 'string' && CATALOG_ID_PATTERN.test(value)
}

export function assertPhysicalDatabaseName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.length === 0 || name.length > MAX_DB_NAME_LENGTH || !PHYSICAL_DB_PATTERN.test(name)) {
    throw new CatalogError('INVALID_PHYSICAL_DATABASE_NAME')
  }
}

export function assertDisplayName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > MAX_DISPLAY_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new CatalogError('INVALID_DISPLAY_NAME')
  }
}

export function assertIdentifier(name: unknown, code = 'INVALID_IDENTIFIER'): asserts name is string {
  if (typeof name !== 'string' || !IDENTIFIER_PATTERN.test(name)) throw new CatalogError(code)
}

/** IANA zone names only (`Europe/Istanbul`, `UTC`); bare offsets and free text are rejected. */
export function assertTimeZone(zone: unknown): asserts zone is string {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64 || /^[+-]?\d/.test(zone) || !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(zone)) {
    throw new CatalogError('INVALID_TIME_ZONE')
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
  } catch {
    throw new CatalogError('INVALID_TIME_ZONE')
  }
}

/** Every limit must be present and a positive safe integer; unknown keys and missing keys are rejected. No defaults. */
export function assertLimitProfile(profile: unknown): asserts profile is LimitProfile {
  if (!profile || typeof profile !== 'object') throw new CatalogError('LIMIT_PROFILE_INCOMPLETE')
  const record = profile as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!LIMIT_KEYS.includes(key as keyof LimitProfile)) throw new CatalogError('LIMIT_PROFILE_UNKNOWN_KEY')
  }
  for (const key of LIMIT_KEYS) {
    const value = record[key]
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new CatalogError('LIMIT_PROFILE_INCOMPLETE')
  }
  if ((record['maxConcurrent'] as number) > (record['poolSize'] as number)) throw new CatalogError('LIMIT_PROFILE_INCONSISTENT')
}

export function isLimitProfileComplete(profile: LimitProfile | null): boolean {
  if (!profile) return false
  try {
    assertLimitProfile(profile)
    return true
  } catch {
    return false
  }
}

const TIME_KINDS: ReadonlyArray<ColumnKind> = ['DATE', 'TIME', 'DATETIME']

export function assertDeclaredTables(tables: unknown): asserts tables is DeclaredTable[] {
  if (!Array.isArray(tables)) throw new CatalogError('INVALID_TABLES')
  const seenTables = new Set<string>()
  for (const table of tables as DeclaredTable[]) {
    if (!table || typeof table !== 'object') throw new CatalogError('INVALID_TABLES')
    assertIdentifier(table.name, 'INVALID_TABLE_NAME')
    if (table.schema !== undefined && table.schema !== null) assertIdentifier(table.schema, 'INVALID_SCHEMA_NAME')
    if (seenTables.has(table.name)) throw new CatalogError('DUPLICATE_TABLE')
    seenTables.add(table.name)
    if (!Array.isArray(table.columns) || table.columns.length === 0) throw new CatalogError('INVALID_COLUMNS')
    const kinds = new Map<string, ColumnKind>()
    for (const column of table.columns) {
      assertIdentifier(column?.name, 'INVALID_COLUMN_NAME')
      if (kinds.has(column.name)) throw new CatalogError('DUPLICATE_COLUMN')
      if (!['NUMERIC', 'DATE', 'TIME', 'DATETIME', 'OTHER'].includes(column.kind)) throw new CatalogError('INVALID_COLUMN_KIND')
      kinds.set(column.name, column.kind)
    }
    for (const ref of [table.dateColumn, table.timeColumn]) {
      const kind = kinds.get(ref)
      if (!kind || !TIME_KINDS.includes(kind)) throw new CatalogError('INVALID_DATE_TIME_COLUMN')
    }
    if (table.dateColumn === table.timeColumn && kinds.get(table.dateColumn) !== 'DATETIME') throw new CatalogError('INVALID_DATE_TIME_COLUMN')
  }
}

const COMPATIBLE: Record<ColumnKind, ReadonlyArray<ObservedColumnClass>> = {
  NUMERIC: ['NUMERIC'],
  DATE: ['DATE', 'DATETIME'],
  TIME: ['TIME', 'DATETIME'],
  DATETIME: ['DATETIME'],
  OTHER: ['NUMERIC', 'DATE', 'TIME', 'DATETIME', 'TEXT', 'OTHER'],
}

export function isObservedClassCompatible(declared: ColumnKind, observed: ObservedColumnClass | null): boolean {
  return observed !== null && COMPATIBLE[declared].includes(observed)
}
