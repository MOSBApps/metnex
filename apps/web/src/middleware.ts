import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE = 'metnex_refresh_token'
const TENANT_COOKIE = 'metnex_tenant_id'
const TENANT_TYPE_COOKIE = 'metnex_tenant_type'
const IMPERSONATION_COOKIE = 'metnex_is_impersonating'
const IS_CUSTOMER_ADMIN_COOKIE = 'metnex_is_customer_admin'
const IS_SYSTEM_ADMIN_COOKIE = 'metnex_is_system_admin'
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function checkBootstrapped(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/platform/bootstrap/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return true
    const data = (await res.json()) as { bootstrapped: boolean }
    return data.bootstrapped
  } catch {
    return true
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value
  const tenantId = request.cookies.get(TENANT_COOKIE)?.value
  const tenantType = request.cookies.get(TENANT_TYPE_COOKIE)?.value
  const isImpersonating = !!request.cookies.get(IMPERSONATION_COOKIE)?.value
  const isCustomerAdmin = !!request.cookies.get(IS_CUSTOMER_ADMIN_COOKIE)?.value
  const isSystemAdmin = !!request.cookies.get(IS_SYSTEM_ADMIN_COOKIE)?.value

  if (pathname.startsWith('/setup')) {
    if (hasSession) return NextResponse.redirect(new URL('/', request.url))
    return NextResponse.next()
  }

  if (!hasSession) {
    const bootstrapped = await checkBootstrapped()
    if (!bootstrapped) return NextResponse.redirect(new URL('/setup', request.url))
    if (pathname === '/') return NextResponse.redirect(new URL('/login', request.url))
    if (pathname.startsWith('/login')) return NextResponse.next()
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL(tenantId ? '/app' : '/tenant-select', request.url))
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL(tenantId ? '/app' : '/tenant-select', request.url))
  }

  // PLATFORM surface is strictly forbidden for impersonated sessions
  if (pathname.startsWith('/system')) {
    if (isImpersonating) return NextResponse.redirect(new URL('/app', request.url))
    if (!tenantId) return NextResponse.redirect(new URL('/tenant-select', request.url))
    if (tenantType !== 'PLATFORM_ROOT') return NextResponse.redirect(new URL('/app', request.url))
    if ((pathname.startsWith('/system/audit') || pathname.startsWith('/system/performance')) && !isSystemAdmin) {
      return NextResponse.redirect(new URL('/system', request.url))
    }
    return NextResponse.next()
  }

  // CUSTOMER-ADMIN surface gating
  if (pathname.startsWith('/app/admin')) {
    if (!tenantId) return NextResponse.redirect(new URL('/tenant-select', request.url))
    
    // Server-side gate: check if the user has been flagged as customer admin for this tree
    // AND suppress for PLATFORM_ROOT as per AI1 decision
    if (!isCustomerAdmin || tenantType === 'PLATFORM_ROOT') {
      return NextResponse.redirect(new URL('/app', request.url))
    }
    
    return NextResponse.next()
  }

  if (pathname.startsWith('/app')) {
    if (!tenantId) return NextResponse.redirect(new URL('/tenant-select', request.url))
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/setup/:path*', '/login/:path*', '/app/:path*', '/tenant-select/:path*', '/system/:path*'],
}
