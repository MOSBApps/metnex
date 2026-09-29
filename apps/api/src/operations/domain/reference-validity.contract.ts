/**
 * TASK-029.01 — a bounded, half-open [effectiveFrom, effectiveTo) validity window. Every external
 * reference and ownership/operator record in this domain carries one, so that ownership/operator
 * change over time (BRIF2 §3.1, DEC-0017) is representable WITHOUT overwriting the previous record.
 */
export interface ReferenceValidityPeriod {
  /** ISO instant; inclusive. */
  effectiveFrom: string
  /** ISO instant; exclusive. `null` = still open (no known end). */
  effectiveTo: string | null
}

const isIsoInstant = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !Number.isNaN(Date.parse(v))

/** Structurally sound AND effectiveFrom < effectiveTo when both are present — never a zero/negative window. */
export function isValidityPeriodWellFormed(period: ReferenceValidityPeriod): boolean {
  if (!isIsoInstant(period.effectiveFrom)) return false
  if (period.effectiveTo === null) return true
  if (!isIsoInstant(period.effectiveTo)) return false
  return Date.parse(period.effectiveFrom) < Date.parse(period.effectiveTo)
}

/** `at` (ISO instant) falls inside [effectiveFrom, effectiveTo) — false for a malformed period or a malformed instant. */
export function isInstantWithinValidity(period: ReferenceValidityPeriod, at: string): boolean {
  if (!isValidityPeriodWellFormed(period) || !isIsoInstant(at)) return false
  const atMs = Date.parse(at)
  if (atMs < Date.parse(period.effectiveFrom)) return false
  if (period.effectiveTo !== null && atMs >= Date.parse(period.effectiveTo)) return false
  return true
}

/**
 * Picks the ONE record (of possibly several, non-overlapping-by-construction) whose validity period
 * contains `at`. A malformed period never wins; an expired or not-yet-effective one is REJECTED, not
 * silently treated as still active (BRIF2 "referans değişikliğinde ölçüm anındaki değerlendirme korunur").
 */
export function selectEffectiveAt<T extends { validity: ReferenceValidityPeriod }>(
  records: readonly T[],
  at: string,
): T | null {
  return records.find(r => isInstantWithinValidity(r.validity, at)) ?? null
}
