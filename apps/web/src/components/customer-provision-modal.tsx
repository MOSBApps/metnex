'use client'

import { useRef, useState } from 'react'
import { apiPost } from '@/lib/api'
import {
  EMPTY_PROVISION_FORM,
  PROVISION_INCOMPLETE_NOTICE,
  runProvision,
  type ProvisionErrorView,
  type ProvisionFieldErrors,
  type ProvisionForm,
  type ProvisionResultView,
} from '@/lib/customer-provision'
import { Modal } from '@/components/platform-admin-ui'

interface PackageOption {
  id: string
  code: string
  name: string
  isActive: boolean
}

const LABEL = 'text-[10px] font-bold uppercase tracking-widest text-ink-subtle'
const FIELD_ERROR = 'text-[11px] text-rose-600 dark:text-rose-300'

export function CustomerProvisionModal({
  isOpen,
  onClose,
  packages,
  onProvisioned,
}: {
  isOpen: boolean
  onClose: () => void
  packages: PackageOption[]
  onProvisioned: () => void | Promise<void>
}) {
  const [form, setForm] = useState<ProvisionForm>({ ...EMPTY_PROVISION_FORM })
  const [fieldErrors, setFieldErrors] = useState<ProvisionFieldErrors>({})
  const [submitError, setSubmitError] = useState<ProvisionErrorView | null>(null)
  const [result, setResult] = useState<ProvisionResultView | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)

  function update(field: keyof ProvisionForm, value: string) {
    setForm(current => ({ ...current, [field]: value }))
  }

  function close() {
    if (inFlight.current) return
    // Credentials never outlive the dialog.
    setForm({ ...EMPTY_PROVISION_FORM })
    setFieldErrors({})
    setSubmitError(null)
    setResult(null)
    onClose()
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    setSubmitError(null)
    setFieldErrors({})
    setSubmitting(true)
    try {
      const outcome = await runProvision({ form, packages, inFlight, post: apiPost, refreshTenants: onProvisioned })
      if (outcome.status === 'invalid') setFieldErrors(outcome.errors)
      else if (outcome.status === 'success') {
        setForm(outcome.nextForm)
        setResult(outcome.result)
      } else if (outcome.status === 'error') setSubmitError(outcome.error)
    } finally {
      setSubmitting(false)
    }
  }

  const activePackages = packages.filter(option => option.isActive)

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Müşteri Provision Et"
      description="Yeni müşteri kök tenantı, ilk yöneticisi ve aboneliğiyle birlikte oluşturulur."
      density="compact"
      footer={
        result ? (
          <button type="button" onClick={close} className="app-button-primary-dense px-3.5">
            Kapat
          </button>
        ) : (
          <>
            <button type="button" onClick={close} className="app-button-outline-dense px-3" disabled={submitting}>
              Vazgeç
            </button>
            <button form="provision-customer-form" type="submit" className="app-button-primary-dense px-3.5" disabled={submitting}>
              {submitting ? 'Provision ediliyor...' : 'Müşteriyi Provision Et'}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3 text-[12px]" role="status">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 leading-relaxed text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
            Müşteri oluşturuldu ve veri alanı hazırlandı.
          </div>
          <dl className="space-y-1.5 text-ink">
            <div><dt className={LABEL}>Müşteri</dt><dd>{result.tenantName} <span className="font-mono text-ink-muted">({result.tenantSlug})</span></dd></div>
            <div><dt className={LABEL}>Tenant Türü</dt><dd>{result.tenantType === 'ROOT' ? 'Müşteri Kökü' : result.tenantType}</dd></div>
            <div><dt className={LABEL}>Yönetici</dt><dd>{result.adminDisplayName} — {result.adminEmail}</dd></div>
            <div><dt className={LABEL}>Paket / Abonelik</dt><dd>{result.packageName ?? '—'} {result.subscriptionStatus ? `(${result.subscriptionStatus})` : ''}</dd></div>
            <div><dt className={LABEL}>Veri Alanı Durumu</dt><dd>Hazır</dd></div>
          </dl>
          <p className="text-[11px] text-ink-muted">Yönetici parolası bu ekranda gösterilmez ve saklanmaz; kullanıcıya güvenli bir kanaldan iletin.</p>
        </div>
      ) : (
        <form id="provision-customer-form" onSubmit={handleSubmit} className="space-y-3" autoComplete="off" noValidate>
          {submitError && (
            <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] leading-relaxed text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
              {submitError.message}
            </div>
          )}
          <div className="space-y-1">
            <label className={LABEL} htmlFor="provision-company-name">Müşteri Adı</label>
            <input id="provision-company-name" className="app-input-dense" value={form.companyName} onChange={e => update('companyName', e.target.value)} required />
            {fieldErrors.companyName && <p className={FIELD_ERROR}>{fieldErrors.companyName}</p>}
          </div>
          <div className="space-y-1">
            <label className={LABEL} htmlFor="provision-company-slug">Slug (Opsiyonel)</label>
            <input id="provision-company-slug" className="app-input-dense font-mono" value={form.companySlug} onChange={e => update('companySlug', e.target.value)} />
            {fieldErrors.companySlug && <p className={FIELD_ERROR}>{fieldErrors.companySlug}</p>}
          </div>
          <div className="space-y-1">
            <label className={LABEL} htmlFor="provision-package">Kaynak Paketi</label>
            <select id="provision-package" className="app-input-dense" value={form.packageId} onChange={e => update('packageId', e.target.value)} required>
              <option value="">Paket seçin...</option>
              {activePackages.map(option => (
                <option key={option.id} value={option.id}>{option.name} ({option.code})</option>
              ))}
            </select>
            {activePackages.length === 0 && <p className="text-[11px] text-ink-muted">Seçilebilir aktif paket bulunamadı. Önce Paketler sayfasından paket tanımlayın.</p>}
            {fieldErrors.packageId && <p className={FIELD_ERROR}>{fieldErrors.packageId}</p>}
          </div>
          <div className="space-y-1">
            <label className={LABEL} htmlFor="provision-admin-name">Yönetici Adı</label>
            <input id="provision-admin-name" className="app-input-dense" value={form.adminDisplayName} onChange={e => update('adminDisplayName', e.target.value)} required />
            {fieldErrors.adminDisplayName && <p className={FIELD_ERROR}>{fieldErrors.adminDisplayName}</p>}
          </div>
          <div className="space-y-1">
            <label className={LABEL} htmlFor="provision-admin-email">Yönetici E-posta</label>
            <input id="provision-admin-email" type="email" autoComplete="off" className="app-input-dense" value={form.adminEmail} onChange={e => update('adminEmail', e.target.value)} required />
            {fieldErrors.adminEmail && <p className={FIELD_ERROR}>{fieldErrors.adminEmail}</p>}
          </div>
          <div className="space-y-1">
            <label className={LABEL} htmlFor="provision-admin-password">Yönetici Parolası</label>
            <input id="provision-admin-password" type="password" autoComplete="new-password" className="app-input-dense" value={form.adminPassword} onChange={e => update('adminPassword', e.target.value)} required />
            <p className="text-[11px] text-ink-muted">En az 8, en fazla 128 karakter; en az bir büyük harf, bir küçük harf ve bir rakam.</p>
            {fieldErrors.adminPassword && <p className={FIELD_ERROR}>{fieldErrors.adminPassword}</p>}
          </div>
          <div className="space-y-1">
            <label className={LABEL} htmlFor="provision-admin-password-confirm">Parola (Tekrar)</label>
            <input id="provision-admin-password-confirm" type="password" autoComplete="new-password" className="app-input-dense" value={form.adminPasswordConfirm} onChange={e => update('adminPasswordConfirm', e.target.value)} required />
            {fieldErrors.adminPasswordConfirm && <p className={FIELD_ERROR}>{fieldErrors.adminPasswordConfirm}</p>}
          </div>
          <div className="space-y-1">
            <label className={LABEL} htmlFor="provision-notes">Abonelik Notu (Opsiyonel)</label>
            <textarea id="provision-notes" className="app-input-dense" rows={2} value={form.notes} onChange={e => update('notes', e.target.value)} />
            {fieldErrors.notes && <p className={FIELD_ERROR}>{fieldErrors.notes}</p>}
          </div>
          <div className="rounded-md border border-surface-border bg-surface-subtle p-3 text-[11px] leading-relaxed text-ink-muted">
            Müşteri kaydı ve yönetici hesabı önce oluşturulur, veri alanı ardından hazırlanır. {PROVISION_INCOMPLETE_NOTICE}
          </div>
        </form>
      )}
    </Modal>
  )
}
