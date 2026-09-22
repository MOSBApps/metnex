'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTenantPermissions } from '../../../../contexts/tenant-permission-context'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { can, loading } = useTenantPermissions()
  const router = useRouter()

  useEffect(() => {
    // If we've finished loading and the user doesn't have the required permission, redirect them to /app
    if (!loading && !can('CUSTOMER:ADMIN:VIEW')) {
      router.replace('/app')
    }
  }, [can, loading, router])

  // Don't render the children if we are still loading or if the user doesn't have the permission
  if (loading || !can('CUSTOMER:ADMIN:VIEW')) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-ink-muted">Yetki kontrolü yapılıyor...</p>
      </div>
    )
  }

  return <>{children}</>
}
