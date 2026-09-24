import type { ScadaApiLimits } from './scada-api.contract'
import { apiLimitsValid } from './scada-api.validator'

/**
 * TASK-027.72 — the limits of the SCADA API come from the ENVIRONMENT (or a source profile that fills the same variables).
 * There is no default: one missing / non-numeric / non-positive variable makes the whole profile invalid, and every endpoint
 * then answers SCADA_LIMITS_NOT_CONFIGURED (fail-closed). This file holds variable NAMES only, never a value.
 */
export const SCADA_API_LIMIT_ENV = {
  maxNameLength: 'SCADA_API_MAX_NAME_LENGTH',
  maxDescriptionLength: 'SCADA_API_MAX_DESCRIPTION_LENGTH',
  maxSourceCount: 'SCADA_API_MAX_SOURCES',
  maxSeriesCount: 'SCADA_API_MAX_SERIES',
  maxVirtualColumnCount: 'SCADA_API_MAX_VIRTUAL_COLUMNS',
  maxPageSize: 'SCADA_API_MAX_PAGE_SIZE',
  maxPeriodMs: 'SCADA_API_MAX_PERIOD_MS',
  maxSeriesMappings: 'SCADA_API_MAX_SERIES_MAPPINGS',
  maxExpressionLength: 'SCADA_API_VC_MAX_EXPRESSION_LENGTH',
  maxAstDepth: 'SCADA_API_VC_MAX_AST_DEPTH',
  maxOperatorCount: 'SCADA_API_VC_MAX_OPERATORS',
  maxRoundDecimals: 'SCADA_API_VC_MAX_ROUND_DECIMALS',
  maxAbsoluteResult: 'SCADA_API_VC_MAX_ABSOLUTE_RESULT',
} as const

export function loadScadaApiLimits(env: NodeJS.ProcessEnv): ScadaApiLimits | null {
  const num = (name: string): number | null => {
    const raw = env[name]
    if (typeof raw !== 'string' || !/^\d+(\.\d+)?([eE]\d+)?$/.test(raw.trim())) return null
    const n = Number(raw.trim())
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const e = SCADA_API_LIMIT_ENV
  const values = Object.fromEntries(Object.entries(e).map(([key, name]) => [key, num(name)]))
  if (Object.values(values).some(v => v === null)) return null
  const v = values as Record<keyof typeof SCADA_API_LIMIT_ENV, number>
  const limits: ScadaApiLimits = {
    preset: { maxNameLength: v.maxNameLength, maxDescriptionLength: v.maxDescriptionLength, maxSourceCount: v.maxSourceCount, maxSeriesCount: v.maxSeriesCount, maxVirtualColumnCount: v.maxVirtualColumnCount, maxPageSize: v.maxPageSize },
    virtualColumn: { maxExpressionLength: v.maxExpressionLength, maxAstDepth: v.maxAstDepth, maxOperatorCount: v.maxOperatorCount, maxRoundDecimals: v.maxRoundDecimals, maxAbsoluteResult: v.maxAbsoluteResult },
    maxPeriodMs: v.maxPeriodMs,
    maxSeriesMappings: v.maxSeriesMappings,
  }
  return apiLimitsValid(limits) ? limits : null
}
