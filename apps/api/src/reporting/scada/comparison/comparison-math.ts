/** The ONE rounding point: half away from zero at `decimals` places; null/undefined = no rounding. Same for every series/source. */
export function roundTo(value: number, decimals: number | null | undefined): number {
  if (decimals === null || decimals === undefined) return value
  const f = 10 ** decimals
  const r = Math.round(Math.abs(value) * f) / f
  return value < 0 ? -r : r
}

export function decimalsValid(d: unknown): d is number | null | undefined {
  return d === undefined || d === null || (typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 12)
}

export type DeltaResult = { ok: true; absoluteDelta: number; percentageDelta: number | null } | { ok: false }

/**
 * absoluteDelta = comparison − baseline; percentageDelta = (comparison − baseline) / |baseline| × 100, null when the
 * baseline is 0 (a real 0 is a valid value — only the percentage is undefined). No snapping of near-equal values to 0. A
 * non-finite intermediate or result (overflow / NaN) is FAIL-CLOSED: `ok: false`, never a wrong number.
 */
export function computeDelta(baseline: number, comparison: number, decimals: number | null | undefined): DeltaResult {
  if (!Number.isFinite(baseline) || !Number.isFinite(comparison)) return { ok: false }
  const delta = comparison - baseline
  if (!Number.isFinite(delta)) return { ok: false }
  let pct: number | null = null
  if (baseline !== 0) {
    pct = (delta / Math.abs(baseline)) * 100
    if (!Number.isFinite(pct)) return { ok: false }
  }
  return { ok: true, absoluteDelta: roundTo(delta, decimals), percentageDelta: pct === null ? null : roundTo(pct, decimals) }
}
