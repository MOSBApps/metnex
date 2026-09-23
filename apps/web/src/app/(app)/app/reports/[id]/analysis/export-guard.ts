/**
 * TASK-027.55 R1 (AI1 review) — a single-flight guard that lives in the export logic itself, not
 * only in a React `disabled` attribute. The UI's `disabled={exporting}` binding is real and does
 * block a second native click in a real browser (and in RTL, which won't dispatch `click` on a
 * disabled element), but the task explicitly wants the export function's own call path to refuse a
 * concurrent/rapid re-entry independent of whatever UI happens to call it — this is that guard,
 * directly unit-tested with no DOM/React involved at all (see export-guard.spec.ts).
 */
export function createExportGuard(cooldownMs = 0) {
  let locked = false

  function release() {
    if (cooldownMs > 0) {
      setTimeout(() => {
        locked = false
      }, cooldownMs)
    } else {
      locked = false
    }
  }

  return {
    get locked() {
      return locked
    },
    /** Synchronous work: runs `fn` only if not already locked; a lock held during `fn` plus the
     * cooldown window is what makes a synchronous handler double-click-safe (a handler with no
     * real async work to await would otherwise already be unlocked before a near-simultaneous
     * second call arrives). Returns `fn`'s result, or `undefined` if refused. */
    tryRun<T>(fn: () => T): T | undefined {
      if (locked) return undefined
      locked = true
      try {
        return fn()
      } finally {
        release()
      }
    },
    /** Async work: locks synchronously before `fn` is even invoked, so a second call arriving
     * before the first's promise settles is refused deterministically — no cooldown needed since
     * the lock's own lifetime already spans the whole operation. Returns `fn()`'s promise, or
     * `undefined` if refused. */
    tryRunAsync<T>(fn: () => Promise<T>): Promise<T> | undefined {
      if (locked) return undefined
      locked = true
      return fn().finally(release)
    },
  }
}
