import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

afterEach(() => {
  cleanup()
})

/**
 * jsdom has no real layout engine, so Recharts' `ResponsiveContainer` (which sizes itself off a
 * `ResizeObserver` callback) never sees a non-zero size and never renders its inner `<svg>` at
 * all — any test that needs to find that `<svg>` (e.g. TASK-027.55's PNG export, which reads it
 * from the DOM) would otherwise silently find nothing. This polyfill reports one fixed size
 * synchronously on `observe()`, which is enough for ResponsiveContainer to render.
 */
class FixedSizeResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 800, height: 300, top: 0, left: 0, bottom: 300, right: 800, x: 0, y: 0, toJSON: () => ({}) } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = FixedSizeResizeObserver as unknown as typeof ResizeObserver
}
