import { mostCritical, sortFlags, type ScadaDataQualityState } from '../quality/scada-data-quality.contract'
import type { ScadaOutputBucket } from '../series/scada-series.contract'

export type BucketOutcome =
  | { kind: 'VALUE'; value: number }
  | { kind: 'UNRESOLVED' } // an input is missing / unresolved / blocked
  | { kind: 'DIVISION' }
  | { kind: 'NUMERIC' }

/**
 * Quality of ONE derived bucket. The flags of every referenced input bucket are PRESERVED (not "VALID" ones); the derived
 * state is added on top and the headline comes from the central 027.67 ordering. Nothing is ever turned into 0.
 */
export function derivedQuality(outcome: BucketOutcome, inputFlags: readonly ScadaDataQualityState[], inputMissing: boolean): { value: number | null; flags: ScadaDataQualityState[]; dataQuality: ScadaDataQualityState; isComplete: boolean; analysisAllowed: boolean } {
  const flags = new Set<ScadaDataQualityState>(inputFlags.filter(f => f !== 'VALID'))
  let value: number | null = null
  let isComplete = false
  let analysisAllowed = true
  if (outcome.kind === 'VALUE') {
    value = outcome.value
    isComplete = true
  } else if (outcome.kind === 'UNRESOLVED') {
    flags.add('VIRTUAL_COLUMN_INPUT_UNRESOLVED')
    if (inputMissing) flags.add('MISSING_VALUE')
    analysisAllowed = false
  } else if (outcome.kind === 'DIVISION') {
    flags.add('VIRTUAL_COLUMN_DIVISION_INVALID')
  } else {
    flags.add('INVALID_NUMERIC_VALUE')
  }
  const sorted = sortFlags(flags.size === 0 ? ['VALID'] : flags)
  return { value, flags: sorted, dataQuality: mostCritical(sorted), isComplete, analysisAllowed }
}

export type { ScadaOutputBucket }
