'use client'

import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '@/lib/api'
import {
  Badge,
  PageIntro,
  SectionHeader,
  StatusBadge,
  UsageMeasurement,
  UsageSummary,
  formatDate,
} from '@/components/platform-admin-ui'

interface ResourcePackage {
  id: string
  code: string
  name: string
  description: string | null
  maxChildTenantCount: number
  maxUserCount: number
  maxStorageMb: number
  maxDatabaseMb: number
  isActive: boolean
}

interface SubscriptionOverview {
  customerRoot: {
    id: string
    name: string
    slug: string
  }
  subscription: {
    id: string
    status: string
    startsAt: string
    resourcePackage: ResourcePackage
  }
  usage: {
    childTenantCount: number
    userCount: number
    storage: UsageMeasurement
    database: UsageMeasurement
  }
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<ResourcePackage[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [maxChildTenants, setMaxChildTenants] = useState('5')
  const [maxUsers, setMaxUsers] = useState('10')
  const [maxStorageMb, setMaxStorageMb] = useState('1024')
  const [maxDatabaseMb, setMaxDatabaseMb] = useState('512')
  const [submitting, setSubmitting] = useState(false)

  async function loadData() {
    try {
      const [pkgs, subs] = await Promise.all([
        apiGet<{ packages: ResourcePackage[] }>('/api/v1/platform/saas/packages'),
        apiGet<{ subscriptions: SubscriptionOverview[] }>('/api/v1/platform/saas/subscriptions'),
      ])
      setPackages(pkgs.packages)
      setSubscriptions(subs.subscriptions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veriler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await apiPost('/api/v1/platform/saas/packages', {
        code,
        name,
        description,
        maxChildTenantCount: Number(maxChildTenants),
        maxUserCount: Number(maxUsers),
        maxStorageMb: Number(maxStorageMb),
        maxDatabaseMb: Number(maxDatabaseMb),
      })
      setCode('')
      setName('')
      setDescription('')
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Paket oluşturulamadı')
    } finally {
      setSubmitting(false)
    }
  }

  function usageTone(status: UsageMeasurement['status']) {
    if (status === 'REAL') return 'info'
    if (status === 'APPROXIMATE') return 'warning'
    return 'default'
  }

  return (
    <div className="space-y-10 pb-20">
      <PageIntro
        eyebrow="Platform"
        title="Paket ve Kota Yönetimi"
        description="Sistem kaynak paketlerini tanımlayın ve müşteri aboneliklerini izleyin."
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
        <div className="space-y-8">
          <section className="space-y-4">
            <SectionHeader title="Tanımlı Kaynak Paketleri" description="Müşterilere atanabilir hazır kota limitleri." />
            
            {loading ? (
              <div className="flex h-32 items-center justify-center text-sm text-ink-muted animate-pulse">
                Yükleniyor...
              </div>
            ) : packages.length === 0 ? (
              <div className="app-card p-10 text-center text-sm text-ink-muted border-dashed">
                Henüz paket tanımlanmamış.
              </div>
            ) : (
              <div className="app-table-shell overflow-hidden">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th className="app-th">Paket</th>
                      <th className="app-th text-right">Alt Kiracı</th>
                      <th className="app-th text-right">Kullanıcı</th>
                      <th className="app-th text-right">Depolama</th>
                      <th className="app-th text-right">DB</th>
                      <th className="app-th text-center">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packages.map(pkg => (
                      <tr key={pkg.id} className="app-tr text-sm">
                        <td className="app-td">
                          <div className="font-bold text-ink">{pkg.name}</div>
                          <div className="text-[10px] font-mono text-ink-subtle uppercase">{pkg.code}</div>
                        </td>
                        <td className="app-td text-right tabular-nums">{pkg.maxChildTenantCount}</td>
                        <td className="app-td text-right tabular-nums">{pkg.maxUserCount}</td>
                        <td className="app-td text-right tabular-nums">{pkg.maxStorageMb} MB</td>
                        <td className="app-td text-right tabular-nums">{pkg.maxDatabaseMb} MB</td>
                        <td className="app-td text-center">
                          <span className={`inline-block w-2 h-2 rounded-full ${pkg.isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <SectionHeader title="Müşteri Abonelikleri" description="Mevcut müşterilerin aktif paketleri ve başlangıç tarihleri." />
            {loading ? null : subscriptions.length === 0 ? (
              <div className="app-card p-10 text-center text-sm text-ink-muted border-dashed">
                Henüz aktif abonelik bulunmuyor.
              </div>
            ) : (
              <div className="app-table-shell overflow-hidden">
                <table className="app-table text-sm">
                  <thead>
                    <tr>
                      <th className="app-th">Müşteri</th>
                      <th className="app-th">Paket</th>
                      <th className="app-th">Kullanım</th>
                      <th className="app-th">Başlangıç</th>
                      <th className="app-th text-center">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map(sub => (
                      <tr key={sub.subscription.id} className="app-tr">
                        <td className="app-td font-medium text-ink">
                          {sub.customerRoot.name}
                          <div className="text-[10px] text-ink-muted font-mono">{sub.customerRoot.slug}</div>
                        </td>
                        <td className="app-td text-ink-muted">{sub.subscription.resourcePackage.name}</td>
                        <td className="app-td">
                          <div className="space-y-1 text-xs text-ink-muted">
                            <div>
                              Tenant: {sub.usage.childTenantCount}/{sub.subscription.resourcePackage.maxChildTenantCount}
                            </div>
                            <div>
                              Kullanıcı: {sub.usage.userCount}/{sub.subscription.resourcePackage.maxUserCount}
                            </div>
                            <div>
                              Storage:{' '}
                              {UsageSummary({
                                current: sub.usage.storage.mbUsed,
                                limit: sub.subscription.resourcePackage.maxStorageMb,
                                unit: 'MB',
                              })}
                            </div>
                            <div>
                              DB:{' '}
                              {UsageSummary({
                                current: sub.usage.database.mbUsed,
                                limit: sub.subscription.resourcePackage.maxDatabaseMb,
                                unit: 'MB',
                              })}
                            </div>
                            <div className="flex flex-wrap gap-1 pt-1">
                              <Badge tone={usageTone(sub.usage.storage.status)}>
                                Storage {sub.usage.storage.status === 'REAL' ? 'gerçek' : sub.usage.storage.status === 'APPROXIMATE' ? 'yaklaşık' : 'destek yok'}
                              </Badge>
                              <Badge tone={usageTone(sub.usage.database.status)}>
                                DB {sub.usage.database.status === 'REAL' ? 'gerçek' : sub.usage.database.status === 'APPROXIMATE' ? 'yaklaşık' : 'destek yok'}
                              </Badge>
                            </div>
                          </div>
                        </td>
                        <td className="app-td text-ink-subtle tabular-nums">{formatDate(sub.subscription.startsAt)}</td>
                        <td className="app-td text-center">
                          <StatusBadge status={sub.subscription.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[10px] text-ink-subtle italic leading-relaxed">
              Storage kullanımı repository genelinde authoritative object namespace tanımlanmadığı için customer-root
              prefix taramasına dayalı yaklaşık ölçüm olarak gösterilir. DB kullanımı da shared-schema yapısı nedeniyle
              customer-root bazında fiziksel olarak ayrıştırılamadığında yaklaşık veya unsupported olarak işaretlenir.
            </p>
          </section>
        </div>

        <aside className="space-y-6">
          <form onSubmit={handleCreate} className="app-card p-6 space-y-6 border-brand/20 bg-brand/5 sticky top-6">
            <SectionHeader title="Yeni Paket Oluştur" />
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Paket Kodu</label>
                <input className="app-input" placeholder="Örn: FREE, PRO" value={code} onChange={e => setCode(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Paket Adı</label>
                <input className="app-input" placeholder="Örn: Başlangıç Paketi" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Alt Kiracı Limit</label>
                  <input className="app-input" type="number" value={maxChildTenants} onChange={e => setMaxChildTenants(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Kullanıcı Limit</label>
                  <input className="app-input" type="number" value={maxUsers} onChange={e => setMaxUsers(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Max Depolama MB</label>
                  <input className="app-input" type="number" value={maxStorageMb} onChange={e => setMaxStorageMb(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Max DB MB</label>
                  <input className="app-input" type="number" value={maxDatabaseMb} onChange={e => setMaxDatabaseMb(e.target.value)} required />
                </div>
              </div>
            </div>

            <button type="submit" className="app-button-primary w-full py-2.5" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : 'Paketi Kaydet'}
            </button>
          </form>
        </aside>
      </div>

      {error ? (
        <div className="fixed bottom-6 right-6 max-w-sm rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-xl dark:border-rose-900/60 dark:bg-rose-950/90 dark:text-rose-300 dark:shadow-2xl">
          {error}
        </div>
      ) : null}
    </div>
  )
}
