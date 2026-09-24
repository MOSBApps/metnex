import type {
  ScadaAggregationBucketResult,
  ScadaSeriesAggregationPolicy,
} from './scada-aggregation.contract'

/**
 * Converts a UTC ISO string into a local YYYY-MM-DD date key based on timezone string.
 */
export function getLocalDateKey(isoUtcStr: string, timezone = 'UTC'): string {
  const d = new Date(isoUtcStr)
  if (Number.isNaN(d.getTime())) {
    return 'INVALID_DATE'
  }

  // Use Intl.DateTimeFormat for robust timezone date extraction (e.g., tr-TR, UTC, Europe/Istanbul)
  try {
    const timeZoneStr = timezone === 'tr-TR' ? 'Europe/Istanbul' : timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZoneStr,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(d) // Returns YYYY-MM-DD in en-CA locale
  } catch {
    // Fallback to UTC date string
    return isoUtcStr.split('T')[0] || 'INVALID_DATE'
  }
}

/**
 * Aggregates hourly bucket results into daily bucket results according to catalog policy and timezone.
 * Pure function: zero I/O, zero random state, zero input mutation.
 */
export function aggregateDailySeries(
  hourlyResults: readonly ScadaAggregationBucketResult[],
  policy: ScadaSeriesAggregationPolicy,
  timezone = 'UTC'
): ScadaAggregationBucketResult[] {
  if (!hourlyResults || hourlyResults.length === 0) {
    return []
  }

  // Fail-closed: catalog policy must specify dailyOperation
  if (!policy || !policy.dailyOperation) {
    return []
  }

  const op = policy.dailyOperation
  const tz = policy.timezone || timezone

  // Group hourly results by local date key
  const dayGroups = new Map<string, ScadaAggregationBucketResult[]>()

  for (const item of hourlyResults) {
    const dayKey = getLocalDateKey(item.bucketStartUtc, tz)
    if (!dayGroups.has(dayKey)) {
      dayGroups.set(dayKey, [])
    }
    dayGroups.get(dayKey)!.push(item)
  }

  const dailyResults: ScadaAggregationBucketResult[] = []

  // Sort day keys chronologically
  const sortedDayKeys = Array.from(dayGroups.keys()).sort()

  for (const dayKey of sortedDayKeys) {
    const items = dayGroups.get(dayKey)!
    if (items.length === 0) continue

    const firstItem = items[0]!

    let hasIncomplete = false
    let hasNullDelta = false
    let sumDelta = 0
    let minDelta: number | null = null
    let maxDelta: number | null = null
    let validDeltaCount = 0
    let firstRawValue: number | null = null

    for (let i = 0; i < items.length; i += 1) {
      const it = items[i]!
      if (i === 0) firstRawValue = it.rawValue

      if (!it.isComplete) {
        hasIncomplete = true
      }

      if (it.deltaValue === null || it.deltaValue === undefined) {
        hasNullDelta = true
      } else {
        validDeltaCount += 1
        sumDelta += it.deltaValue
        if (minDelta === null || it.deltaValue < minDelta) minDelta = it.deltaValue
        if (maxDelta === null || it.deltaValue > maxDelta) maxDelta = it.deltaValue
      }
    }

    let dailyDelta: number | null = null
    let dataQuality = firstItem.dataQuality

    if (hasNullDelta || validDeltaCount === 0) {
      dailyDelta = null
      dataQuality = hasIncomplete ? 'INCOMPLETE_BUCKET' : 'MISSING_VALUE'
    } else {
      if (op === 'SUM') {
        dailyDelta = Math.round(sumDelta * 10000) / 10000
      } else if (op === 'AVERAGE') {
        dailyDelta = Math.round((sumDelta / validDeltaCount) * 10000) / 10000
      } else if (op === 'MIN') {
        dailyDelta = minDelta
      } else if (op === 'MAX') {
        dailyDelta = maxDelta
      }
      dataQuality = hasIncomplete ? 'INCOMPLETE_BUCKET' : 'OK'
    }

    dailyResults.push({
      bucketStartUtc: `${dayKey}T00:00:00.000Z`,
      bucketEndUtc: `${dayKey}T23:59:59.999Z`,
      seriesKey: firstItem.seriesKey,
      valueType: firstItem.valueType,
      rawValue: firstRawValue,
      deltaValue: dailyDelta,
      dataQuality,
      isComplete: !hasIncomplete && !hasNullDelta,
      sourceCatalogId: firstItem.sourceCatalogId,
    })
  }

  return dailyResults
}
