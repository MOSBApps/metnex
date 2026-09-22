import { INT4_MAX, isValidId, type InputValidation } from '../platform/domain/platform-input.domain'

/**
 * Pure validators for the performance-admin query, path and body inputs (Q-DP21). Applied rules are
 * those the existing code proves: numeric query values are non-negative integers within the DB integer
 * range (the controller already clamps limits and defaults 50/30 — that behaviour is unchanged),
 * dates must parse as dates (the controller builds `new Date(...)`), ids use the platform id format,
 * and `queryHash` is exactly what db.service generates: the first 16 hex chars of a sha256. Not
 * imposed (unproven, open decisions): from<=to ordering, route length, status-code range, and a
 * minimum/maximum for slowRequestThresholdMs beyond the DB integer range (the UI's min 100 is UI-only).
 */
const QUERY_HASH_PATTERN = /^[0-9a-f]{16}$/
const DIGITS = /^\d{1,10}$/

const isString = (value: unknown): value is string => typeof value === 'string'
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const done = (errors: string[]): InputValidation => ({ valid: errors.length === 0, errors })
const INVALID_BODY = done(['Geçersiz istek gövdesi'])

function intQuery(errors: string[], value: unknown, label: string) {
  // An empty value counts as absent: the controller already treats it as "use the default / no filter".
  if (value === undefined || value === '') return
  if (!isString(value) || !DIGITS.test(value) || Number(value) > INT4_MAX) errors.push(`${label} geçersiz`)
}

function idQuery(errors: string[], value: unknown, label: string) {
  if (value === undefined || value === '') return
  if (!isValidId(value)) errors.push(`${label} geçersiz`)
}

function dateQuery(errors: string[], value: unknown, label: string) {
  if (value === undefined || value === '') return
  if (!isString(value) || Number.isNaN(new Date(value).getTime())) errors.push(`${label} geçerli bir tarih olmalıdır`)
}

export function validateSlowRequestsQuery(query: unknown): InputValidation {
  if (!isPlainObject(query)) return INVALID_BODY
  const errors: string[] = []
  intQuery(errors, query['limit'], 'limit')
  intQuery(errors, query['offset'], 'offset')
  idQuery(errors, query['tenantId'], 'tenantId')
  if (query['route'] !== undefined && !isString(query['route'])) errors.push('route metin olmalıdır')
  intQuery(errors, query['statusCode'], 'statusCode')
  dateQuery(errors, query['from'], 'from')
  dateQuery(errors, query['to'], 'to')
  return done(errors)
}

export function validateSlowQueriesQuery(query: unknown): InputValidation {
  if (!isPlainObject(query)) return INVALID_BODY
  const errors: string[] = []
  intQuery(errors, query['limit'], 'limit')
  intQuery(errors, query['offset'], 'offset')
  idQuery(errors, query['tenantId'], 'tenantId')
  return done(errors)
}

export function validatePerfId(value: unknown): InputValidation {
  return done(isValidId(value) ? [] : ['Kimlik geçersiz'])
}

export function validateExplainBody(input: unknown): InputValidation {
  if (!isPlainObject(input)) return INVALID_BODY
  const hash = input['queryHash']
  return done(isString(hash) && QUERY_HASH_PATTERN.test(hash) ? [] : ['queryHash geçersiz'])
}

export function validatePerfSettingsBody(input: unknown): InputValidation {
  if (!isPlainObject(input)) return INVALID_BODY
  const errors: string[] = []
  const threshold = input['slowRequestThresholdMs']
  if (threshold !== undefined && (typeof threshold !== 'number' || !Number.isInteger(threshold) || threshold < -2_147_483_648 || threshold > INT4_MAX)) {
    errors.push('slowRequestThresholdMs tam sayı olmalıdır')
  }
  if (input['dbTraceEnabled'] !== undefined && typeof input['dbTraceEnabled'] !== 'boolean') errors.push('dbTraceEnabled true/false olmalıdır')
  return done(errors)
}
