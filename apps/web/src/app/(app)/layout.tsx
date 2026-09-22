import { cookies } from 'next/headers'
import { ConsoleShell } from '../../components/console-shell'
import { SessionGuard } from '../../components/session-guard'
import { TenantPermissionProvider } from '../../contexts/tenant-permission-context'

const tenantCookie = 'metnex_tenant_name'
const tenantTypeCookie = 'metnex_tenant_type'
const isSystemAdminCookie = 'metnex_is_system_admin'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const tenantName = cookieStore.get(tenantCookie)?.value ?? 'Tenant'
  const tenantType = cookieStore.get(tenantTypeCookie)?.value ?? 'STANDARD'
  const isSystemAdmin = !!cookieStore.get(isSystemAdminCookie)?.value

  return (
    <TenantPermissionProvider>
      <SessionGuard />
      <ConsoleShell tenantName={decodeURIComponent(tenantName)} tenantType={tenantType} isSystemAdmin={isSystemAdmin}>
        {children}
      </ConsoleShell>
    </TenantPermissionProvider>
  )
}
