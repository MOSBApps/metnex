'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { CustomerProvisionModal } from '@/components/customer-provision-modal'
import { buildChildTenantPayload, describeTenantCreateError, eligibleParentTenants, type ParentCandidate } from '@/lib/tenant-create'
import {
  ActionGroup,
  Badge,
  ConfirmDialog,
  DataRow,
  DetailPanel,
  EmptyState,
  formatDate,
  Modal,
  PageIntro,
  SectionHeader,
  SortButton,
  StatCard,
  StatusBadge,
  Tabs,
} from '@/components/platform-admin-ui'

interface Tenant {
  id: string
  name: string
  shortName: string | null
  slug: string
  type: string
  parentId: string | null
  parentName: string | null
  parentSlug: string | null
  customerRootId: string | null
  customerRootName: string | null
  customerRootSlug: string | null
  packageId: string | null
  packageName: string | null
  packageCode: string | null
  status: string
  memberCount: number
  createdAt: string
}

interface ResourcePackage {
  id: string
  code: string
  name: string
  maxUserCount: number
  maxStorageMb: number
  isActive: boolean
}

type SortField = 'name' | 'type' | 'status' | 'memberCount' | 'createdAt'
type SortDir = 'asc' | 'desc'

function sortTenants(rows: Tenant[], field: SortField, dir: SortDir) {
  const sorted = [...rows].sort((a, b) => {
    if (field === 'memberCount') return a.memberCount - b.memberCount
    if (field === 'createdAt') {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    }

    return String(a[field] ?? '').localeCompare(String(b[field] ?? ''), 'tr', {
      sensitivity: 'base',
    })
  })

  return dir === 'asc' ? sorted : sorted.reverse()
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Resource packages state
  const [packages, setPackages] = useState<ResourcePackage[]>([])

  // Create state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createSlug, setCreateSlug] = useState('')
  const [createParentId, setCreateParentId] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [parentCandidates, setParentCandidates] = useState<ParentCandidate[]>([])
  const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false)

  // Selected Tenant state
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'hierarchy'>('info')
  const [editName, setEditName] = useState('')
  const [selectedPackageId, setSelectedPackageId] = useState<string>('')
  const [updating, setUpdating] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Confirm states
  const [confirmAction, setConfirmAction] = useState<{
    type: 'suspend' | 'archive'
    title: string
    description: string
  } | null>(null)

  const loadTenants = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      if (statusFilter) params.set('status', statusFilter)
      const data = await apiGet<{ tenants: Tenant[]; total: number }>(
        `/api/v1/platform/tenants${params.size ? `?${params}` : ''}`,
      )
      setTenants(data.tenants)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tenant listesi yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [query, statusFilter])

  useEffect(() => {
    void loadTenants()
    void apiGet<{ packages: ResourcePackage[] }>('/api/v1/platform/saas/packages')
      .then(res => setPackages(res.packages.filter(p => p.isActive)))
      .catch(() => setPackages([]))
  }, [loadTenants])

  const sortedTenants = useMemo(
    () => sortTenants(tenants, sortField, sortDir),
    [tenants, sortField, sortDir],
  )

  const activeTenants = useMemo(
    () => tenants.filter(tenant => tenant.status === 'ACTIVE').length,
    [tenants],
  )
  const rootTenants = useMemo(
    () => tenants.filter(tenant => tenant.type === 'ROOT').length,
    [tenants],
  )
  const totalMembers = useMemo(
    () => tenants.reduce((sum, tenant) => sum + tenant.memberCount, 0),
    [tenants],
  )

  async function openCreateModal() {
    setCreateError(null)
    setCreateName('')
    setCreateSlug('')
    setCreateParentId('')
    setIsCreateModalOpen(true)
    try {
      const data = await apiGet<{ tenants: Tenant[] }>('/api/v1/platform/tenants?status=ACTIVE')
      const candidates = eligibleParentTenants(data.tenants)
      setParentCandidates(candidates)
      if (candidates.length === 1 && candidates[0]) setCreateParentId(candidates[0].id)
    } catch (err) {
      setParentCandidates([])
      setCreateError(describeTenantCreateError(err))
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setCreateError(null)
    const built = buildChildTenantPayload({ parentId: createParentId, name: createName, slug: createSlug }, parentCandidates)
    if (!built.ok) {
      setCreateError(built.error)
      return
    }
    setCreating(true)
    try {
      await apiPost('/api/v1/platform/tenants', built.payload)
      setCreateName('')
      setCreateSlug('')
      setCreateParentId('')
      setIsCreateModalOpen(false)
      await loadTenants()
    } catch (err) {
      setCreateError(describeTenantCreateError(err))
    } finally {
      setCreating(false)
    }
  }

  function openDetail(tenant: Tenant) {
    setSelectedTenant(tenant)
    setEditName(tenant.name)
    setSelectedPackageId(tenant.packageId ?? '')
    setActiveTab('info')
    setActionMessage(null)
  }

  async function handleUpdate(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedTenant) return
    setUpdating(true)
    setActionMessage(null)
    try {
      const updated = await apiPatch<Tenant>(`/api/v1/platform/tenants/${selectedTenant.id}`, {
        name: editName,
        packageId: selectedPackageId || null,
      })
      setSelectedTenant(updated)
      setActionMessage({ type: 'success', text: 'Tenant bilgileri ve paketi güncellendi' })
      await loadTenants()
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Güncelleme başarısız' })
    } finally {
      setUpdating(false)
    }
  }

  async function executeAction() {
    if (!selectedTenant || !confirmAction) return
    const action = confirmAction.type
    setUpdating(true)
    setActionMessage(null)
    try {
      await apiPost(`/api/v1/platform/tenants/${selectedTenant.id}/${action}`)
      const updatedStatus = action === 'suspend' ? 'SUSPENDED' : 'ARCHIVED'
      setSelectedTenant({ ...selectedTenant, status: updatedStatus })
      setActionMessage({ type: 'success', text: `Tenant başarıyla ${action === 'suspend' ? 'askıya alındı' : 'arşivlendi'}` })
      setConfirmAction(null)
      await loadTenants()
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Tenant işlemi başarısız' })
    } finally {
      setUpdating(false)
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(current => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDir(field === 'createdAt' || field === 'memberCount' ? 'desc' : 'asc')
  }

  return (
    <div className="space-y-4">
      <PageIntro
        eyebrow="Platform"
        title="Kiracılar"
        description="Sistemdeki tüm tenantların listesi ve yaşam döngüsü yönetimi."
        density="compact"
        actions={
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setIsProvisionModalOpen(true)} className="app-button-primary-dense px-3.5">
              Müşteri Provision Et
            </button>
            <button type="button" onClick={() => void openCreateModal()} className="app-button-outline-dense px-3.5">
              Yeni Alt Tenant
            </button>
          </div>
        }
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Toplam Tenant" value={total} tone="accent" density="compact" />
        <StatCard label="Aktif Tenant" value={activeTenants} density="compact" />
        <StatCard label="Root Tenant" value={rootTenants} density="compact" />
        <StatCard label="Toplam Üye" value={totalMembers} density="compact" />
      </section>

      <section className="app-card-dense p-3">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_180px_auto]">
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="app-input-dense"
            placeholder="Tenant adı veya slug ara..."
          />
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
            className="app-input-dense"
          >
            <option value="">Tüm durumlar</option>
            <option value="ACTIVE">Aktif</option>
            <option value="SUSPENDED">Askıda</option>
            <option value="ARCHIVED">Arşiv</option>
          </select>
          <button type="button" onClick={() => void loadTenants()} className="app-button-outline-dense px-3.5">
            Yenile
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="app-card-dense flex items-center justify-center px-4 py-10 text-sm text-ink-muted">
          <span className="animate-pulse">Tenant listesi yükleniyor...</span>
        </div>
      ) : sortedTenants.length === 0 ? (
        <EmptyState
          title="Tenant bulunamadı"
          description="Yeni tenant oluşturabilir veya filtreleri temizleyebilirsiniz."
        />
      ) : (
        <div className="app-table-shell overflow-hidden">
          <table className="app-table">
            <thead>
              <tr>
                <th className="app-th">
                  <SortButton
                    label="Tenant"
                    active={sortField === 'name'}
                    direction={sortDir}
                    onClick={() => handleSort('name')}
                  />
                </th>
                <th className="app-th">
                  <SortButton
                    label="Tip"
                    active={sortField === 'type'}
                    direction={sortDir}
                    onClick={() => handleSort('type')}
                  />
                </th>
                <th className="app-th">Paket</th>
                <th className="app-th">
                  <SortButton
                    label="Durum"
                    active={sortField === 'status'}
                    direction={sortDir}
                    onClick={() => handleSort('status')}
                  />
                </th>
                <th className="app-th">
                  <SortButton
                    label="Üye"
                    active={sortField === 'memberCount'}
                    direction={sortDir}
                    align="right"
                    onClick={() => handleSort('memberCount')}
                  />
                </th>
                <th className="app-th">
                  <SortButton
                    label="Oluşturulma"
                    active={sortField === 'createdAt'}
                    direction={sortDir}
                    onClick={() => handleSort('createdAt')}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTenants.map(tenant => (
                <tr 
                  key={tenant.id} 
                  className={`app-tr cursor-pointer transition-colors ${selectedTenant?.id === tenant.id ? 'bg-brand/5' : ''}`}
                  onClick={() => openDetail(tenant)}
                >
                  <td className="app-td">
                    <div className="font-medium leading-5 text-ink">{tenant.name}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">{tenant.slug}</div>
                  </td>
                  <td className="app-td">
                    <StatusBadge status={tenant.type} density="compact" />
                  </td>
                  <td className="app-td text-xs">
                    {tenant.packageName ? (
                      <span className="font-medium text-ink">{tenant.packageName}</span>
                    ) : (
                      <span className="text-ink-subtle italic">—</span>
                    )}
                  </td>
                  <td className="app-td">
                    <StatusBadge status={tenant.status} density="compact" />
                  </td>
                  <td className="app-td text-right text-[12px] tabular-nums text-ink-muted">
                    {tenant.memberCount}
                  </td>
                  <td className="app-td text-[11px] text-ink-muted">{formatDate(tenant.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CustomerProvisionModal
        isOpen={isProvisionModalOpen}
        onClose={() => setIsProvisionModalOpen(false)}
        packages={packages}
        onProvisioned={loadTenants}
      />

      {/* Create Tenant Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Yeni Alt Tenant Oluştur"
        description="Mevcut bir tenantın altına yeni bir alt tenant (alt birim) ekleyin."
        density="compact"
        footer={
          <>
            <button type="button" onClick={() => setIsCreateModalOpen(false)} className="app-button-outline-dense px-3" disabled={creating}>
              Vazgeç
            </button>
            <button form="create-tenant-form" type="submit" className="app-button-primary-dense px-3.5" disabled={creating}>
              {creating ? 'Oluşturuluyor...' : 'Alt Tenantı Kaydet'}
            </button>
          </>
        }
      >
        <form id="create-tenant-form" onSubmit={handleCreate} className="space-y-3">
          {createError && (
            <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] leading-relaxed text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
              {createError}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Üst Tenant</label>
            <select
              className="app-input-dense"
              value={createParentId}
              onChange={event => setCreateParentId(event.target.value)}
              required
            >
              <option value="">Üst tenant seçin...</option>
              {parentCandidates.map(parent => (
                <option key={parent.id} value={parent.id}>
                  {parent.name} ({parent.type === 'ROOT' ? 'Müşteri Kökü' : 'Alt Birim'})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Tenant Adı</label>
            <input
              className="app-input-dense"
              placeholder="Örn: Global Lojistik A.Ş."
              value={createName}
              onChange={event => setCreateName(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Slug (Opsiyonel)</label>
            <input
              className="app-input-dense font-mono"
              placeholder="global-lojistik"
              value={createSlug}
              onChange={event => setCreateSlug(event.target.value)}
            />
          </div>
          <div className="rounded-md border border-surface-border bg-surface-subtle p-3 text-[11px] leading-relaxed text-ink-muted">
            Yeni müşteri (kök tenant) bu formdan oluşturulamaz; müşteri kaydı paket, yönetici ve abonelik bilgileriyle müşteri
            provizyon akışından («Müşteri Provision Et» düğmesi) yapılır. Bu form yalnızca mevcut bir tenantın altına alt tenant ekler.
          </div>
        </form>
      </Modal>

      {/* Tenant Detail Panel */}
      <DetailPanel
        isOpen={!!selectedTenant}
        onClose={() => setSelectedTenant(null)}
        title={selectedTenant?.name ?? ''}
        subtitle={selectedTenant?.slug}
        density="compact"
      >
        {selectedTenant && (
          <div className="space-y-5">
            <Tabs
              tabs={[
                { id: 'info', label: 'Bilgiler' },
                { id: 'hierarchy', label: 'Hiyerarşi' },
              ]}
              activeTab={activeTab}
              onTabChange={(id) => setActiveTab(id as 'info' | 'hierarchy')}
              density="compact"
            />

            {actionMessage && (
              <div className={`rounded-md border px-3 py-2 text-[12px] animate-in fade-in slide-in-from-top-2 duration-300 ${
                actionMessage.type === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
              }`}>
                {actionMessage.text}
              </div>
            )}

            {activeTab === 'info' && (
              <div className="space-y-5">
                <div>
                  <SectionHeader title="Kiracı Kimliği" description="Sistem genelinde kullanılan temel tanımlayıcılar." density="compact" />
                  <div className="grid gap-x-4 gap-y-2 rounded-lg border border-surface-border bg-surface-subtle/30 p-3 md:grid-cols-2">
                    <DataRow label="Tenant ID" value={selectedTenant.id} density="compact" />
                    <DataRow label="Slug" value={selectedTenant.slug} density="compact" />
                    <DataRow label="Kayıt Tarihi" value={formatDate(selectedTenant.createdAt)} density="compact" />
                    <DataRow label="Üye Sayısı" density="compact">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold">{selectedTenant.memberCount}</span>
                        <span className="text-[10px] text-ink-muted font-medium uppercase tracking-wider">Kullanıcı</span>
                      </div>
                    </DataRow>
                  </div>
                </div>

                <div>
                  <SectionHeader title="Durum ve Tip" density="compact" />
                  <div className="grid gap-x-4 gap-y-2 rounded-lg border border-surface-border bg-surface-subtle/30 p-3 md:grid-cols-2">
                    <DataRow label="Operasyonel Durum" density="compact">
                      <StatusBadge status={selectedTenant.status} density="compact" />
                    </DataRow>
                    <DataRow label="Kiracı Tipi" density="compact">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={selectedTenant.type} density="compact" />
                        <span className="text-[10px] text-ink-muted italic">
                          {selectedTenant.type === 'ROOT' ? '(Müşteri Kökü)' : selectedTenant.type === 'PLATFORM_ROOT' ? '(Sistem Kökü)' : '(Alt Birim)'}
                        </span>
                      </div>
                    </DataRow>
                  </div>
                </div>

                <form onSubmit={handleUpdate} className="space-y-3">
                  <SectionHeader title="Künye ve Paket Bilgileri" description="Kiracının adını ve kaynak paketini güncelleyin." density="compact" />
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold tracking-widest text-ink-subtle">İsim</label>
                      <input
                        className="app-input-dense"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Tenant adı"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold tracking-widest text-ink-subtle">Kaynak Paketi (Paket)</label>
                      <select
                        className="app-input-dense"
                        value={selectedPackageId}
                        onChange={(e) => setSelectedPackageId(e.target.value)}
                      >
                        <option value="">-- Paket Seçin --</option>
                        {packages.map(pkg => (
                          <option key={pkg.id} value={pkg.id}>
                            {pkg.code} — {pkg.name} ({pkg.maxUserCount} Kullanıcı / {pkg.maxStorageMb} MB)
                          </option>
                        ))}
                      </select>
                    </div>
                    <button className="app-button-primary-dense w-full" disabled={updating}>
                      {updating ? 'Güncelleniyor...' : 'Bilgileri Kaydet'}
                    </button>
                  </div>
                </form>

                <ActionGroup title="Yaşam Döngüsü" density="compact">
                  {selectedTenant.status === 'ACTIVE' && (
                    <button
                      type="button"
                      onClick={() => setConfirmAction({
                        type: 'suspend',
                        title: 'Tenantı Askıya Al',
                        description: `"${selectedTenant.name}" tenantı askıya alındığında hiçbir kullanıcı giriş yapamaz ve sistem kaynaklarına erişemez.`
                      })}
                      disabled={updating}
                      className="app-button-outline-dense flex-1 border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-900/60 dark:text-amber-400 dark:hover:bg-amber-950/40"
                    >
                      Askıya Al
                    </button>
                  )}
                  {selectedTenant.status !== 'ARCHIVED' && (
                    <button
                      type="button"
                      onClick={() => setConfirmAction({
                        type: 'archive',
                        title: 'Tenantı Arşivle',
                        description: `"${selectedTenant.name}" tenantı arşivlendiğinde sistemden tamamen gizlenir. Bu işlem veri güvenliği için kritiktir.`
                      })}
                      disabled={updating}
                      className="app-button-outline-dense flex-1 border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40"
                    >
                      Arşivle
                    </button>
                  )}
                </ActionGroup>
              </div>
            )}

            {activeTab === 'hierarchy' && (
              <div className="space-y-5">
                <div>
                  <SectionHeader title="Ağaç Yapısı" description="Kiracının sistem hiyerarşisindeki konumu." density="compact" />
                  <div className="grid gap-x-4 gap-y-2 rounded-lg border border-surface-border bg-surface-subtle/30 p-3">
                    <DataRow label="Üst Birim (Parent)" density="compact">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-brand" />
                        {selectedTenant.parentName ? (
                          <span className="text-xs font-medium text-ink">
                            {selectedTenant.parentName} <span className="font-mono text-[11px] text-ink-subtle">({selectedTenant.parentSlug})</span>
                          </span>
                        ) : (
                          <code className="text-xs font-mono">{selectedTenant.parentId || '—'}</code>
                        )}
                        {!selectedTenant.parentId && <Badge density="compact">Sistem Kökü</Badge>}
                      </div>
                    </DataRow>
                    <DataRow label="Müşteri Kökü (Customer Root)" density="compact">
                      <div className="flex items-center gap-2 text-ink">
                        <div className="h-1.5 w-1.5 rounded-full bg-ink-subtle" />
                        {selectedTenant.customerRootName ? (
                          <span className="text-xs font-medium text-ink">
                            {selectedTenant.customerRootName} <span className="font-mono text-[11px] text-ink-subtle">({selectedTenant.customerRootSlug})</span>
                          </span>
                        ) : (
                          <code className="text-xs font-mono">{selectedTenant.customerRootId || '—'}</code>
                        )}
                        {selectedTenant.id === selectedTenant.customerRootId && <Badge tone="info" density="compact">Müşteri Sahibi</Badge>}
                      </div>
                    </DataRow>
                  </div>
                </div>
                
                <div className="rounded-md border border-surface-border bg-surface-subtle p-3">
                  <p className="text-[11px] leading-relaxed text-ink-muted italic">
                    Hiyerarşi bilgileri yukarıda isimleri ve slug bilgileriyle gösterilmektedir.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </DetailPanel>

      {/* Lifecycle Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={executeAction}
        title={confirmAction?.title ?? ''}
        description={confirmAction?.description ?? ''}
        confirmLabel={confirmAction?.type === 'suspend' ? 'Askıya Al' : 'Arşivle'}
        confirmTone={confirmAction?.type === 'suspend' ? 'warning' : 'danger'}
        isLoading={updating}
      />
    </div>
  )
}
