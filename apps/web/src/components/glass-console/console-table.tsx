'use client'

import type { ReactNode } from 'react'
import { GlassPanel } from './primitives'

export interface ConsoleTableColumn<T> {
  key: string
  header: string
  kind?: 'default' | 'metric' | 'metadata'
  render: (row: T) => ReactNode
}

export function ConsoleTable<T extends { id: string }>({
  columns,
  rows,
  loading = false,
  skeletonRows = 4,
  emptyState,
  onRowClick,
}: {
  columns: ConsoleTableColumn<T>[]
  rows: T[]
  loading?: boolean
  skeletonRows?: number
  emptyState: ReactNode
  onRowClick?: (row: T) => void
}) {
  return (
    <GlassPanel surface="elevated" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-glass-subtle">
              {columns.map(column => (
                <th
                  key={column.key}
                  className={`px-2.5 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.13em] text-glass-text-muted ${column.kind === 'metadata' ? 'text-right' : 'text-left'}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: skeletonRows }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className="border-t border-glass-border-subtle">
                    {columns.map(column => (
                      <td key={column.key} className="px-2.5 py-1.5">
                        <div className="h-3.5 w-24 animate-pulse rounded bg-glass-subtle" aria-hidden="true" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map(row => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`border-t border-glass-border-subtle transition-colors duration-150 ease-in-out hover:bg-glass-accent-primary/10 ${onRowClick ? 'cursor-pointer' : ''}`}
                  >
                    {columns.map(column => (
                      <td
                        key={column.key}
                        className={`px-2.5 py-1.5 align-middle text-glass-text-primary ${column.kind === 'metric' ? 'font-mono tabular-nums' : ''} ${column.kind === 'metadata' ? 'text-right text-glass-text-secondary' : ''}`}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 ? <div className="px-4 py-6 text-center text-[12.5px] text-glass-text-muted">{emptyState}</div> : null}
    </GlassPanel>
  )
}
