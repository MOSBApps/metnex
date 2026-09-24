/** Neumaier-compensated sum: deterministic and accurate. */
export function compensatedSumOf(values: readonly number[]): number {
  let sum = 0
  let c = 0
  for (const v of values) {
    const t = sum + v
    c += Math.abs(sum) >= Math.abs(v) ? sum - t + v : v - t + sum
    sum = t
  }
  return sum + c
}
