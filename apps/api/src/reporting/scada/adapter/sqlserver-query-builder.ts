import { assertIdentifier } from '../catalog/catalog-rules'
import type { ExecutionProfile } from '../catalog/catalog.service'
import type { SourceWindow, SourceWindowKind } from '../time/scada-source-time'
import type { SqlServerStatement } from './sqlserver-driver.port'

/** Bracket quoting for an identifier that already passed the catalog's strict identifier pattern. */
export function quoteIdentifier(name: string): string {
  assertIdentifier(name)
  return `[${name.replace(/]/g, ']]')}]`
}

const FORBIDDEN_KEYWORDS = /\b(insert|update|delete|drop|alter|create|truncate|merge|exec|execute|grant|revoke|into|xp_\w*|sp_\w*|waitfor|openrowset|opendatasource)\b/i

/** Last line of defence: the text must be a single plain SELECT. */
export function assertReadOnlyStatement(text: string): void {
  const withoutIdentifiers = text.replace(/\[[^\]]*\]/g, '[]')
  if (!/^SELECT TOP \(@rowCap\) /.test(text) || /[;'"]|--|\/\*/.test(withoutIdentifiers) || FORBIDDEN_KEYWORDS.test(withoutIdentifiers)) {
    throw new Error('STATEMENT_NOT_READ_ONLY')
  }
}

/**
 * Raw time-series read for one catalog table. `window` is the loss-free SOURCE-LOCAL window (see
 * `buildSourceWindow`). Every value (range, row cap) is a bound parameter;
 * every identifier (schema, table, columns) comes from the verified catalog profile. `rowCap` is maxRows + 1 so an overflow is
 * detectable without ever asking for more than one extra row.
 */
export function buildSelectStatement(
  profile: ExecutionProfile,
  window: SourceWindow | { from: Date | string; to: Date | string; kind?: SourceWindowKind }
): SqlServerStatement {
  const columns = profile.columns.map(quoteIdentifier).join(', ')
  const dateColumn = quoteIdentifier(profile.dateColumn)
  const order = profile.timeColumn === profile.dateColumn ? dateColumn : `${dateColumn}, ${quoteIdentifier(profile.timeColumn)}`
  const text = `SELECT TOP (@rowCap) ${columns} FROM ${quoteIdentifier(profile.schema)}.${quoteIdentifier(profile.table)} WHERE ${dateColumn} >= @rangeFrom AND ${dateColumn} < @rangeTo ORDER BY ${order}`
  assertReadOnlyStatement(text)

  const kind: SourceWindowKind = 'kind' in window && window.kind ? window.kind : 'DATETIME2'

  return {
    database: profile.physicalDatabase,
    text,
    params: { rangeFrom: window.from, rangeTo: window.to, rowCap: profile.limitProfile.maxRows + 1 },
    paramTypes: { rangeFrom: kind, rangeTo: kind, rowCap: 'INT' },
  }
}
