'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost } from '@/lib/api'
import { EmptyState, PageIntro, StatCard, StatusBadge } from '@/components/platform-admin-ui'

interface Role {
  id: string
  name: string
  description: string | null
  isBuiltin: boolean
  permissionCount: number
}

interface RoleDetail {
  id: string
  name: string
  description: string | null
  isBuiltin: boolean
  permissions: { id: string; code: string; description: string | null }[]
}

interface Permission {
  id: string
  code: string
  description: string | null
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedRole, setSelectedRole] = useState<RoleDetail | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [selectedPermission, setSelectedPermission] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadRoles() {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet<{ roles: Role[] }>('/api/v1/platform/roles')
      setRoles(data.roles)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rol listesi yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  async function openRole(roleId: string) {
    setBusy(true)
    try {
      const [detail, available] = await Promise.all([
        apiGet<RoleDetail>(`/api/v1/platform/roles/${roleId}`),
        apiGet<{ permissions: Permission[] }>('/api/v1/platform/permissions'),
      ])
      setSelectedRole(detail)
      setPermissions(available.permissions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rol detayı yüklenemedi')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void loadRoles()
  }, [])

  const unassignedPermissions = useMemo(() => {
    const assigned = new Set(selectedRole?.permissions.map(permission => permission.code) ?? [])
    return permissions.filter(permission => !assigned.has(permission.code))
  }, [permissions, selectedRole])

  const sortedRoles = useMemo(
    () =>
      [...roles].sort(
        (a, b) => Number(b.isBuiltin) - Number(a.isBuiltin) || a.name.localeCompare(b.name, 'tr'),
      ),
    [roles],
  )

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await apiPost('/api/v1/platform/roles', {
        name: createName,
        description: createDescription || undefined,
      })
      setCreateName('')
      setCreateDescription('')
      await loadRoles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rol oluşturulamadı')
    } finally {
      setBusy(false)
    }
  }

  async function handleAssign(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedRole || !selectedPermission) return

    setBusy(true)
    setError(null)
    try {
      const updated = await apiPost<RoleDetail>(
        `/api/v1/platform/roles/${selectedRole.id}/permissions`,
        { permissionCode: selectedPermission },
      )
      setSelectedRole(updated)
      setSelectedPermission('')
      await loadRoles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İzin atanamadı')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Platform"
        title="Roller"
        description="Yerleşik roller önce, özel roller sonra gelecek şekilde sıralanır."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Toplam Rol" value={roles.length} tone="accent" />
        <StatCard label="Yerleşik Rol" value={roles.filter(role => role.isBuiltin).length} />
        <StatCard label="İzin Havuzu" value={permissions.length || '—'} />
      </section>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-4">
          <form onSubmit={handleCreate} className="app-card grid gap-3 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-ink-subtle">
              Yeni Rol
            </h2>
            <input
              className="app-input"
              value={createName}
              onChange={event => setCreateName(event.target.value)}
              placeholder="Örn: ANALYST"
            />
            <input
              className="app-input"
              value={createDescription}
              onChange={event => setCreateDescription(event.target.value)}
              placeholder="Açıklama"
            />
            <button className="app-button-primary" disabled={busy}>
              Rol Oluştur
            </button>
          </form>

          <div className="app-table-shell">
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-ink-subtle">
                Rol Listesi
              </h2>
              <span className="text-xs text-ink-subtle">Varsayılan: yerleşik önce, ad artan</span>
            </div>
            {loading ? <div className="px-4 py-6 text-sm text-ink-muted">Roller yükleniyor...</div> : null}
            {!loading && sortedRoles.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Rol bulunamadı" description="Önce bir rol oluşturun." />
              </div>
            ) : null}
            {!loading &&
              sortedRoles.map(role => (
                <button
                  key={role.id}
                  type="button"
                  className="flex w-full items-center justify-between border-t border-surface-border px-4 py-3 text-left transition-colors duration-150 ease-in-out hover:bg-surface-subtle"
                  onClick={() => {
                    void openRole(role.id)
                  }}
                >
                  <span className="space-y-1">
                    <span className="block font-medium text-ink">{role.name}</span>
                    <StatusBadge status={role.isBuiltin ? 'ROOT' : 'STANDARD'} />
                  </span>
                  <span className="text-sm text-ink-muted">{role.permissionCount} izin</span>
                </button>
              ))}
          </div>
        </section>

        <section className="app-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-ink-subtle">
            Rol Detayı
          </h2>
          {!selectedRole ? (
            <div className="pt-4">
              <EmptyState
                title="Rol seçilmedi"
                description="Detay görmek ve izin atamak için sol listeden bir rol seçin."
              />
            </div>
          ) : null}
          {selectedRole ? (
            <>
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-ink">{selectedRole.name}</h3>
                  <StatusBadge status={selectedRole.isBuiltin ? 'ROOT' : 'STANDARD'} />
                </div>
                <p className="text-sm text-ink-muted">
                  {selectedRole.description ?? 'Açıklama yok'}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {selectedRole.permissions.map(permission => (
                  <span
                    key={permission.id}
                    className="rounded-full bg-surface-subtle px-3 py-1 text-xs font-medium text-ink"
                  >
                    {permission.code}
                  </span>
                ))}
              </div>

              {selectedRole.isBuiltin ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                  Yerleşik roller salt okunurdur. Farklı izin kombinasyonları için özel rol
                  oluşturun.
                </div>
              ) : (
                <form onSubmit={handleAssign} className="mt-4 grid gap-3">
                  <select
                    value={selectedPermission}
                    onChange={event => setSelectedPermission(event.target.value)}
                    className="app-input"
                  >
                    <option value="">Atanacak izin seçin</option>
                    {unassignedPermissions.map(permission => (
                      <option key={permission.id} value={permission.code}>
                        {permission.code}
                      </option>
                    ))}
                  </select>
                  <button className="app-button-primary" disabled={busy || !selectedPermission}>
                    İzin Ata
                  </button>
                </form>
              )}
            </>
          ) : null}
        </section>
      </div>
    </div>
  )
}
