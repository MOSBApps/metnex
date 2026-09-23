export interface AnalysisRow {
  no: string
  label: string
  occurredAt: string
  status: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface DailyTotal {
  date: string
  amount: number
}

export interface StatusCount {
  status: string
  count: number
}

/** Groups rows by calendar day (UTC) and sums `amount`, sorted oldest → newest for the line chart. */
export function buildDailyTotals(rows: AnalysisRow[]): DailyTotal[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const date = row.occurredAt.slice(0, 10)
    totals.set(date, Math.round(((totals.get(date) ?? 0) + row.amount) * 100) / 100)
  }
  return Array.from(totals.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** Counts rows per status, in a fixed display order (never data-dependent ordering). */
export function buildStatusBreakdown(rows: AnalysisRow[]): StatusCount[] {
  const order = ['COMPLETED', 'PENDING', 'FAILED']
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1)
  const known = order.filter(status => counts.has(status)).map(status => ({ status, count: counts.get(status)! }))
  const rest = Array.from(counts.entries())
    .filter(([status]) => !order.includes(status))
    .map(([status, count]) => ({ status, count }))
  return [...known, ...rest]
}
