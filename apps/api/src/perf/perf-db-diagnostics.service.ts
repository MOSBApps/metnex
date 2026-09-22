import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, desc, eq, gte, ilike, isNotNull, lte, sql } from 'drizzle-orm'
import { DB, type Db } from '../db/db.module'
import { performanceRequestLogs, performanceRequestQueryLogs, platformPerformanceSettings, tenants, users } from '../db/schema'

function roundMb(bytes: string | number | null | undefined) {
  if (bytes === null || bytes === undefined) return null
  const numeric = typeof bytes === 'string' ? Number(bytes) : bytes
  return Number((numeric / (1024 * 1024)).toFixed(2))
}

function formatMb(value: number | null) {
  if (value === null) return '—'
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} MB`
}

@Injectable()
export class PerfDbDiagnosticsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async overview() {
    const [databaseSizeResult, topTablesResult, topRoutes, tableStats, settingsRows, slowRequestCount24hRows, slowQueryCount24hRows] =
      await Promise.all([
        this.db.execute<{ databaseSizeBytes: string }>(sql`SELECT pg_database_size(current_database()) AS "databaseSizeBytes"`),
        this.db.execute<{ tableName: string; totalSizeBytes: string }>(sql`
          SELECT schemaname || '.' || relname AS "tableName", pg_total_relation_size(relid) AS "totalSizeBytes"
          FROM pg_catalog.pg_statio_user_tables
          ORDER BY pg_total_relation_size(relid) DESC
          LIMIT 5
        `),
        this.db
          .select({
            route: performanceRequestLogs.route,
            count: sql<number>`count(*)::int`,
            avgDurationMs: sql<number>`avg(${performanceRequestLogs.durationMs})::float`,
            maxDurationMs: sql<number>`max(${performanceRequestLogs.durationMs})::int`,
          })
          .from(performanceRequestLogs)
          .groupBy(performanceRequestLogs.route)
          .orderBy(sql`max(${performanceRequestLogs.durationMs}) desc`)
          .limit(5),
        this.tableStats(),
        this.db.select().from(platformPerformanceSettings).where(eq(platformPerformanceSettings.singletonKey, 1)).limit(1),
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(performanceRequestLogs)
          .where(gte(performanceRequestLogs.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))),
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(performanceRequestQueryLogs)
          .where(gte(performanceRequestQueryLogs.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))),
      ])

    const databaseSizeMb = roundMb(databaseSizeResult.rows[0]?.databaseSizeBytes ?? null)
    const suspectedIssues = tableStats.rows
      .filter(row => row.seqScanCount > row.indexScanCount * 3 && row.estimatedRows > 5000)
      .slice(0, 3)
      .map(row => `${row.tableName} tablosunda sıra taraması baskın görünüyor`)

    return {
      databaseSizeMb,
      databaseSizeLabel: formatMb(databaseSizeMb),
      slowRequestCount24h: slowRequestCount24hRows[0]?.count ?? 0,
      slowQueryCount24h: slowQueryCount24hRows[0]?.count ?? 0,
      settings: settingsRows[0] ?? {
        slowRequestThresholdMs: Number(process.env['PERF_SLOW_REQUEST_MS'] ?? 1000),
        dbTraceEnabled: process.env['PERF_DB_TRACE_ENABLED'] === 'true',
      },
      topTablesBySize: topTablesResult.rows.map(row => {
        const totalSizeMb = roundMb(row.totalSizeBytes)
        return { tableName: row.tableName, totalSizeMb, totalSizeLabel: formatMb(totalSizeMb) }
      }),
      topRoutes: topRoutes.map(row => ({
        route: row.route,
        count: row.count,
        avgDurationMs: Math.round(row.avgDurationMs ?? 0),
        maxDurationMs: row.maxDurationMs ?? 0,
      })),
      suspectedIssues,
    }
  }

  async tableStats() {
    const result = await this.db.execute<{
      schema: string
      tableName: string
      estimatedRows: string
      tableSizeBytes: string
      indexSizeBytes: string
      totalSizeBytes: string
      seqScanCount: string
      indexScanCount: string
      deadTuples: string
      lastVacuum: Date | null
      lastAutovacuum: Date | null
      lastAnalyze: Date | null
      lastAutoanalyze: Date | null
    }>(sql`
      SELECT
        schemaname AS "schema",
        relname AS "tableName",
        n_live_tup AS "estimatedRows",
        pg_relation_size(relid) AS "tableSizeBytes",
        pg_indexes_size(relid) AS "indexSizeBytes",
        pg_total_relation_size(relid) AS "totalSizeBytes",
        seq_scan AS "seqScanCount",
        idx_scan AS "indexScanCount",
        n_dead_tup AS "deadTuples",
        last_vacuum AS "lastVacuum",
        last_autovacuum AS "lastAutovacuum",
        last_analyze AS "lastAnalyze",
        last_autoanalyze AS "lastAutoanalyze"
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 50
    `)

    return {
      rows: result.rows.map(row => ({
        schema: row.schema,
        tableName: row.tableName,
        estimatedRows: Number(row.estimatedRows),
        tableSizeMb: roundMb(row.tableSizeBytes),
        indexSizeMb: roundMb(row.indexSizeBytes),
        totalSizeMb: roundMb(row.totalSizeBytes),
        seqScanCount: Number(row.seqScanCount),
        indexScanCount: Number(row.indexScanCount),
        deadTuples: Number(row.deadTuples),
        lastVacuum: row.lastVacuum ? new Date(row.lastVacuum).toISOString() : null,
        lastAutovacuum: row.lastAutovacuum ? new Date(row.lastAutovacuum).toISOString() : null,
        lastAnalyze: row.lastAnalyze ? new Date(row.lastAnalyze).toISOString() : null,
        lastAutoanalyze: row.lastAutoanalyze ? new Date(row.lastAutoanalyze).toISOString() : null,
      })),
    }
  }

  async indexStats() {
    const result = await this.db.execute<{
      schema: string
      tableName: string
      indexName: string
      indexDef: string
      sizeBytes: string
      isUnique: boolean
      isPrimary: boolean
      scanCount: string | null
    }>(sql`
      SELECT
        sui.schemaname AS "schema",
        sui.relname AS "tableName",
        sui.indexrelname AS "indexName",
        pg_get_indexdef(sui.indexrelid) AS "indexDef",
        pg_relation_size(sui.indexrelid) AS "sizeBytes",
        idx.indisunique AS "isUnique",
        idx.indisprimary AS "isPrimary",
        sui.idx_scan AS "scanCount"
      FROM pg_stat_user_indexes sui
      JOIN pg_index idx ON idx.indexrelid = sui.indexrelid
      ORDER BY pg_relation_size(sui.indexrelid) DESC
      LIMIT 100
    `)

    return {
      rows: result.rows.map(row => ({
        schema: row.schema,
        tableName: row.tableName,
        indexName: row.indexName,
        indexDef: row.indexDef,
        sizeMb: roundMb(row.sizeBytes),
        isUnique: row.isUnique,
        isPrimary: row.isPrimary,
        scanCount: Number(row.scanCount ?? 0),
        unusedIndex: !row.isPrimary && Number(row.scanCount ?? 0) === 0,
      })),
    }
  }

  async slowRequests(
    limit: number,
    offset: number,
    filters: { tenantId?: string; route?: string; statusCode?: number; from?: Date; to?: Date },
  ) {
    const conditions = []
    if (filters.tenantId) conditions.push(eq(performanceRequestLogs.tenantId, filters.tenantId))
    if (filters.route?.trim()) conditions.push(ilike(performanceRequestLogs.route, `%${filters.route.trim()}%`))
    if (filters.statusCode) conditions.push(eq(performanceRequestLogs.statusCode, filters.statusCode))
    if (filters.from) conditions.push(gte(performanceRequestLogs.createdAt, filters.from))
    if (filters.to) conditions.push(lte(performanceRequestLogs.createdAt, filters.to))
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({ log: performanceRequestLogs, tenantName: tenants.name, userEmail: users.email, userDisplayName: users.displayName })
        .from(performanceRequestLogs)
        .leftJoin(tenants, eq(performanceRequestLogs.tenantId, tenants.id))
        .leftJoin(users, eq(performanceRequestLogs.userId, users.id))
        .where(where)
        .orderBy(desc(performanceRequestLogs.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(performanceRequestLogs).where(where),
    ])
    const total = totalRows[0]?.count ?? 0

    return {
      rows: rows.map(row => ({
        id: row.log.id,
        createdAt: row.log.createdAt,
        method: row.log.method,
        route: row.log.route,
        statusCode: row.log.statusCode,
        durationMs: row.log.durationMs,
        dbTotalMs: row.log.dbTotalMs,
        queryCount: row.log.queryCount,
        tenantId: row.log.tenantId,
        tenantName: row.tenantName ?? null,
        userId: row.log.userId,
        userLabel: row.userEmail ? `${row.userDisplayName} <${row.userEmail}>` : null,
      })),
      total,
    }
  }

  async slowRequestDetail(id: string) {
    const [row] = await this.db
      .select({ log: performanceRequestLogs, tenantName: tenants.name, userEmail: users.email, userDisplayName: users.displayName })
      .from(performanceRequestLogs)
      .leftJoin(tenants, eq(performanceRequestLogs.tenantId, tenants.id))
      .leftJoin(users, eq(performanceRequestLogs.userId, users.id))
      .where(eq(performanceRequestLogs.id, id))
      .limit(1)

    if (!row) return null

    const queryLogRows = await this.db
      .select()
      .from(performanceRequestQueryLogs)
      .where(eq(performanceRequestQueryLogs.requestLogId, id))
      .orderBy(desc(performanceRequestQueryLogs.durationMs))
      .limit(50)

    return {
      id: row.log.id,
      method: row.log.method,
      route: row.log.route,
      statusCode: row.log.statusCode,
      durationMs: row.log.durationMs,
      dbTotalMs: row.log.dbTotalMs,
      queryCount: row.log.queryCount,
      tenantId: row.log.tenantId,
      tenantName: row.tenantName ?? null,
      userId: row.log.userId,
      userLabel: row.userEmail ? `${row.userDisplayName} <${row.userEmail}>` : null,
      traceWasActive: row.log.queryCount !== null,
      createdAt: row.log.createdAt,
      queryLogs: queryLogRows.map(query => ({
        id: query.id,
        durationMs: query.durationMs,
        model: query.model,
        operation: query.operation,
        queryHash: query.queryHash,
        queryText: query.queryText,
        createdAt: query.createdAt,
      })),
    }
  }

  async slowQuerySummary(limit: number, offset: number, tenantId?: string) {
    const tenantFilter = tenantId ? sql`WHERE r."tenantId" = ${tenantId}` : sql``
    const result = await this.db.execute<{
      queryHash: string | null
      queryText: string | null
      model: string | null
      operation: string | null
      count: string
      avgMs: number | null
      maxMs: number | null
      requestCount: string
    }>(sql`
      SELECT
        q."queryHash",
        MIN(q."queryText") AS "queryText",
        q."model",
        q."operation",
        COUNT(*) AS "count",
        AVG(q."durationMs")::float AS "avgMs",
        MAX(q."durationMs")::float AS "maxMs",
        COUNT(DISTINCT q."requestLogId") AS "requestCount"
      FROM "performance_request_query_logs" q
      JOIN "performance_request_logs" r ON r."id" = q."requestLogId"
      ${tenantFilter}
      GROUP BY q."queryHash", q."model", q."operation"
      ORDER BY MAX(q."durationMs") DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `)

    return {
      rows: result.rows.map(row => ({
        queryHash: row.queryHash,
        queryText: row.queryText,
        model: row.model,
        operation: row.operation,
        count: Number(row.count),
        avgMs: Math.round(row.avgMs ?? 0),
        maxMs: Math.round(row.maxMs ?? 0),
        requestCount: Number(row.requestCount),
      })),
    }
  }

  async recommendations() {
    const [tableStats, indexStats] = await Promise.all([this.tableStats(), this.indexStats()])
    const rows: Array<{
      kind: string
      target: string
      reason: string
      confidence: 'low' | 'medium' | 'high'
    }> = []

    for (const table of tableStats.rows) {
      if (table.seqScanCount > table.indexScanCount * 3 && table.estimatedRows > 5000) {
        rows.push({
          kind: 'HIGH_SEQ_SCAN',
          target: `${table.schema}.${table.tableName}`,
          reason: `Seq scan (${table.seqScanCount}) index scan (${table.indexScanCount}) oranını belirgin aşıyor.`,
          confidence: 'medium',
        })
      }
      if (!table.lastAnalyze && table.estimatedRows > 1000) {
        rows.push({
          kind: 'STALE_ANALYZE',
          target: `${table.schema}.${table.tableName}`,
          reason: 'Analyze zamanı görünmüyor; planner istatistikleri eski olabilir.',
          confidence: 'medium',
        })
      }
    }

    for (const index of indexStats.rows) {
      if (index.unusedIndex) {
        rows.push({
          kind: 'UNUSED_INDEX',
          target: `${index.schema}.${index.indexName}`,
          reason: 'Index scan sayısı 0. Gereksiz bakım maliyeti oluşturabilir.',
          confidence: 'low',
        })
      }
    }

    return { rows: rows.slice(0, 20) }
  }

  async explainQuery(queryHash?: string) {
    if (!queryHash) throw new BadRequestException('queryHash zorunludur')

    const [sample] = await this.db
      .select({ queryText: performanceRequestQueryLogs.queryText })
      .from(performanceRequestQueryLogs)
      .where(and(eq(performanceRequestQueryLogs.queryHash, queryHash), isNotNull(performanceRequestQueryLogs.queryText)))
      .orderBy(desc(performanceRequestQueryLogs.createdAt))
      .limit(1)

    if (!sample?.queryText) throw new NotFoundException('Sorgu izi bulunamadı')

    try {
      const plan = await this.db.execute(sql.raw(`EXPLAIN ${sample.queryText}`))
      return { queryHash, plan: plan.rows }
    } catch {
      throw new BadRequestException('Saklanan scrubbed sorgu EXPLAIN için uygun değil')
    }
  }
}
