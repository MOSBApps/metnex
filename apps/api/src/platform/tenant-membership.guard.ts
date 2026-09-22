import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { and, eq } from 'drizzle-orm'
import { DB, type Db } from '../db/db.module'
import { tenantMemberships } from '../db/schema'

export const TENANT_ID_SOURCE_KEY = 'tenantIdSource'
export type TenantIdSource = 'query' | 'body' | 'param' | 'header' | 'header-optional'

export const TenantIdFrom = (source: TenantIdSource) =>
  SetMetadata(TENANT_ID_SOURCE_KEY, source)

@Injectable()
export class TenantMembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Db,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const source = this.reflector.getAllAndOverride<TenantIdSource>(
      TENANT_ID_SOURCE_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? 'header'

    const request = context.switchToHttp().getRequest<{
      user?: { id: string; isSystemAdmin: boolean }
      headers: Record<string, unknown>
      query: Record<string, unknown>
      body: Record<string, unknown>
      params: Record<string, unknown>
    }>()

    const user = request.user
    if (!user) return false
    if (user.isSystemAdmin) return true

    let tenantId: string | undefined
    if (source === 'body') tenantId = request.body['tenantId'] as string | undefined
    else if (source === 'param') tenantId = request.params['tenantId'] as string | undefined
    else if (source === 'query') tenantId = request.query['tenantId'] as string | undefined
    else tenantId = request.headers['x-tenant-id'] as string | undefined

    if (!tenantId) {
      if (source === 'header-optional') return true
      throw new BadRequestException('X-Tenant-Id header zorunludur')
    }

    const [membership] = await this.db
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.userId, user.id), eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.isActive, true)))
      .limit(1)
    if (!membership) {
      throw new ForbiddenException('Bu kiracıya erişim yetkiniz yok')
    }

    return true
  }
}
