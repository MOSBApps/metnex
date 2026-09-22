import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { validateTenantHeader } from '../../settings/settings-input.domain'

/**
 * Format-only check of the X-Tenant-Id header, placed after JwtAuthGuard and before the guards that
 * query the database with it. It grants nothing: the header stays an untrusted hint that the
 * existing TenantMembershipGuard / PermissionGuard still authorise. Static messages, no I/O.
 */
@Injectable()
export class TenantHeaderFormatGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, unknown> }>()
    const validation = validateTenantHeader(request.headers?.['x-tenant-id'])
    if (!validation.valid) throw new BadRequestException(validation.errors[0])
    return true
  }
}
