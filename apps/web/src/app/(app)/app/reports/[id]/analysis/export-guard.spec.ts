import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExportGuard } from './export-guard'

/**
 * TASK-027.55 R1 — direct, DOM-free coverage of the export single-flight guard. No React, no
 * `disabled` attribute, no `fireEvent` — this is the guard's own logic, called as a plain
 * function, exactly what AI1's review asked for: proof this protection lives in the export
 * function's own call path, not only in a UI attribute.
 */
describe('createExportGuard.tryRun (synchronous work)', () => {
  it('runs fn on the first call', () => {
    const guard = createExportGuard()
    const fn = vi.fn(() => 'result')
    expect(guard.tryRun(fn)).toBe('result')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('with no cooldown, a call after the first has returned is allowed (not itself a double-call)', () => {
    const guard = createExportGuard(0)
    const fn = vi.fn()
    guard.tryRun(fn)
    guard.tryRun(fn)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('with a cooldown, a second synchronous call immediately after the first is refused', () => {
    const guard = createExportGuard(400)
    const fn = vi.fn()
    guard.tryRun(fn)
    const secondResult = guard.tryRun(fn)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(secondResult).toBeUndefined()
  })

  it('a third call after the cooldown elapses is allowed again', async () => {
    vi.useFakeTimers()
    const guard = createExportGuard(400)
    const fn = vi.fn()
    guard.tryRun(fn)
    guard.tryRun(fn) // refused, still in cooldown
    vi.advanceTimersByTime(401)
    guard.tryRun(fn)
    expect(fn).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('still releases the lock (after the cooldown) even when fn throws', () => {
    vi.useFakeTimers()
    const guard = createExportGuard(100)
    expect(() =>
      guard.tryRun(() => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(guard.locked).toBe(true) // cooldown still pending
    vi.advanceTimersByTime(101)
    expect(guard.locked).toBe(false)
    vi.useRealTimers()
  })
})

describe('createExportGuard.tryRunAsync (async work)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs fn and resolves with its result', async () => {
    const guard = createExportGuard()
    await expect(guard.tryRunAsync(async () => 'result')).resolves.toBe('result')
  })

  it('a second call fired before the first resolves is refused — the exact double-click scenario', async () => {
    let resolveFirst: (() => void) | undefined
    const guard = createExportGuard()
    const fn = vi.fn(() => new Promise<void>(resolve => (resolveFirst = resolve)))

    const first = guard.tryRunAsync(fn)
    const second = guard.tryRunAsync(fn) // fired synchronously right after, before `first` settles

    expect(second).toBeUndefined()
    expect(fn).toHaveBeenCalledTimes(1)
    resolveFirst?.()
    await first
  })

  it('a call fired after the first has resolved is allowed — a genuinely new export still works', async () => {
    const guard = createExportGuard()
    const fn = vi.fn(async () => undefined)
    await guard.tryRunAsync(fn)
    await guard.tryRunAsync(fn)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('releases the lock even when fn rejects', async () => {
    const guard = createExportGuard()
    await guard
      .tryRunAsync(async () => {
        throw new Error('boom')
      })
      ?.catch(() => undefined)
    expect(guard.locked).toBe(false)
    const fn = vi.fn(async () => undefined)
    await guard.tryRunAsync(fn)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
