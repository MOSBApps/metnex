'use client'

import { useEffect, useState } from 'react'
import { tenantApiGet, tenantApiPost } from '@/lib/api'
import {
  Badge,
  DataRow,
  DetailPanel,
  EmptyState,
  formatDate,
  Modal,
  PageIntro,
  SectionHeader,
  StatusBadge,
  Tabs,
} from '@/components/platform-admin-ui'

interface TenantRow {
  id: string
  name: string
  slug: string
  type: string
  status: string
  memberCount: number
  parentId: string | null
  parentName: string | null
  parentSlug: string | null
  customerRootId: string | null
  customerRootName: string | null
  customerRootSlug: string | null
  createdAt: string
}

export default function CustomerAdminTenantsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Create state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [creating, setCreating] = useState(false)

  // Selected Tenant state
  const [selectedTenant, setSelectedTenant] = useState<TenantRow | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'hierarchy'>('info')

  async function load() {
    setLoading(true)
    try {
      const res = await tenantApiGet<{ tenants: TenantRow[] }>('/api/v1/customer-admin/tenants')
      setTenants(res.tenants)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tenant listesi yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError(null)
    try {
      await tenantApiPost('/api/v1/customer-admin/tenants', {
        name,
        slug: slug || undefined,
      })
      setName('')
      setSlug('')
      setIsCreateModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tenant oluşturulamadı')
    } finally {
      setCreating(false)
    }
  }

  function openDetail(tenant: TenantRow) {
    setSelectedTenant(tenant)
    setActiveTab('info')
  }

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Müşteri Yönetimi"
        title="Kiracılar"
        description="Müşteri ağacınızdaki alt kiracıları yönetin ve hiyerarşiyi izleyin."
        actions={
          <button 
            type="button" 
            onClick={() => setIsCreateModalOpen(true)}
            className="app-button-primary px-6"
          >
            Yeni Alt Kiracı
          </button>
        }
      />

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="app-card px-6 py-12 flex items-center justify-center text-sm text-ink-muted">
          <span className="animate-pulse">Tenant listesi yükleniyor...</span>
        </div>
      ) : tenants.length === 0 ? (
        <EmptyState title="Tenant bulunamadı" description="Henüz bir alt kiracı oluşturmamışsınız." />
      ) : (
        <div className="app-table-shell overflow-hidden">
          <table className="app-table">
            <thead>
              <tr>
                <th className="app-th">Kiracı</th>
                <th className="app-th">Tip</th>
                <th className="app-th">Durum</th>
                <th className="app-th text-right">Üye</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(tenant => (
                <tr 
                  key={tenant.id} 
                  className={`app-tr cursor-pointer transition-colors ${selectedTenant?.id === tenant.id ? 'bg-brand/5' : ''}`}
                  onClick={() => openDetail(tenant)}
                >
                  <td className="app-td">
                    <div className="font-medium text-ink">{tenant.name}</div>
                    <div className="font-mono text-[11px] text-ink-subtle uppercase tracking-wider">{tenant.slug}</div>
                  </td>
                  <td className="app-td"><StatusBadge status={tenant.type} /></td>
                  <td className="app-td"><StatusBadge status={tenant.status} /></td>
                  <td className="app-td text-right tabular-nums text-ink-muted text-sm">{tenant.memberCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Tenant Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Yeni Alt Kiracı Oluştur"
        description="Müşteri ağacınıza bağlı yeni bir alt çalışma alanı tanımlayın."
        footer={
          <>
            <button type="button" onClick={() => setIsCreateModalOpen(false)} className="app-button-outline px-4" disabled={creating}>
              Vazgeç
            </button>
            <button form="create-tenant-form" type="submit" className="app-button-primary px-6" disabled={creating}>
              {creating ? 'Oluşturuluyor...' : 'Kiracıyı Kaydet'}
            </button>
          </>
        }
      >
        <form id="create-tenant-form" onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Kiracı Adı</label>
            <input 
              className="app-input" 
              placeholder="Örn: Ankara Bölge Müdürlüğü" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">URL Slug (Opsiyonel)</label>
            <input 
              className="app-input font-mono" 
              placeholder="ankara-bolge" 
              value={slug} 
              onChange={e => setSlug(e.target.value)} 
            />
          </div>
          <div className="rounded-lg bg-surface-subtle p-3 border border-surface-border text-xs text-ink-muted leading-relaxed">
            <p className="font-semibold text-ink mb-1">💡 Hiyerarşik Slug Notu</p>
            Yeni kiracı, mevcut kiracınızın (parent) altına bağlanır. URL erişimi için slug değeri otomatik olarak 
            <code className="mx-1 px-1 bg-surface-border rounded font-mono text-brand">ust-birim-slug-yeni-slug</code> 
            şeklinde birleştirilecektir.
          </div>
        </form>
      </Modal>

      {/* Tenant Detail Panel */}
      <DetailPanel
        isOpen={!!selectedTenant}
        onClose={() => setSelectedTenant(null)}
        title={selectedTenant?.name ?? ''}
        subtitle={selectedTenant?.slug}
      >
        {selectedTenant && (
          <div className="space-y-8">
            <Tabs
              tabs={[
                { id: 'info', label: 'Bilgiler' },
                { id: 'hierarchy', label: 'Hiyerarşi' },
              ]}
              activeTab={activeTab}
              onTabChange={(id) => setActiveTab(id as 'info' | 'hierarchy')}
            />

            {activeTab === 'info' && (
              <div className="space-y-8">
                <div>
                  <SectionHeader title="Kiracı Künyesi" description="Kiracının sistemdeki genel tanımlayıcıları." />
                  <div className="grid gap-4 rounded-xl border border-surface-border p-4 bg-surface-subtle/30">
                    <DataRow label="ID" value={selectedTenant.id} />
                    <DataRow label="Üye Sayısı" value={selectedTenant.memberCount} />
                    <DataRow label="Durum">
                      <StatusBadge status={selectedTenant.status} />
                    </DataRow>
                    <DataRow label="Oluşturulma" value={formatDate(selectedTenant.createdAt)} />
                  </div>
                </div>

                <div className="rounded-lg bg-surface-subtle p-4 border border-surface-border">
                  <p className="text-xs text-ink-muted leading-relaxed italic">
                    Kiracı bilgileri (isim, slug vb.) şu an için düzenlemeye kapalıdır. 
                    Değişiklik talepleri için sistem yöneticisi ile iletişime geçin.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'hierarchy' && (
              <div className="space-y-8">
                <div>
                  <SectionHeader title="Hiyerarşi Bağlamı" description="Müşteri ağacı içerisindeki yerleşim ve ilişkiler." />
                  <div className="grid gap-6 rounded-xl border border-surface-border p-4 bg-surface-subtle/30">
                    <DataRow label="Üst Birim (Parent)">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-brand" />
                        {selectedTenant.parentName ? (
                          <span className="text-xs font-medium text-ink">
                            {selectedTenant.parentName} <span className="font-mono text-[11px] text-ink-subtle">({selectedTenant.parentSlug})</span>
                          </span>
                        ) : (
                          <code className="text-[11px] font-mono">{selectedTenant.parentId || 'Kök Kiracı'}</code>
                        )}
                        {!selectedTenant.parentId && <Badge tone="info">Müşteri Root</Badge>}
                      </div>
                    </DataRow>
                    <DataRow label="Müşteri Kökü (Customer Root)">
                      <div className="flex items-center gap-2 text-ink-muted">
                        <div className="h-1.5 w-1.5 rounded-full bg-surface-border ring-1 ring-ink-subtle" />
                        {selectedTenant.customerRootName ? (
                          <span className="text-xs font-medium text-ink">
                            {selectedTenant.customerRootName} <span className="font-mono text-[11px] text-ink-subtle">({selectedTenant.customerRootSlug})</span>
                          </span>
                        ) : (
                          <code className="text-[11px] font-mono">{selectedTenant.customerRootId || selectedTenant.id}</code>
                        )}
                      </div>
                    </DataRow>
                  </div>
                </div>

                <div className="rounded-xl bg-brand/5 p-4 border border-brand/20">
                  <h5 className="text-[10px] font-bold uppercase tracking-widest text-brand mb-1.5">Müşteri Ağacı Hakkında</h5>
                  <p className="text-xs text-brand/80 leading-relaxed italic">
                    Tüm alt birimler, müşteri köküne (Customer Root) tanımlanmış olan kaynak havuzunu (kullanıcı sayısı, depolama vb.) paylaşır.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </DetailPanel>
    </div>
  )
}
