'use client'

import { useEffect, useState } from 'react'
import { tenantApiGet, tenantApiPatch, tenantApiPost } from '@/lib/api'
import {
  Badge,
  DataRow,
  DetailPanel,
  EmptyState,
  Modal,
  PageIntro,
  SectionHeader,
  StatusBadge,
  Tabs,
} from '@/components/platform-admin-ui'

interface MembershipRow {
  id: string
  tenantId: string
  tenantName: string
  tenantSlug: string
  tenantType: string
}

interface UserRow {
  id: string
  email: string
  displayName: string
  status: string
  memberships: MembershipRow[]
}

interface TenantOption {
  id: string
  name: string
  slug: string
}

export default function CustomerAdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Create state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [creating, setCreating] = useState(false)

  // Selected User state
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'security' | 'memberships'>('info')
  const [editName, setEditName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [updating, setUpdating] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [usersRes, tenantRes] = await Promise.all([
        tenantApiGet<{ users: UserRow[] }>('/api/v1/customer-admin/users'),
        tenantApiGet<{ tenants: TenantOption[] }>('/api/v1/customer-admin/tenants'),
      ])
      setUsers(usersRes.users)
      setTenants(tenantRes.tenants)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kullanıcı verisi yüklenemedi')
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
      await tenantApiPost('/api/v1/customer-admin/users', {
        email,
        displayName,
        password,
        tenantId: tenantId || undefined,
      })
      setEmail('')
      setDisplayName('')
      setPassword('')
      setTenantId('')
      setIsCreateModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kullanıcı oluşturulamadı')
    } finally {
      setCreating(false)
    }
  }

  function openDetail(user: UserRow) {
    setSelectedUser(user)
    setEditName(user.displayName)
    setNewPassword('')
    setActiveTab('info')
    setActionMessage(null)
  }

  async function handleUpdateName(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedUser) return
    setUpdating(true)
    setActionMessage(null)
    try {
      await tenantApiPatch(`/api/v1/customer-admin/users/${selectedUser.id}`, { 
        displayName: editName 
      })
      setSelectedUser({ ...selectedUser, displayName: editName })
      setActionMessage({ type: 'success', text: 'Kullanıcı adı güncellendi' })
      await load()
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
      await tenantApiPost(`/api/v1/customer-admin/users/${selectedUser.id}/set-password`, { 
        password: newPassword 
      })
      setNewPassword('')
      setActionMessage({ type: 'success', text: 'Parola başarıyla güncellendi' })
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Parola güncellenemedi' })
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Müşteri Yönetimi"
        title="Kullanıcılar"
        description="Müşteri ağacınızdaki kullanıcılar ve kiracı üyelikleri."
        actions={
          <button 
            type="button" 
            onClick={() => setIsCreateModalOpen(true)}
            className="app-button-primary px-6"
          >
            Yeni Kullanıcı
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
          <span className="animate-pulse">Kullanıcılar yükleniyor...</span>
        </div>
      ) : users.length === 0 ? (
        <EmptyState title="Kullanıcı bulunamadı" description="İlk kullanıcıyı oluşturarak başlayın." />
      ) : (
        <div className="app-table-shell overflow-hidden">
          <table className="app-table">
            <thead>
              <tr>
                <th className="app-th">Kullanıcı</th>
                <th className="app-th">Durum</th>
                <th className="app-th">Üyelikler</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr 
                  key={user.id} 
                  className={`app-tr cursor-pointer transition-colors ${selectedUser?.id === user.id ? 'bg-brand/5' : ''}`}
                  onClick={() => openDetail(user)}
                >
                  <td className="app-td">
                    <div className="font-medium text-ink">{user.displayName}</div>
                    <div className="font-mono text-[11px] text-ink-subtle">{user.email}</div>
                  </td>
                  <td className="app-td"><StatusBadge status={user.status} /></td>
                  <td className="app-td">
                    <div className="flex flex-wrap gap-1.5">
                      {user.memberships.map(membership => (
                        <Badge key={membership.id}>
                          {membership.tenantName}
                        </Badge>
                      ))}
                      {user.memberships.length === 0 && (
                        <span className="text-[10px] text-ink-subtle italic">Üyelik yok</span>
                      )}
                    </div>
                  </td>
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
        title="Yeni Kullanıcı Tanımla"
        description="Müşteri ekosisteminize yeni bir kullanıcı ekleyin."
        footer={
          <>
            <button type="button" onClick={() => setIsCreateModalOpen(false)} className="app-button-outline px-4" disabled={creating}>
              Vazgeç
            </button>
            <button form="create-user-form" type="submit" className="app-button-primary px-6" disabled={creating}>
              {creating ? 'Oluşturuluyor...' : 'Kullanıcıyı Kaydet'}
            </button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={handleCreate} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Ad Soyad</label>
              <input 
                className="app-input" 
                placeholder="Ahmet Yılmaz" 
                value={displayName} 
                onChange={e => setDisplayName(e.target.value)} 
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">E-posta</label>
              <input 
                className="app-input" 
                placeholder="ahmet@sirket.com" 
                type="email"
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Geçici Parola</label>
            <input 
              className="app-input" 
              placeholder="••••••••" 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">İlk Üyelik (Opsiyonel)</label>
            <select className="app-input text-sm" value={tenantId} onChange={e => setTenantId(e.target.value)}>
              <option value="">Üyelik seçin...</option>
              {tenants.map(tenant => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.slug})
                </option>
              ))}
            </select>
          </div>
        </form>
      </Modal>

      {/* User Detail Panel */}
      <DetailPanel
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title={selectedUser?.displayName ?? ''}
        subtitle={selectedUser?.email}
      >
        {selectedUser && (
          <div className="space-y-8">
            <Tabs
              tabs={[
                { id: 'info', label: 'Bilgiler' },
                { id: 'memberships', label: 'Üyelikler' },
                { id: 'security', label: 'Güvenlik' },
              ]}
              activeTab={activeTab}
              onTabChange={(id) => setActiveTab(id as 'info' | 'security' | 'memberships')}
            />

            {actionMessage && (
              <div className={`rounded-lg px-4 py-3 text-sm border animate-in fade-in slide-in-from-top-2 duration-300 ${
                actionMessage.type === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
              }`}>
                {actionMessage.text}
              </div>
            )}

            {activeTab === 'info' && (
              <div className="space-y-8">
                <div>
                  <SectionHeader title="Kimlik Bilgileri" description="Kullanıcının müşteri sistemindeki temel bilgileri." />
                  <div className="grid gap-4 rounded-xl border border-surface-border p-4 bg-surface-subtle/30">
                    <DataRow label="Kullanıcı ID" value={selectedUser.id} />
                    <DataRow label="E-posta" value={selectedUser.email} />
                    <DataRow label="Durum">
                      <StatusBadge status={selectedUser.status} />
                    </DataRow>
                  </div>
                </div>

                <form onSubmit={handleUpdateName} className="space-y-4">
                  <SectionHeader title="Profili Güncelle" description="Görünen ad müşteri genelinde geçerli olacaktır." />
                  <div className="flex gap-2">
                    <input
                      className="app-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Görünen ad"
                      required
                    />
                    <button className="app-button-primary whitespace-nowrap px-6" disabled={updating}>
                      {updating ? '...' : 'Güncelle'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'memberships' && (
              <div className="space-y-6">
                <SectionHeader title="Aktif Kiracı Üyelikleri" description="Kullanıcının erişim yetkisi olan çalışma alanları." />
                <div className="grid gap-3">
                  {selectedUser.memberships.map(m => (
                    <div key={m.id} className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-subtle/20 px-4 py-3">
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium text-ink">{m.tenantName}</div>
                        <div className="font-mono text-[10px] text-ink-subtle uppercase tracking-wider">{m.tenantSlug}</div>
                      </div>
                      <StatusBadge status={m.tenantType} />
                    </div>
                  ))}
                  {selectedUser.memberships.length === 0 && (
                    <div className="rounded-xl border border-dashed border-surface-border p-8 text-center bg-surface-subtle/10">
                      <p className="text-xs text-ink-muted italic">Kullanıcının henüz bir kiracı üyeliği bulunmamaktadır.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-8">
                <form onSubmit={handleSetPassword} className="space-y-6">
                  <SectionHeader 
                    title="Yeni Parola Ata" 
                    description="Kullanıcıya yeni bir geçici parola atayın. Mevcut parolası anında geçersiz sayılacaktır." 
                  />
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">Yeni Geçici Parola</label>
                      <input
                        type="password"
                        className="app-input font-mono"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                      />
                    </div>
                    <button className="app-button-primary w-full py-2.5" disabled={updating || !newPassword}>
                      {updating ? 'Parola Güncelleniyor...' : 'Yeni Parola Tanımla'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </DetailPanel>
    </div>
  )
}
