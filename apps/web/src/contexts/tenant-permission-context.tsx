'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { tenantApiGet } from '../lib/api'
import { getActiveTenantId, TENANT_CHANGE_EVENT } from '../lib/tenant-context'

interface TenantPermissionContextValue {
  permissions: string[]
  isTenantAdmin: boolean
  loading: boolean
  can: (code: string) => boolean
  refresh: () => void
}

const TenantPermissionContext = createContext<TenantPermissionContextValue>({
  permissions: [],
  isTenantAdmin: false,
  loading: true,
  can: () => false,
  refresh: () => undefined,
})

export function TenantPermissionProvider({ children }: { children: React.ReactNode }) {
  const [permissions, setPermissions] = useState<string[]>([])
  const [isTenantAdmin, setIsTenantAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  function refresh() {
    const tenantId = getActiveTenantId()
    if (!tenantId) {
      setPermissions([])
      setIsTenantAdmin(false)
      setLoading(false)
      return
    }

    setLoading(true)
    void tenantApiGet<{ permissions: string[]; isTenantAdmin: boolean }>(
      '/api/v1/platform/me/tenant-permissions',
    )
      .then(data => {
        if (!mountedRef.current) return
        setPermissions(data.permissions)
        setIsTenantAdmin(data.isTenantAdmin)
        setLoading(false)
      })
      .catch(() => {
        if (!mountedRef.current) return
        setPermissions([])
        setIsTenantAdmin(false)
        setLoading(false)
      })
  }

  useEffect(() => {
    mountedRef.current = true
    refresh()
    function handleTenantChange() {
      refresh()
    }
    window.addEventListener(TENANT_CHANGE_EVENT, handleTenantChange)
    return () => {
      mountedRef.current = false
      window.removeEventListener(TENANT_CHANGE_EVENT, handleTenantChange)
    }
  }, [])

  return (
    <TenantPermissionContext.Provider
      value={{
        permissions,
        isTenantAdmin,
        loading,
        can: (code: string) => !loading && (isTenantAdmin || permissions.includes(code) || permissions.includes('*')),
        refresh,
      }}
    >
      {children}
    </TenantPermissionContext.Provider>
  )
}

export function useTenantPermissions() {
  return useContext(TenantPermissionContext)
}
