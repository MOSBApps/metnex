import { ApiError } from './api'
import { PASSWORD_MIN_LENGTH, passwordPolicyErrors } from './password-policy'

/** Body contract of POST /api/v1/platform/saas/customers/provision (SaasService ProvisionCustomerDto). */
export interface ProvisionCustomerPayload {
  companyName: string
  companySlug?: string
  packageId: string
  adminEmail: string
  adminDisplayName: string
  adminPassword: string
  notes?: string
}

export interface ProvisionForm {
  companyName: string
  companySlug: string
  packageId: string
  adminDisplayName: string
  adminEmail: string
  adminPassword: string
  adminPasswordConfirm: string
  notes: string
}

export interface ProvisionPackageOption {
  id: string
  name: string
  isActive: boolean
}

export const PROVISION_ENDPOINT = '/api/v1/platform/saas/customers/provision'
/** Canonical backend policy (see password-policy.ts); no separate frontend rule. */
export const MIN_ADMIN_PASSWORD_LENGTH = PASSWORD_MIN_LENGTH

export const EMPTY_PROVISION_FORM: ProvisionForm = {
  companyName: '',
  companySlug: '',
  packageId: '',
  adminDisplayName: '',
  adminEmail: '',
  adminPassword: '',
  adminPasswordConfirm: '',
  notes: '',
}

export const PROVISION_FALLBACK_MESSAGE = 'Müşteri oluşturulamadı. Lütfen bilgileri kontrol edip tekrar deneyin.'
export const PROVISION_FORBIDDEN_MESSAGE = 'Bu işlem için yetkiniz bulunmuyor.'
export const PROVISION_ARCHIVED_MESSAGE =
  'Bu müşteri için ayrılmış veri alanı arşivlenmiş olduğundan yeniden hazırlanamaz. Lütfen platform yöneticisiyle iletişime geçin.'
export const PROVISION_STATE_CONFLICT_MESSAGE =
  'Müşteri veri alanının durumu işlem sırasında değişti. Kiracı listesini yenileyip müşterinin durumunu kontrol edin, sonra gerekirse tekrar deneyin.'
/** Q-DP17: the customer record and its first admin are committed before the data area is prepared. */
export const PROVISION_INCOMPLETE_NOTICE =
  'Müşteri kaydı oluşmuş olabilir ancak veri alanı hazırlığı tamamlanmamış olabilir. Aynı bilgilerle tekrar denemeyin: e-posta veya slug çakışması alırsınız. Kiracı listesini kontrol edin ve durumu platform yöneticisine bildirin.'
export const PROVISION_SCHEMA_FAILED_MESSAGE = `Müşterinin veri alanı hazırlanamadı. ${PROVISION_INCOMPLETE_NOTICE}`
export const PROVISION_SERVER_ERROR_MESSAGE = `Sunucu işlemi tamamlayamadı. ${PROVISION_INCOMPLETE_NOTICE}`
export const PROVISION_NETWORK_MESSAGE = `Sunucuya ulaşılamadı veya yanıt alınamadı. İşlem sunucuda tamamlanmış olabilir. ${PROVISION_INCOMPLETE_NOTICE}`

const MAX_BACKEND_MESSAGE_LENGTH = 200
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type ProvisionFieldErrors = Partial<Record<keyof ProvisionForm, string>>

/** Client-side convenience checks only; the backend stays the final authority. */
export function validateProvisionForm(form: ProvisionForm, packages: readonly ProvisionPackageOption[]): ProvisionFieldErrors {
  const errors: ProvisionFieldErrors = {}
  const companyName = form.companyName.trim()
  if (companyName.length < 2 || companyName.length > 100) errors.companyName = 'Müşteri adı 2-100 karakter olmalıdır.'
  const slug = form.companySlug.trim()
  if (slug && (slug.length > 63 || !SLUG_PATTERN.test(slug))) errors.companySlug = 'Slug yalnızca küçük harf, rakam ve tire içerebilir (en fazla 63 karakter).'
  if (!form.packageId.trim() || !packages.some(option => option.id === form.packageId && option.isActive)) {
    errors.packageId = 'Lütfen aktif bir kaynak paketi seçin.'
  }
  const adminName = form.adminDisplayName.trim()
  if (adminName.length < 2 || adminName.length > 100) errors.adminDisplayName = 'Yönetici adı 2-100 karakter olmalıdır.'
  if (form.adminEmail.trim().length > 254 || !isEmail(form.adminEmail)) errors.adminEmail = 'Geçerli bir e-posta adresi girin.'
  if (form.notes.trim().length > 1000) errors.notes = 'Not en fazla 1000 karakter olabilir.'
  const passwordErrors = passwordPolicyErrors(form.adminPassword)
  if (passwordErrors.length > 0) {
    errors.adminPassword = passwordErrors.join('. ') + '.'
  } else if (form.adminPassword !== form.adminPasswordConfirm) {
    errors.adminPasswordConfirm = 'Parolalar eşleşmiyor.'
  }
  return errors
}

function isEmail(value: string) {
  return EMAIL_PATTERN.test(value.trim())
}

/** Builds exactly the backend DTO — never a tenant type or capability field. */
export function buildProvisionPayload(form: ProvisionForm): ProvisionCustomerPayload {
  const payload: ProvisionCustomerPayload = {
    companyName: form.companyName.trim(),
    packageId: form.packageId,
    adminEmail: form.adminEmail.trim(),
    adminDisplayName: form.adminDisplayName.trim(),
    adminPassword: form.adminPassword,
  }
  const slug = form.companySlug.trim()
  if (slug) payload.companySlug = slug
  const notes = form.notes.trim()
  if (notes) payload.notes = notes
  return payload
}

export interface ProvisionErrorView {
  message: string
  /** True when the customer record may already exist (Q-DP17) so the list must be refreshed. */
  possiblyIncomplete: boolean
}

export function describeProvisionError(error: unknown): ProvisionErrorView {
  if (!(error instanceof ApiError)) {
    // fetch() rejects with a TypeError on network failure: the request may or may not have been handled.
    if (error instanceof TypeError) return { message: PROVISION_NETWORK_MESSAGE, possiblyIncomplete: true }
    return { message: PROVISION_FALLBACK_MESSAGE, possiblyIncomplete: false }
  }
  const code = error.body?.['code']
  if (code === 'ROOT_PROVISIONING_REQUIRED') {
    return { message: 'Müşteri kaydı yalnızca müşteri provizyon akışıyla yapılabilir. Lütfen sayfayı yenileyip tekrar deneyin.', possiblyIncomplete: false }
  }
  if (code === 'SCHEMA_ARCHIVED') return { message: PROVISION_ARCHIVED_MESSAGE, possiblyIncomplete: true }
  if (code === 'REGISTRY_STATE_CONFLICT') return { message: PROVISION_STATE_CONFLICT_MESSAGE, possiblyIncomplete: true }
  if (code === 'SCHEMA_PROVISIONING_FAILED') return { message: PROVISION_SCHEMA_FAILED_MESSAGE, possiblyIncomplete: true }
  if (error.status === 401 || error.status === 403) return { message: PROVISION_FORBIDDEN_MESSAGE, possiblyIncomplete: false }
  if (error.status >= 500) return { message: PROVISION_SERVER_ERROR_MESSAGE, possiblyIncomplete: true }
  const message = error.message.trim()
  if ((error.status === 400 || error.status === 404 || error.status === 409) && message && message.length <= MAX_BACKEND_MESSAGE_LENGTH) {
    return { message, possiblyIncomplete: false }
  }
  return { message: PROVISION_FALLBACK_MESSAGE, possiblyIncomplete: false }
}

export interface ProvisionResultView {
  tenantName: string
  tenantSlug: string
  tenantType: string
  adminEmail: string
  adminDisplayName: string
  packageName: string | null
  subscriptionStatus: string | null
  /** The API only answers successfully after the data area was prepared. */
  schemaStatus: 'READY'
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Whitelists display fields from the response; anything else (e.g. a stray credential) is dropped. */
export function summarizeProvisionResult(response: unknown): ProvisionResultView {
  const root = (response ?? {}) as Record<string, Record<string, unknown> | undefined>
  const subscription = root['subscription']
  const resourcePackage = subscription?.['resourcePackage'] as Record<string, unknown> | undefined
  return {
    tenantName: text(root['customerRootTenant']?.['name']),
    tenantSlug: text(root['customerRootTenant']?.['slug']),
    tenantType: text(root['customerRootTenant']?.['type']),
    adminEmail: text(root['tenantAdmin']?.['email']),
    adminDisplayName: text(root['tenantAdmin']?.['displayName']),
    packageName: resourcePackage ? text(resourcePackage['name']) || null : null,
    subscriptionStatus: subscription ? text(subscription['status']) || null : null,
    schemaStatus: 'READY',
  }
}

export interface ProvisionRunDeps {
  form: ProvisionForm
  packages: readonly ProvisionPackageOption[]
  /** Shared guard object so a second submit while one is in flight is refused. */
  inFlight: { current: boolean }
  post: (path: string, body: ProvisionCustomerPayload) => Promise<unknown>
  refreshTenants: () => void | Promise<void>
}

export type ProvisionOutcome =
  | { status: 'busy' }
  | { status: 'invalid'; errors: ProvisionFieldErrors }
  | { status: 'success'; result: ProvisionResultView; nextForm: ProvisionForm }
  | { status: 'error'; error: ProvisionErrorView }

export async function runProvision(deps: ProvisionRunDeps): Promise<ProvisionOutcome> {
  if (deps.inFlight.current) return { status: 'busy' }
  const errors = validateProvisionForm(deps.form, deps.packages)
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors }
  deps.inFlight.current = true
  try {
    const response = await deps.post(PROVISION_ENDPOINT, buildProvisionPayload(deps.form))
    // A failing list refresh must not turn a completed provisioning into an error.
    await Promise.resolve(deps.refreshTenants()).catch(() => undefined)
    // Everything the user typed is discarded on success; the password never survives it.
    return { status: 'success', result: summarizeProvisionResult(response), nextForm: { ...EMPTY_PROVISION_FORM } }
  } catch (error) {
    const view = describeProvisionError(error)
    if (view.possiblyIncomplete) await Promise.resolve(deps.refreshTenants()).catch(() => undefined)
    // Inputs are kept so the user does not retype them.
    return { status: 'error', error: view }
  } finally {
    deps.inFlight.current = false
  }
}
