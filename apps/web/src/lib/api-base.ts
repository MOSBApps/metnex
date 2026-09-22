/**
 * getApiBase — single source of truth for the runtime API origin.
 *
 * NEXT_PUBLIC_* variables are baked into the client bundle at build time.
 * In standalone/Docker deployments that can leave the browser with an empty
 * or stale value, causing fetch calls to fall back to the current web origin.
 *
 * Fix: root layout injects the runtime API URL into window before any client
 * code executes. Client-side callers read that value first.
 */
export function getApiBase(): string {
  if (
    typeof window !== 'undefined' &&
    (window as { __METNEX_API_URL__?: string }).__METNEX_API_URL__
  ) {
    return (window as { __METNEX_API_URL__?: string }).__METNEX_API_URL__!
  }

  return process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
}
