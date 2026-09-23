import { describe, expect, it } from 'vitest'
import { metadata } from './layout'

/**
 * TASK-027.61 — favicon/metadata contract. The actual favicon file (`app/icon.png`) is picked up
 * automatically by Next's file-convention scan at build time (verified separately via
 * `next build`, which lists it as a generated route) — this only asserts the explicit `metadata`
 * fields this task touched, since a build-time file convention isn't otherwise unit-testable.
 * Existing language (`lang="tr"`) and theme-bootstrap script are untouched — not re-tested here.
 */
describe('root layout metadata (TASK-027.61)', () => {
  it('keeps the Metnex title unchanged', () => {
    expect(metadata.title).toBe('Metnex')
  })

  it('declares /icon.png as the favicon', () => {
    expect(metadata.icons).toEqual({ icon: '/icon.png' })
  })
})
