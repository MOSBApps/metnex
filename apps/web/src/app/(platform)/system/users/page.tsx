'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import { beginImpersonation } from '@/lib/impersonation'
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

interface User {
  id: string
  email: string
  displayName: string
  isSystemAdmin: boolean
  status: string
  createdAt: string
}

interface RoleAssignment {
  id: string
  roleId: string
  roleName: string
  tenantId: string | null
  tenantName: string | null
  tenantSlug: string | null
  createdAt: string
}

interface Membership {
  id: string
  tenantId: string
  tenantName: string
  tenantSlug: string
  tenantType: string
  tenantStatus: string
  isActive: boolean
  createdAt: string
}

interface Role {
  id: string
  name: string
  description: string | null
}

interface TenantOption {
  id: string
  name: string
  slug: string
}

type SortField = 'displayName' | 'email' | 'status' | 'createdAt'
type SortDir = 'asc' | 'desc'

function sortUsers(rows: User[], field: SortField, dir: SortDir) {
  const sorted = [...rows].sort((a, b) => {
    if (field === 'createdAt') {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    }

    return String(a[field] ?? '').localeCompare(String(b[field] ?? ''), 'tr', {
      sensitivity: 'base',
    })
  })

  return dir === 'asc' ? sorted : sorted.reverse()
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Metadata state
  const [assignableRoles, setAssignableRoles] = useState<Role[]>([])
  const [assignableTenants, setAssignableTenants] = useState<TenantOption[]>([])

  // Create state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createEmail, setCreateEmail] = useState('')
  const [createName, setCreateName] = useState('')
  const [createPassword, setCreatePassword] = useState('')

  // Selected User state
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'roles' | 'memberships' | 'security'>('info')
  const [editName, setEditName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [updating, setUpdating] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Roles state
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([])
  const [newRoleId, setNewRoleId] = useState('')
  const [newRoleTenantId, setNewRoleTenantId] = useState('')

  // Memberships state
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [newMembershipTenantId, setNewMembershipTenantId] = useState('')

  // Confirm states
  const [confirmAction, setConfirmAction] = useState<{
    type: 'deactivate' | 'impersonate' | 'revoke-role' | 'remove-membership'
    title: string
    description: string
    targetId?: string
  } | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      if (statusFilter) params.set('status', statusFilter)
      const data = await apiGet<{ users: User[]; total: number }>(
        `/api/v1/platform/users${params.size ? `?${params}` : ''}`,
      )
      setUsers(data.users)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kullanıcılar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [query, statusFilter])

  const loadMetadata = useCallback(async () => {
    try {
      const [rolesData, tenantsData] = await Promise.all([
        apiGet<{ roles: Role[] }>('/api/v1/platform/users/assignable-roles'),
        apiGet<{ tenants: TenantOption[] }>('/api/v1/platform/users/assignable-tenants'),
      ])
      setAssignableRoles(rolesData.roles)
      setAssignableTenants(tenantsData.tenants)
    } catch (err) {
      console.error('Metadata load failed', err)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
    void loadMetadata()
  }, [loadUsers, loadMetadata])

  const sortedUsers = useMemo(
    () => sortUsers(users, sortField, sortDir),
    [users, sortField, sortDir],
  )

  const activeUsers = useMemo(() => users.filter(user => user.status === 'ACTIVE').length, [users])
  const systemAdmins = useMemo(() => users.filter(user => user.isSystemAdmin).length, [users])

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError(null)
    try {
      await apiPost('/api/v1/platform/users', {
        email: createEmail,
        displayName: createName,
        password: createPassword,
      })
      setCreateEmail('')
      setCreateName('')
      setCreatePassword('')
      setIsCreateModalOpen(false)
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kullanıcı oluşturulamadı')
    } finally {
      setCreating(false)
    }
  }

  async function loadUserDetail(userId: string) {
    try {
      const [detail, membershipData] = await Promise.all([
        apiGet<User & { roleAssignments: RoleAssignment[] }>(`/api/v1/platform/users/${userId}`),
        apiGet<{ memberships: Membership[] }>(`/api/v1/platform/users/${userId}/memberships`),
      ])
      setRoleAssignments(detail.roleAssignments)
      setMemberships(membershipData.memberships)
    } catch (err) {
      console.error('User detail load failed', err)
    }
  }

  function openDetail(user: User) {
    setSelectedUser(user)
    setEditName(user.displayName)
    setNewPassword('')
    setActiveTab('info')
    setActionMessage(null)
    void loadUserDetail(user.id)
  }

  async function handleUpdateName(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedUser) return
    setUpdating(true)
    setActionMessage(null)
    try {
      const updated = await apiPatch<User>(`/api/v1/platform/users/${selectedUser.id}`, { 
        displayName: editName 
      })
      setSelectedUser(updated)
      setActionMessage({ type: 'success', text: 'Kullanıcı adı güncellendi' })
      await loadUsers()
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Güncelleme başarısız' })
    } finally {
      setUpdating(false)
    }
  }

  async function handleSetPassword(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedUser || !newPassword) return
    setUpdating(true)
    setActionMessage(null)
    try {
      await apiPost(`/api/v1/platform/users/${selectedUser.id}/set-password`, { password: newPassword })
      setNewPassword('')
      setActionMessage({ type: 'success', text: 'Parola başarıyla güncellendi' })
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Parola güncellenemedi' })
    } finally {
      setUpdating(false)
    }
  }

  async function handleAssignRole(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedUser || !newRoleId) return
    setUpdating(true)
    setActionMessage(null)
    try {
      const assignment = await apiPost<RoleAssignment>(`/api/v1/platform/users/${selectedUser.id}/roles`, {
        roleId: newRoleId,
        tenantId: newRoleTenantId || null,
      })
      setRoleAssignments(prev => [assignment, ...prev])
      setNewRoleId('')
      setNewRoleTenantId('')
      setActionMessage({ type: 'success', text: 'Rol başarıyla atandı' })
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Rol atanamadı' })
    } finally {
      setUpdating(false)
    }
  }

  async function handleAddMembership(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedUser || !newMembershipTenantId) return
    setUpdating(true)
    setActionMessage(null)
    try {
      const membership = await apiPost<Membership>(`/api/v1/platform/users/${selectedUser.id}/memberships`, {
        tenantId: newMembershipTenantId,
      })
      setMemberships(prev => [membership, ...prev])
      setNewMembershipTenantId('')
      setActionMessage({ type: 'success', text: 'Kullanıcı kiracıya eklendi' })
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Üyelik eklenemedi' })
    } finally {
      setUpdating(false)
    }
  }

  async function executeDeactivate() {
    if (!selectedUser) return
    setUpdating(true)
    try {
      await apiPost(`/api/v1/platform/users/${selectedUser.id}/deactivate`)
      const updated = { ...selectedUser, status: 'INACTIVE' }
      setSelectedUser(updated)
      setActionMessage({ type: 'success', text: 'Kullanıcı pasife alındı' })
      setConfirmAction(null)
      await loadUsers()
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Kullanıcı pasife alınamadı' })
    } finally {
      setUpdating(false)
    }
  }

  async function executeImpersonate() {
    if (!selectedUser) return
    try {
      const response = await apiPost<{
        accessToken: string
        impersonatedUser: { id: string; email: string; displayName: string }
        impersonator: { email: string }
      }>(`/api/v1/platform/users/${selectedUser.id}/impersonate`)

      beginImpersonation(response.accessToken, {
        impersonatedUserId: response.impersonatedUser.id,
        impersonatedUserEmail: response.impersonatedUser.email,
        impersonatedUserDisplayName: response.impersonatedUser.displayName,
        impersonatorEmail: response.impersonator.email,
      })
      window.location.href = '/tenant-select'
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Impersonation başlatılamadı' })
      setConfirmAction(null)
    }
  }

  async function executeRevokeRole() {
    if (!selectedUser || !confirmAction?.targetId) return
    setUpdating(true)
    try {
      await apiDelete(`/api/v1/platform/users/${selectedUser.id}/roles/${confirmAction.targetId}`)
      setRoleAssignments(prev => prev.filter(a => a.id !== confirmAction.targetId))
      setActionMessage({ type: 'success', text: 'Rol ataması geri alındı' })
      setConfirmAction(null)
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Rol geri alınamadı' })
    } finally {
      setUpdating(false)
    }
  }

  async function executeRemoveMembership() {
    if (!selectedUser || !confirmAction?.targetId) return
    setUpdating(true)
    try {
      await apiDelete(`/api/v1/platform/users/${selectedUser.id}/memberships/${confirmAction.targetId}`)
      setMemberships(prev => prev.filter(m => m.id !== confirmAction.targetId))
      setActionMessage({ type: 'success', text: 'Üyelik sonlandırıldı' })
      setConfirmAction(null)
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Üyelik sonlandırılamadı' })
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
    setSortDir(field === 'createdAt' ? 'desc' : 'asc')
  }

  return (
    <div className="space-y-4">
      <PageIntro
        eyebrow="Platform"
        title="Kullanıcılar"
        description="Platform kullanıcı listesi. Detayları görmek ve işlem yapmak için satıra tıklayın."
        density="compact"
        actions={
          <button 
            type="button" 
            onClick={() => setIsCreateModalOpen(true)}
            className="app-button-primary-dense px-3.5"
          >
            Yeni Kullanıcı
          </button>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        <StatCard label="Toplam Kullanıcı" value={total} tone="accent" density="compact" />
        <StatCard label="Aktif Kullanıcı" value={activeUsers} density="compact" />
        <StatCard label="Sistem Yöneticisi" value={systemAdmins} density="compact" />
      </section>

      <section className="app-card-dense p-3">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_180px_auto]">
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="app-input-dense"
            placeholder="Ad veya e-posta ara..."
          />
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
            className="app-input-dense"
          >
            <option value="">Tüm durumlar</option>
            <option value="ACTIVE">Aktif</option>
            <option value="INACTIVE">Pasif</option>
            <option value="LOCKED">Kilitli</option>
          </select>
          <button type="button" onClick={() => void loadUsers()} className="app-button-outline-dense px-3.5">
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
          <span className="animate-pulse">Kullanıcılar yükleniyor...</span>
        </div>
      ) : sortedUsers.length === 0 ? (
        <EmptyState
          title="Kullanıcı bulunamadı"
          description="Filtreleri temizleyin veya yeni bir kullanıcı oluşturun."
        />
      ) : (
        <div className="app-table-shell overflow-hidden">
          <table className="app-table">
            <thead>
              <tr>
                <th className="app-th">
                  <SortButton
                    label="Kullanıcı"
                    active={sortField === 'displayName'}
                    direction={sortDir}
                    onClick={() => handleSort('displayName')}
                  />
                </th>
                <th className="app-th">
                  <SortButton
                    label="E-posta"
                    active={sortField === 'email'}
                    direction={sortDir}
                    onClick={() => handleSort('email')}
                  />
                </th>
                <th className="app-th">
                  <SortButton
                    label="Durum"
                    active={sortField === 'status'}
                    direction={sortDir}
                    onClick={() => handleSort('status')}
                  />
                </th>
                <th className="app-th">Yetki</th>
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
              {sortedUsers.map(user => (
                <tr 
                  key={user.id} 
                  className={`app-tr cursor-pointer transition-colors ${selectedUser?.id === user.id ? 'bg-brand/5' : ''}`}
                  onClick={() => openDetail(user)}
                >
                  <td className="app-td">
                    <div className="font-medium leading-5 text-ink">{user.displayName}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">{user.id.slice(0, 8)}</div>
                  </td>
                  <td className="app-td font-mono text-[12px] text-ink-muted">{user.email}</td>
                  <td className="app-td">
                    <StatusBadge status={user.status} density="compact" />
                  </td>
                  <td className="app-td">
                    {user.isSystemAdmin ? (
                      <StatusBadge status="ROOT" density="compact" />
                    ) : (
                      <span className="text-[11px] text-ink-muted">Standart kullanıcı</span>
                    )}
                  </td>
                  <td className="app-td text-[11px] text-ink-muted">{formatDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Yeni Kullanıcı Oluştur"
        description="Platforma erişimi olan yeni bir kullanıcı hesabı tanımlayın."
        density="compact"
        footer={
          <>
            <button type="button" onClick={() => setIsCreateModalOpen(false)} className="app-button-outline-dense px-3" disabled={creating}>
              Vazgeç
            </button>
            <button form="create-user-form" type="submit" className="app-button-primary-dense px-3.5" disabled={creating}>
              {creating ? 'Oluşturuluyor...' : 'Kullanıcıyı Kaydet'}
            </button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={handleCreate} className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Ad Soyad</label>
            <input
              className="app-input-dense"
              placeholder="Örn: Ahmet Yılmaz"
              value={createName}
              onChange={event => setCreateName(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">E-posta</label>
            <input
              className="app-input-dense"
              placeholder="ahmet@ornek.com"
              type="email"
              value={createEmail}
              onChange={event => setCreateEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Geçici Parola</label>
            <input
              className="app-input-dense"
              placeholder="••••••••"
              type="password"
              value={createPassword}
              onChange={event => setCreatePassword(event.target.value)}
              required
            />
          </div>
        </form>
      </Modal>

      {/* User Detail Panel */}
      <DetailPanel
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title={selectedUser?.displayName ?? ''}
        subtitle={selectedUser?.email}
        density="compact"
      >
        {selectedUser && (
          <div className="space-y-5">
            <Tabs
              tabs={[
                { id: 'info', label: 'Bilgiler' },
                { id: 'roles', label: 'Yetkiler' },
                { id: 'memberships', label: 'Üyelikler' },
                { id: 'security', label: 'Güvenlik' },
              ]}
              activeTab={activeTab}
              onTabChange={(id) => setActiveTab(id as 'info' | 'roles' | 'memberships' | 'security')}
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
                  <SectionHeader title="Kimlik Bilgileri" description="Kullanıcının sistemdeki temel tanımlayıcı ve iletişim bilgileri." density="compact" />
                  <div className="grid gap-x-4 gap-y-2 rounded-lg border border-surface-border bg-surface-subtle/30 p-3 md:grid-cols-2">
                    <DataRow label="Kullanıcı ID" value={selectedUser.id} density="compact" />
                    <DataRow label="E-posta" value={selectedUser.email} density="compact" />
                    <DataRow label="Kayıt Tarihi" value={formatDate(selectedUser.createdAt)} density="compact" />
                  </div>
                </div>

                <div>
                  <SectionHeader title="Durum ve Yetki" density="compact" />
                  <div className="grid gap-x-4 gap-y-2 rounded-lg border border-surface-border bg-surface-subtle/30 p-3 md:grid-cols-2">
                    <DataRow label="Hesap Durumu" density="compact">
                      <StatusBadge status={selectedUser.status} density="compact" />
                    </DataRow>
                    <DataRow label="Sistem Yöneticisi" density="compact">
                      {selectedUser.isSystemAdmin ? (
                        <div className="flex items-center gap-2">
                          <Badge tone="brand" density="compact">Evet</Badge>
                          <span className="text-[10px] text-ink-muted italic">(Global bypass aktif)</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-ink-muted">Hayır</span>
                      )}
                    </DataRow>
                  </div>
                </div>

                <form onSubmit={handleUpdateName} className="space-y-3">
                  <SectionHeader title="Profil Düzenle" description="Kullanıcının sistem genelinde görünen adını güncelleyin." density="compact" />
                  <div className="flex gap-2">
                    <input
                      className="app-input-dense"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Görünen ad"
                      required
                    />
                    <button className="app-button-primary-dense whitespace-nowrap px-3.5" disabled={updating}>
                      {updating ? '...' : 'Güncelle'}
                    </button>
                  </div>
                </form>

                <ActionGroup title="Kritik İşlemler" density="compact">
                  <button
                    type="button"
                    onClick={() => setConfirmAction({
                      type: 'impersonate',
                      title: 'Kılığa Gir',
                      description: `"${selectedUser.displayName}" kullanıcısının kimliğiyle sisteme giriş yapacaksınız. Mevcut oturumunuz saklanacaktır.`
                    })}
                    className="app-button-outline-dense flex-1 border-brand/20 bg-brand/5 text-brand"
                  >
                    Kılığına Gir
                  </button>
                  {selectedUser.status === 'ACTIVE' && (
                    <button
                      type="button"
                      onClick={() => setConfirmAction({
                        type: 'deactivate',
                        title: 'Kullanıcıyı Pasife Al',
                        description: `"${selectedUser.displayName}" kullanıcısının sisteme erişimi derhal durdurulacaktır.`
                      })}
                      disabled={updating}
                      className="app-button-outline-dense flex-1 border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40"
                    >
                      Hesabı Pasife Al
                    </button>
                  )}
                </ActionGroup>
              </div>
            )}

            {activeTab === 'roles' && (
              <div className="space-y-5">
                <div>
                  <SectionHeader title="Atanmış Roller" description="Kullanıcıya atanmış olan sistem ve tenant bazlı yetki grupları." density="compact" />
                  <div className="grid gap-2">
                    {roleAssignments.map(assignment => (
                      <div key={assignment.id} className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-subtle/20 px-3 py-2">
                        <div className="space-y-0.5">
                          <div className="text-[13px] font-medium text-ink">{assignment.roleName}</div>
                          <div className="text-[10px] text-ink-muted">
                            {assignment.tenantName ? (
                              <span className="flex items-center gap-1">
                                <span className="font-semibold text-brand">{assignment.tenantName}</span>
                                <span>({assignment.tenantSlug})</span>
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-semibold uppercase tracking-wider dark:text-emerald-400">Global Sistem Rolü</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfirmAction({
                            type: 'revoke-role',
                            title: 'Rolü Geri Al',
                            description: `"${assignment.roleName}" rol atamasını iptal etmek istediğinizden emin misiniz?`,
                            targetId: assignment.id
                          })}
                          className="text-[10px] font-bold uppercase tracking-widest text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                        >
                          Kaldır
                        </button>
                      </div>
                    ))}
                    {roleAssignments.length === 0 && (
                      <div className="rounded-lg border border-dashed border-surface-border bg-surface-subtle/10 p-6 text-center">
                        <p className="text-xs text-ink-muted italic">Kullanıcıya henüz bir rol atanmamış.</p>
                      </div>
                    )}
                  </div>
                </div>

                <form onSubmit={handleAssignRole} className="space-y-3 rounded-lg border border-brand/20 bg-brand/5 p-3">
                  <SectionHeader title="Yeni Rol Ata" description="Kullanıcıya global veya kiracı bazlı bir yetki tanımlayın." density="compact" />
                  <div className="grid gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Sistem Rolü</label>
                      <select 
                        className="app-input-dense" 
                        value={newRoleId} 
                        onChange={e => {
                          setNewRoleId(e.target.value)
                          const role = assignableRoles.find(r => r.id === e.target.value)
                          if (role?.name === 'SYSTEM_ADMIN') {
                            setNewRoleTenantId('')
                          }
                        }}
                        required
                      >
                        <option value="">Rol seçin...</option>
                        {assignableRoles.map(role => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                    </div>
                    {assignableRoles.find(r => r.id === newRoleId)?.name !== 'SYSTEM_ADMIN' ? (
                      <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Kiracı Bağlamı (Opsiyonel)</label>
                        <select 
                          className="app-input-dense" 
                          value={newRoleTenantId} 
                          onChange={e => setNewRoleTenantId(e.target.value)}
                        >
                          <option value="">Global (Tüm Sistem)</option>
                          {assignableTenants.map(tenant => (
                            <option key={tenant.id} value={tenant.id}>{tenant.name} ({tenant.slug})</option>
                          ))}
                        </select>
                        <p className="text-[10px] text-ink-muted italic leading-relaxed">
                          Kiracı seçilmezse yetki sistem genelinde geçerli olur.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-300 leading-relaxed italic">
                        SYSTEM_ADMIN rolü her zaman global (tüm sistem) yetki verir. Tenant seçimi bu rol için devre dışıdır.
                      </div>
                    )}
                    <button
                      type="submit"
                      className="app-button-primary-dense w-full"
                      disabled={updating || !newRoleId}
                    >
                      {updating ? 'Atanıyor...' : 'Rolü Tanımla'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'memberships' && (
              <div className="space-y-5">
                <div>
                  <SectionHeader title="Kiracı Üyelikleri" description="Kullanıcının üye olduğu ve işlem yapabildiği çalışma alanları." density="compact" />
                  <div className="grid gap-2">
                    {memberships.map(m => (
                      <div key={m.id} className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-subtle/20 px-3 py-2">
                        <div className="space-y-0.5">
                          <div className="text-[13px] font-medium text-ink">{m.tenantName}</div>
                          <div className="flex items-center gap-2">
                            <code className="text-[10px] text-ink-subtle">{m.tenantSlug}</code>
                            <StatusBadge status={m.tenantType} density="compact" />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfirmAction({
                            type: 'remove-membership',
                            title: 'Üyeliği Sonlandır',
                            description: `Kullanıcının "${m.tenantName}" kiracısındaki üyeliği silinecektir.`,
                            targetId: m.id
                          })}
                          className="text-[10px] font-bold uppercase tracking-widest text-rose-600 hover:text-rose-700"
                        >
                          Ayrıl
                        </button>
                      </div>
                    ))}
                    {memberships.length === 0 && (
                      <div className="rounded-lg border border-dashed border-surface-border bg-surface-subtle/10 p-6 text-center">
                        <p className="text-xs text-ink-muted italic">Kullanıcının henüz bir kiracı üyeliği bulunmamaktadır.</p>
                      </div>
                    )}
                  </div>
                </div>

                <form onSubmit={handleAddMembership} className="space-y-3 rounded-lg border border-brand/20 bg-brand/5 p-3">
                  <SectionHeader title="Kiracıya Ekle" description="Kullanıcıyı yeni bir çalışma alanına üye yapın." density="compact" />
                  <div className="grid gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Aktif Kiracılar</label>
                      <select 
                        className="app-input-dense" 
                        value={newMembershipTenantId} 
                        onChange={e => setNewMembershipTenantId(e.target.value)}
                        required
                      >
                        <option value="">Kiracı seçin...</option>
                        {assignableTenants.map(tenant => (
                          <option key={tenant.id} value={tenant.id}>{tenant.name} ({tenant.slug})</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="app-button-primary-dense w-full"
                      disabled={updating || !newMembershipTenantId}
                    >
                      {updating ? 'Ekleniyor...' : 'Üyeliği Başlat'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-5">
                <form onSubmit={handleSetPassword} className="space-y-4">
                  <SectionHeader 
                    title="Parola Yönetimi" 
                    description="Kullanıcıya yeni bir geçici parola atayın. Bu işlem mevcut parolayı anında geçersiz kılar." 
                    density="compact"
                  />
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Yeni Geçici Parola</label>
                      <input
                        type="password"
                        className="app-input-dense"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                      />
                    </div>
                    <button className="app-button-primary-dense w-full" disabled={updating || !newPassword}>
                      {updating ? 'Parola Güncelleniyor...' : 'Yeni Parola Tanımla'}
                    </button>
                  </div>
                </form>

                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/40">
                  <h5 className="mb-1 text-[11px] font-bold text-amber-800 dark:text-amber-300">Güvenlik Notu</h5>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                    Parola sıfırlama işlemlerinde kullanıcının kayıtlı e-posta adresine bilgilendirme gitmez (henüz mail servisi aktif değil). 
                    Yeni parolayı kullanıcıya güvenli bir kanal üzerinden iletmeyi unutmayın.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </DetailPanel>

      {/* Action Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction?.type === 'deactivate') void executeDeactivate()
          else if (confirmAction?.type === 'impersonate') void executeImpersonate()
          else if (confirmAction?.type === 'revoke-role') void executeRevokeRole()
          else if (confirmAction?.type === 'remove-membership') void executeRemoveMembership()
        }}
        title={confirmAction?.title ?? ''}
        description={confirmAction?.description ?? ''}
        confirmLabel={
          confirmAction?.type === 'deactivate' ? 'Pasife Al' :
          confirmAction?.type === 'impersonate' ? 'Kılığa Gir' :
          confirmAction?.type === 'revoke-role' ? 'Rolü Geri Al' :
          'Üyeliği Sil'
        }
        confirmTone={
          confirmAction?.type === 'impersonate' ? 'primary' : 'danger'
        }
        isLoading={updating}
      />
    </div>
  )
}
