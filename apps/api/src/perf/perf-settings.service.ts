import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { assertRow } from '../db/assert-row'
import { DB, type Db } from '../db/db.module'
import { platformPerformanceSettings } from '../db/schema'

export interface PerfSettingsSnapshot {
  id: string
  singletonKey: number
  slowRequestThresholdMs: number
  dbTraceEnabled: boolean
  updatedByUserId: string | null
  updatedAt: Date
  createdAt: Date
}

const PERF_SETTINGS_TTL_MS = 15_000

@Injectable()
export class PerfSettingsService {
  private cache: { value: PerfSettingsSnapshot; expiresAt: number } | null = null

  constructor(@Inject(DB) private readonly db: Db) {}

  private async loadFromDb(): Promise<PerfSettingsSnapshot> {
    await this.db
      .insert(platformPerformanceSettings)
      .values({
        singletonKey: 1,
        slowRequestThresholdMs: Number(process.env['PERF_SLOW_REQUEST_MS'] ?? 1000),
        dbTraceEnabled: process.env['PERF_DB_TRACE_ENABLED'] === 'true',
      })
      .onConflictDoNothing({ target: platformPerformanceSettings.singletonKey })

    return assertRow(
      await this.db.select().from(platformPerformanceSettings).where(eq(platformPerformanceSettings.singletonKey, 1)).limit(1),
    )
  }

  invalidateCache() {
    this.cache = null
  }

  async getSettings(forceRefresh = false) {
    if (!forceRefresh && this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.value
    }

    const value = await this.loadFromDb()
    this.cache = {
      value,
      expiresAt: Date.now() + PERF_SETTINGS_TTL_MS,
    }
    return value
  }

  async updateSettings(
    input: { slowRequestThresholdMs?: number; dbTraceEnabled?: boolean },
    updatedByUserId: string,
  ) {
    const current = await this.getSettings(true)
    const updated = assertRow(
      await this.db
        .update(platformPerformanceSettings)
        .set({
          slowRequestThresholdMs: input.slowRequestThresholdMs ?? current.slowRequestThresholdMs,
          dbTraceEnabled: input.dbTraceEnabled ?? current.dbTraceEnabled,
          updatedByUserId,
        })
        .where(eq(platformPerformanceSettings.id, current.id))
        .returning(),
    )

    this.cache = {
      value: updated,
      expiresAt: Date.now() + PERF_SETTINGS_TTL_MS,
    }
    return updated
  }
}
