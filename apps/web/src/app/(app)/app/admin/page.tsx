'use client'

import { useEffect, useState } from 'react'
import { tenantApiGet } from '@/lib/api'
import {
  EmptyState,
  PageIntro,
  StatCard,
  StatusBadge,
  UsageMeasurement,
  UsageMeterCard,
  UsageSummary,
} from '@/components/platform-admin-ui'

interface OverviewResponse {
  customerRoot: {
    id: string
    name: string
    slug: string
    type: string
  }
  subscription: {
    id: string
    status: string
    resourcePackage: {
      code: string
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

export default function CustomerAdminOverviewPage() {
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void tenantApiGet<OverviewResponse>('/api/v1/customer-admin/overview')
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Veri yüklenemedi'))
  }, [])

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Customer Root"
        title="Abonelik ve Kota"
        description="Root tenant admin, kendi müşteri ağacının kapasitesini buradan izler. Child tenant ve kullanıcı limitleri seçilen paketten gelir; storage ve DB ölçümleri gerçek durumlarına göre approximate veya unsupported olarak etiketlenir."
      />

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {!data ? (
        <div className="app-card px-6 py-8 text-sm text-ink-muted">Abonelik bilgisi yükleniyor...</div>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <StatCard
              label="Child Tenant"
              value={`${data.usage.childTenantCount}/${data.subscription.resourcePackage.maxChildTenantCount}`}
              tone="accent"
            />
            <StatCard
              label="Kullanıcı"
              value={`${data.usage.userCount}/${data.subscription.resourcePackage.maxUserCount}`}
            />
            <StatCard
              label="S3 MB"
              value={UsageSummary({
                current: data.usage.storage.mbUsed,
                limit: data.subscription.resourcePackage.maxStorageMb,
                unit: 'MB',
              })}
            />
            <StatCard
              label="DB MB"
              value={UsageSummary({
                current: data.usage.database.mbUsed,
                limit: data.subscription.resourcePackage.maxDatabaseMb,
                unit: 'MB',
              })}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="app-card p-5">
              <h2 className="text-base font-semibold text-ink">Müşteri Root Tenant</h2>
              <div className="mt-3 space-y-2 text-sm text-ink-muted">
                <div>
                  <span className="font-medium text-ink">{data.customerRoot.name}</span>
                  <span className="ml-2 font-mono text-xs">{data.customerRoot.slug}</span>
                </div>
                <StatusBadge status={data.subscription.status} />
              </div>
            </article>

            <article className="app-card p-5">
              <h2 className="text-base font-semibold text-ink">Kaynak Paketi</h2>
              <p className="mt-2 text-sm text-ink-muted">
                {data.subscription.resourcePackage.name} ({data.subscription.resourcePackage.code})
              </p>
              <div className="mt-4 grid gap-2 text-sm text-ink-muted">
                <div>Child tenant limiti: {data.subscription.resourcePackage.maxChildTenantCount}</div>
                <div>Kullanıcı limiti: {data.subscription.resourcePackage.maxUserCount}</div>
                <div>S3 limiti: {data.subscription.resourcePackage.maxStorageMb} MB</div>
                <div>DB limiti: {data.subscription.resourcePackage.maxDatabaseMb} MB</div>
              </div>
            </article>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <UsageMeterCard
              label="Depolama kullanımı"
              measurement={data.usage.storage}
              limit={data.subscription.resourcePackage.maxStorageMb}
            />
            <UsageMeterCard
              label="Veritabanı kullanımı"
              measurement={data.usage.database}
              limit={data.subscription.resourcePackage.maxDatabaseMb}
            />
          </section>
        </>
      )}

      {!data && !error ? (
        <EmptyState
          title="Abonelik bilgisi bekleniyor"
          description="Customer root tenant için bir subscription oluşturulduğunda bu alan dolacaktır."
        />
      ) : null}
    </div>
  )
}
