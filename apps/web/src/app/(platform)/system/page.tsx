'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { apiGet } from '@/lib/api'
import { PageIntro, StatCard, StatusBadge } from '@/components/platform-admin-ui'

interface UserRow {
  id: string
  status: string
  isSystemAdmin: boolean
}

interface TenantRow {
  id: string
  name: string
  slug: string
  type: string
  status: string
}

interface PackageRow {
  id: string
  code: string
  name: string
  isActive: boolean
}

interface PlatformGeneralSettings {
  name: string
  shortName: string | null
  address: string | null
}

export default function SystemPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [settings, setSettings] = useState<PlatformGeneralSettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      apiGet<{ users: UserRow[] }>('/api/v1/platform/users'),
      apiGet<{ tenants: TenantRow[] }>('/api/v1/platform/tenants'),
      apiGet<{ packages: PackageRow[] }>('/api/v1/platform/saas/packages'),
      apiGet<PlatformGeneralSettings>('/api/v1/platform/settings/general'),
    ])
      .then(([usersRes, tenantsRes, packagesRes, settingsRes]) => {
        setUsers(usersRes.users)
        setTenants(tenantsRes.tenants)
        setPackages(packagesRes.packages)
        setSettings(settingsRes)
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Platform genel bakış verisi yüklenemedi')
      })
  }, [])

  const activeUsers = useMemo(() => users.filter(user => user.status === 'ACTIVE').length, [users])
  const systemAdmins = useMemo(
    () => users.filter(user => user.status === 'ACTIVE' && user.isSystemAdmin).length,
    [users],
  )
  const customerRoots = useMemo(
    () => tenants.filter(tenant => tenant.type === 'ROOT' && tenant.status === 'ACTIVE').length,
    [tenants],
  )
  const childTenants = useMemo(
    () => tenants.filter(tenant => tenant.type === 'STANDARD' && tenant.status === 'ACTIVE').length,
    [tenants],
  )
  const activePackages = useMemo(
    () => packages.filter(resourcePackage => resourcePackage.isActive).length,
    [packages],
  )
  const platformRoot = useMemo(
    () => tenants.find(tenant => tenant.type === 'PLATFORM_ROOT'),
    [tenants],
  )

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Platform"
        title="Platform Genel Bakış"
        description="SaaS omurgasının mevcut durumunu tek ekranda özetler. Buradan kullanıcı, tenant ve paket yönetimine geçersin."
      />

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Aktif Kullanıcı" value={activeUsers || '0'} tone="accent" />
        <StatCard label="Sistem Admin" value={systemAdmins || '0'} />
        <StatCard label="Müşteri Root" value={customerRoots || '0'} />
        <StatCard label="Alt Tenant" value={childTenants || '0'} />
        <StatCard label="Aktif Paket" value={activePackages || '0'} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="app-card p-5">
          <h2 className="text-base font-semibold text-ink">Platform Kimliği</h2>
          <div className="mt-4 grid gap-3 text-sm text-ink-muted">
            <div>
              <span className="font-medium text-ink">Ad:</span>{' '}
              {settings?.name ?? 'Yükleniyor...'}
            </div>
            <div>
              <span className="font-medium text-ink">Kısa Ad:</span>{' '}
              {settings?.shortName ?? '—'}
            </div>
            <div>
              <span className="font-medium text-ink">Adres:</span>{' '}
              {settings?.address ?? '—'}
            </div>
            <div>
              <span className="font-medium text-ink">Platform Root:</span>{' '}
              {platformRoot ? (
                <>
                  <span className="text-ink">{platformRoot.name}</span>
                  <span className="ml-2 font-mono text-xs">{platformRoot.slug}</span>
                </>
              ) : (
                '—'
              )}
            </div>
          </div>
        </article>

        <article className="app-card p-5">
          <h2 className="text-base font-semibold text-ink">Operasyon Özeti</h2>
          <div className="mt-4 space-y-3 text-sm text-ink-muted">
            <div className="flex items-center justify-between">
              <span>Bootstrap durumu</span>
              <StatusBadge status={platformRoot ? 'ACTIVE' : 'SUSPENDED'} />
            </div>
            <div className="flex items-center justify-between">
              <span>Müşteri onboarding kapasitesi</span>
              <span className="font-medium text-ink">
                {activePackages > 0 ? `${activePackages} aktif paket hazır` : 'Paket bekleniyor'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Tenant ağacı</span>
              <span className="font-medium text-ink">
                {customerRoots} root / {childTenants} child
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Link href="/system/users" className="app-card block p-5 no-underline transition-colors hover:bg-surface-subtle">
          <h2 className="text-base font-semibold text-ink">Kullanıcı Operasyonları</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Super admin işlemleri, parola sıfırlama ve impersonation bu yüzeyden yürür.
          </p>
        </Link>
        <Link href="/system/tenants" className="app-card block p-5 no-underline transition-colors hover:bg-surface-subtle">
          <h2 className="text-base font-semibold text-ink">Tenant Ağacı</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Platform root, müşteri root ve alt tenantların hiyerarşisini buradan izlersin.
          </p>
        </Link>
        <Link href="/system/packages" className="app-card block p-5 no-underline transition-colors hover:bg-surface-subtle">
          <h2 className="text-base font-semibold text-ink">Paketler ve Abonelikler</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Kaynak paketlerini tanımla ve müşteri aboneliklerini izle.
          </p>
        </Link>
      </section>
    </div>
  )
}
