import type { RolloverPolicyPort as AggregationRolloverPort } from '../aggregation/negative-delta.policy'
import type { RolloverPolicyProvider } from './rollover-policy.port'
import { ROLLOVER_MODES, type PolicyTrace, type RolloverPolicy } from './scada-data-quality.contract'

const round4 = (v: number) => Math.round(v * 10000) / 10000

const isFinitePositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
const isIso = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !Number.isNaN(Date.parse(v))

/** A policy is valid only if EVERY parameter its mode needs is explicit and sane. No defaults are ever filled in. */
export function isPolicyValid(policy: unknown): policy is RolloverPolicy {
  if (!policy || typeof policy !== 'object') return false
  const p = policy as Record<string, unknown>
  if (typeof p['catalogId'] !== 'string' || p['catalogId'] === '' || typeof p['seriesKey'] !== 'string' || p['seriesKey'] === '') return false
  if (p['valueType'] !== 'INDEX' && p['valueType'] !== 'REAL_VALUE') return false
  if (typeof p['enabled'] !== 'boolean') return false
  const version = p['version']
  if (!(typeof version === 'number' ? Number.isFinite(version) : typeof version === 'string' && version !== '')) return false
  if (!ROLLOVER_MODES.includes(p['rolloverMode'] as never)) return false
  if (p['rolloverMode'] !== 'NONE' && !isFinitePositive(p['rolloverValue'])) return false
  const max = p['maxExpectedDelta']
  if (max !== undefined && max !== null && !(typeof max === 'number' && Number.isFinite(max) && max >= 0)) return false
  for (const key of ['effectiveFrom', 'effectiveTo'] as const) if (p[key] !== undefined && p[key] !== null && !isIso(p[key])) return false
  if (p['effectiveFrom'] && p['effectiveTo'] && Date.parse(p['effectiveFrom'] as string) >= Date.parse(p['effectiveTo'] as string)) return false
  return true
}

const traceOf = (status: PolicyTrace['status'], policy?: RolloverPolicy): PolicyTrace => ({
  status,
  version: policy?.version ?? null,
  mode: policy?.rolloverMode ?? null,
  effectiveFrom: policy?.effectiveFrom ?? null,
  effectiveTo: policy?.effectiveTo ?? null,
})

export type PolicyResolution =
  | { kind: 'UNDEFINED'; trace: PolicyTrace }
  | { kind: 'INVALID'; trace: PolicyTrace }
  | { kind: 'NONE_MODE'; policy: RolloverPolicy; trace: PolicyTrace }
  | { kind: 'ACTIVE'; policy: RolloverPolicy; trace: PolicyTrace }

/**
 * Chooses the policy of ONE series at the instant `atUtcMs`. The choice uses only (catalogId, seriesKey, valueType) —
 * never a column name. Fail-closed: any malformed record for the series, or more than one effective record, makes the
 * whole series POLICY_INVALID; disabled / out-of-window records simply do not apply (UNDEFINED).
 */
export function resolvePolicy(records: readonly unknown[], atUtcMs: number): PolicyResolution {
  if (records.some(r => !isPolicyValid(r))) return { kind: 'INVALID', trace: traceOf('INVALID') }
  const valid = records as RolloverPolicy[]
  const effective = valid.filter(p => {
    if (!p.enabled) return false
    if (p.effectiveFrom && atUtcMs < Date.parse(p.effectiveFrom)) return false
    if (p.effectiveTo && atUtcMs >= Date.parse(p.effectiveTo)) return false
    return true
  })
  if (effective.length > 1) return { kind: 'INVALID', trace: traceOf('INVALID') } // overlapping versions: ambiguous
  if (effective.length === 0) return { kind: 'UNDEFINED', trace: traceOf(valid.some(p => p.enabled) ? 'NOT_EFFECTIVE' : 'UNDEFINED') }
  const policy = effective[0]!
  return policy.rolloverMode === 'NONE' ? { kind: 'NONE_MODE', policy, trace: traceOf('NONE_MODE', policy) } : { kind: 'ACTIVE', policy, trace: traceOf('APPLIED', policy) }
}

/** The corrected delta of an ACTIVE policy for a negative step, or null if the readings do not fit the policy. */
export function correctedDelta(policy: RolloverPolicy, current: number, next: number): number | null {
  const value = policy.rolloverValue as number
  let delta: number
  if (policy.rolloverMode === 'FIXED_MAXIMUM') {
    if (current > value || next > value || current < 0 || next < 0) return null // readings outside the declared counter maximum
    delta = next + (value - current)
  } else if (policy.rolloverMode === 'MODULO') {
    if (current < 0 || next < 0 || current >= value || next >= value) return null // readings outside [0, R)
    delta = next - current + value
  } else {
    return null
  }
  if (!Number.isFinite(delta) || delta < 0) return null
  if (policy.maxExpectedDelta !== undefined && policy.maxExpectedDelta !== null && delta > policy.maxExpectedDelta) return null
  return round4(delta)
}

/**
 * Adapter so the TASK-027.66 aggregation engine can take its roll-over decisions from explicit policies.
 * The engine's port carries no timestamp, so the policy is evaluated at the fixed `asOfUtc` instant given here
 * (e.g. the end of the analysed window). Series are matched exactly by (catalogId, seriesKey) as INDEX — no name rules.
 */
export function toAggregationRolloverPort(provider: RolloverPolicyProvider, asOfUtc: string): AggregationRolloverPort {
  const at = Date.parse(asOfUtc)
  return {
    evaluateRollover: ({ catalogId, seriesKey, currentValue, nextValue }) => {
      const resolution = resolvePolicy(provider.list(catalogId, seriesKey, 'INDEX'), at)
      if (resolution.kind !== 'ACTIVE') return { resolved: false, correctedDelta: null }
      const delta = correctedDelta(resolution.policy, currentValue, nextValue)
      return delta === null ? { resolved: false, correctedDelta: null } : { resolved: true, correctedDelta: delta, policyId: String(resolution.policy.version), qualityCode: 'COUNTER_RESET_RESOLVED' }
    },
  }
}
