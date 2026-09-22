'use client'

import Link from 'next/link'
import PlatformOverviewPage from '../../(platform)/system/page'
import { tenantApiGet } from '@/lib/api'
import {
  PageIntro,
  StatCard,
  StatusBadge,
  UsageMeasurement,
  UsageMeterCard,
  UsageSummary,
} from '@/components/platform-admin-ui'
import { useTenantPermissions } from '@/contexts/tenant-permission-context'
import { getActiveTenantName, getActiveTenantType } from '@/lib/tenant-context'
import { useEffect, useMemo, useState } from 'react'

interface OverviewData {
  customerRoot: {
    id: string
    name: string
    slug: string
  }
  subscription: {
    status: string
    resourcePackage: {
      name: string
      maxChildTenantCount: number
      maxUserCount: number
      maxStorageMb: number
      maxDatabaseMb: number
    }
  }
  usage: {
    childTenantCount: number
    userCount: number
    storage: UsageMeasurement
    database: UsageMeasurement
  }
}

function CustomerUsageOverview() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await tenantApiGet<OverviewData>('/api/v1/customer-admin/overview')
        setData(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Veri yüklenemedi')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-ink-muted">
        <span className="animate-pulse">Yükleniyor...</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="app-card border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
        {error || 'Bilinmeyen bir hata oluştu'}
      </div>
    )
  }

  const { usage, subscription } = data
  const pkg = subscription.resourcePackage

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow={data.customerRoot.name}
        title="Genel Bakış"
        description="Müşteri hesabı kullanımı ve kota durumunuz."
        actions={<StatusBadge status={subscription.status} />}
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Abonelik Paketi" value={pkg.name} tone="accent" />
        <StatCard label="Alt Kiracı" value={`${usage.childTenantCount} / ${pkg.maxChildTenantCount}`} />
        <StatCard label="Kullanıcı Sayısı" value={`${usage.userCount} / ${pkg.maxUserCount}`} />
        <StatCard
          label="Depolama"
          value={UsageSummary({ current: usage.storage.mbUsed, limit: pkg.maxStorageMb, unit: 'MB' })}
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-ink-subtle">Kaynak Kullanımı</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <UsageMeterCard label="Depolama (S3/MinIO)" measurement={usage.storage} limit={pkg.maxStorageMb} />
          <UsageMeterCard label="Veritabanı" measurement={usage.database} limit={pkg.maxDatabaseMb} />
        </div>
      </div>

      <div className="app-card border-dashed bg-surface-subtle/30 p-6">
        <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-muted">Kota Bilgilendirme</h4>
        <p className="text-sm leading-relaxed text-ink-muted">
          Storage kullanımı şu anda customer-root prefix taramasından türetilen yaklaşık bir ölçümdür. Repo içinde
          authoritative object namespace kontratı tanımlandığında bu yüzey daha kesin ölçüme geçirilebilir.
        </p>
      </div>
    </div>
  )
}

function StandardTenantOverview() {
  const tenantName = useMemo(() => getActiveTenantName() ?? 'Tenant', [])

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow={tenantName}
        title="Tenant Genel Bakış"
        description="Bu yüzey seçili tenant için temel yönlendirmeleri sunar. Customer-admin quota ekranı yalnızca customer root yönetim scope’unda açılır."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Tenant Tipi" value="Standart" tone="accent" />
        <StatCard label="Kota Yüzeyi" value="Customer root üzerinde" />
        <StatCard label="Durum" value="Aktif çalışma alanı" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Link href="/app/settings/general" className="app-card block p-5 no-underline transition-colors hover:bg-surface-subtle">
          <h2 className="text-base font-semibold text-ink">Genel Ayarlar</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Tenant seviyesindeki temel ayarları ve override yüzeylerini buradan yönetebilirsin.
          </p>
        </Link>
        <div className="app-card p-5">
          <h2 className="text-base font-semibold text-ink">Not</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Abonelik ve kota görünümü yalnızca customer root yönetim scope’unda gösterilir. Bu tenant için müşteri ağacı
            kotası üst root seviyesinde izlenir.
          </p>
        </div>
      </section>
    </div>
  )
}

export default function AppHomePage() {
  const { can, loading } = useTenantPermissions()
  const tenantType = getActiveTenantType()

  if (tenantType === 'PLATFORM_ROOT') {
    return <PlatformOverviewPage />
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-ink-muted">
        <span className="animate-pulse">Yükleniyor...</span>
      </div>
    )
  }

  if (tenantType === 'ROOT' && can('CUSTOMER:ADMIN:VIEW')) {
    return <CustomerUsageOverview />
  }

  return <StandardTenantOverview />
}
