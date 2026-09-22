import { Inject, Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { eq, sql, SQL } from 'drizzle-orm'
import { DB, type Db } from '../db/db.module'
import { users } from '../db/schema'

export interface PlatformAuditLogInput {
  actorId?: string | null
  actionCode: string
  entityType: string
  entityId: string
  summary: string
  metadata?: Record<string, unknown> | null
}

export interface PlatformAuditListQuery {
  actorId?: string
  actionCode?: string
  entityType?: string
  from?: Date
  to?: Date
  q?: string
  limit: number
  offset: number
}

function scrubSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubSecrets)
  if (!value || typeof value !== 'object') return value

  const secretKeys = ['password', 'passwordHash', 'refreshToken', 'refreshTokenHash', 'token', 'apiKey', 'apiKeyCiphertext']
  const result: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    result[key] = secretKeys.some(secretKey => key.toLowerCase().includes(secretKey.toLowerCase()))
      ? '[REDACTED]'
      : scrubSecrets(nested)
  }
  return result
}

export interface PlatformAuditListRow {
  id: string
  actorId: string | null
  actorSnapshot: Record<string, unknown> | null
  actionCode: string
  entityType: string
  entityId: string
  summary: string
  metadata: Record<string, unknown> | null
  createdAt: Date
}

@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name)

  constructor(@Inject(DB) private readonly db: Db) {}

  private isMissingAuditTable(error: unknown) {
    if (!error || typeof error !== 'object') return false
    return (error as { code?: string }).code === '42P01'
  }

  private buildConditions(query: PlatformAuditListQuery): SQL[] {
    const conditions: SQL[] = []

    if (query.actorId) conditions.push(sql`"actorId" = ${query.actorId}`)
    if (query.actionCode) conditions.push(sql`"actionCode" = ${query.actionCode}`)
    if (query.entityType) conditions.push(sql`"entityType" = ${query.entityType}`)
    if (query.from) conditions.push(sql`"createdAt" >= ${query.from}`)
    if (query.to) conditions.push(sql`"createdAt" <= ${query.to}`)
    if (query.q?.trim()) {
      const search = `%${query.q.trim()}%`
      conditions.push(
        sql`("summary" ILIKE ${search} OR "entityId" ILIKE ${search} OR "actionCode" ILIKE ${search} OR "entityType" ILIKE ${search})`,
      )
    }

    return conditions
  }

  private buildWhereSql(conditions: SQL[]): SQL {
    if (conditions.length === 0) return sql``
    return sql`WHERE ${sql.join(conditions, sql` AND `)}`
  }

  async log(params: PlatformAuditLogInput): Promise<void> {
    const actorId = params.actorId ?? null
    const [actor] = actorId
      ? await this.db.select({ id: users.id, email: users.email, displayName: users.displayName }).from(users).where(eq(users.id, actorId)).limit(1)
      : []

    const metadata = params.metadata ? scrubSecrets(params.metadata) : null
    const actorSnapshot = actor ? { id: actor.id, email: actor.email, displayName: actor.displayName } : null

    try {
      await this.db.execute(sql`
        INSERT INTO "platform_audit_logs" (
          "id", "actorId", "actorSnapshot", "actionCode", "entityType", "entityId", "summary", "metadata"
        )
        VALUES (
          ${randomUUID()},
          ${actorId},
          ${actorSnapshot ? JSON.stringify(actorSnapshot) : null}::jsonb,
          ${params.actionCode},
          ${params.entityType},
          ${params.entityId},
          ${params.summary},
          ${metadata ? JSON.stringify(metadata) : null}::jsonb
        )
      `)
    } catch (error) {
      if (this.isMissingAuditTable(error)) {
        this.logger.warn('platform_audit_logs table missing; audit write skipped')
        return
      }
      throw error
    }
  }

  async list(query: PlatformAuditListQuery) {
    const whereSql = this.buildWhereSql(this.buildConditions(query))

    let rows: PlatformAuditListRow[]
    let total: number
    try {
      const [rowsResult, totalResult] = await this.db.transaction(async tx => {
        const rowsResult = await tx.execute<PlatformAuditListRow & Record<string, unknown>>(sql`
          SELECT "id", "actorId", "actorSnapshot", "actionCode", "entityType", "entityId", "summary", "metadata", "createdAt"
          FROM "platform_audit_logs"
          ${whereSql}
          ORDER BY "createdAt" DESC
          LIMIT ${query.limit}
          OFFSET ${query.offset}
        `)
        const totalResult = await tx.execute<{ total: string }>(sql`
          SELECT COUNT(*) AS total FROM "platform_audit_logs" ${whereSql}
        `)
        return [rowsResult, totalResult]
      })
      rows = rowsResult.rows
      total = Number(totalResult.rows[0]?.total ?? 0)
    } catch (error) {
      if (this.isMissingAuditTable(error)) {
        this.logger.warn('platform_audit_logs table missing; audit read returned empty state')
        return {
          rows: [],
          total: 0,
          status: 'UNAVAILABLE' as const,
          message: 'Platform audit tablosu henüz migrate edilmemiş.',
        }
      }
      throw error
    }

    return {
      rows,
      total,
      status: 'READY' as const,
    }
  }
}
