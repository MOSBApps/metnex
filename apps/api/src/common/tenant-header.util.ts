import { BadRequestException } from '@nestjs/common'

/**
 * Fails fast on a missing X-Tenant-Id header instead of letting `?? ''` silently reach a
 * tenant-scoped service — an empty tenantId must never be a valid query/mutation scope.
 */
export function requireTenantId(tenantId: string | undefined): string {
  if (!tenantId) throw new BadRequestException('X-Tenant-Id header zorunludur')
  return tenantId
}
