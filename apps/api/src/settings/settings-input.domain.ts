import { INT4_MAX, isValidId, type InputValidation } from '../platform/domain/platform-input.domain'

/**
 * Pure validators for the platform/tenant settings upsert bodies (Q-DP21). Only rules proven by the
 * existing code, DB schema or UI are applied: value types (the services already treat text fields as
 * strings, port/booleans as their column types), and the integer range of the `port` column. No
 * maximum length, e-mail/URL/port-range or provider-enum rule is imposed — none is proven; those stay
 * open decisions. Messages are static: no host, username, password or API key is ever echoed.
 */
const INT4_MIN = -2_147_483_648

const isString = (value: unknown): value is string => typeof value === 'string'
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const done = (errors: string[]): InputValidation => ({ valid: errors.length === 0, errors })
const INVALID_BODY = done(['Geçersiz istek gövdesi'])

/** Optional text; `null` is accepted where the service already clears the value with it. */
function text(errors: string[], value: unknown, label: string, allowNull: boolean) {
  if (value === undefined) return
  if (value === null && allowNull) return
  if (!isString(value)) errors.push(`${label} metin olmalıdır`)
}

function flag(errors: string[], value: unknown, label: string) {
  if (value !== undefined && typeof value !== 'boolean') errors.push(`${label} true/false olmalıdır`)
}

export function validatePlatformGeneral(input: unknown): InputValidation {
  if (!isPlainObject(input)) return INVALID_BODY
  const errors: string[] = []
  text(errors, input['name'], 'Ad', true)
  // The service calls .trim() on these two, so null would crash it today: reject instead.
  text(errors, input['shortName'], 'Kısa ad', false)
  text(errors, input['address'], 'Adres', false)
  return done(errors)
}

/** Platform SMTP and tenant SMTP override share one body shape. */
export function validateSmtpSettings(input: unknown): InputValidation {
  if (!isPlainObject(input)) return INVALID_BODY
  const errors: string[] = []
  flag(errors, input['notificationsEnabled'], 'notificationsEnabled')
  flag(errors, input['secure'], 'secure')
  text(errors, input['host'], 'Sunucu', true)
  text(errors, input['username'], 'Kullanıcı adı', true)
  text(errors, input['password'], 'Parola', true)
  text(errors, input['fromName'], 'Gönderen adı', true)
  text(errors, input['fromEmail'], 'Gönderen e-postası', true)
  const port = input['port']
  if (port !== undefined && port !== null) {
    if (typeof port !== 'number' || !Number.isInteger(port) || port < INT4_MIN || port > INT4_MAX) errors.push('Port tam sayı olmalıdır')
  }
  return done(errors)
}

/** Platform AI provider and tenant AI override share one body shape. */
export function validateAiSettings(input: unknown): InputValidation {
  if (!isPlainObject(input)) return INVALID_BODY
  const errors: string[] = []
  text(errors, input['providerType'], 'Sağlayıcı türü', true)
  text(errors, input['apiKey'], 'API anahtarı', true)
  text(errors, input['endpoint'], 'Uç nokta', true)
  text(errors, input['defaultModel'], 'Varsayılan model', true)
  flag(errors, input['isActive'], 'isActive')
  return done(errors)
}

/** X-Tenant-Id header value (string id, single value). */
export function validateTenantHeader(value: unknown): InputValidation {
  if (value === undefined || value === '') return done(['X-Tenant-Id header zorunludur'])
  return done(isValidId(value) ? [] : ['X-Tenant-Id header geçersiz'])
}
