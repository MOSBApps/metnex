import { cookies } from 'next/headers'
import { ConsoleShell } from '../../components/console-shell'
import { SessionGuard } from '../../components/session-guard'
import { TenantPermissionProvider } from '../../contexts/tenant-permission-context'

const IS_SYSTEM_ADMIN_COOKIE = 'metnex_is_system_admin'
const TENANT_NAME_COOKIE = 'metnex_tenant_name'
const TENANT_TYPE_COOKIE = 'metnex_tenant_type'

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const isSystemAdmin = !!cookieStore.get(IS_SYSTEM_ADMIN_COOKIE)?.value
  const tenantName = cookieStore.get(TENANT_NAME_COOKIE)?.value ?? 'Tenant'
  const tenantType = cookieStore.get(TENANT_TYPE_COOKIE)?.value ?? 'PLATFORM_ROOT'

  return (
    <TenantPermissionProvider>
      <SessionGuard />
      <ConsoleShell
        tenantName={decodeURIComponent(tenantName)}
        tenantType={tenantType}
        isSystemAdmin={isSystemAdmin}
      >
        {children}
      </ConsoleShell>
    </TenantPermissionProvider>
  )
}
