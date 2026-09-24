import type { DataQualityCode } from './scada-aggregation.contract'

export interface RolloverEvaluationParams {
  seriesKey: string
  currentValue: number
  nextValue: number
  catalogId: string
}

export interface RolloverEvaluationResult {
  resolved: boolean
  correctedDelta: number | null
  policyId?: string
  qualityCode?: DataQualityCode
}

export interface RolloverPolicyPort {
  evaluateRollover(params: RolloverEvaluationParams): RolloverEvaluationResult
}

/**
 * Handles negative delta occurrences according to Q-W502 / Q-W522 binding decisions.
 * Never silently turns negative delta into 0.
 * Never guesses rollover by column name or applies hardcoded +100000.
 * If policyPort resolves rollover, uses correctedDelta.
 * Otherwise returns deltaValue: null with COUNTER_RESET_UNRESOLVED dataQuality.
 */
export function handleNegativeDelta(
  currentValue: number,
  nextValue: number,
  seriesKey: string,
  catalogId: string,
  policyPort?: RolloverPolicyPort
): { deltaValue: number | null; dataQuality: DataQualityCode; isComplete: boolean } {
  if (policyPort) {
    const result = policyPort.evaluateRollover({
      seriesKey,
      currentValue,
      nextValue,
      catalogId,
    })
    if (result.resolved && result.correctedDelta !== null) {
      return {
        deltaValue: result.correctedDelta,
        dataQuality: result.qualityCode || 'COUNTER_RESET_RESOLVED',
        isComplete: true,
      }
    }
  }

  return {
    deltaValue: null,
    dataQuality: 'COUNTER_RESET_UNRESOLVED',
    isComplete: false,
  }
}
