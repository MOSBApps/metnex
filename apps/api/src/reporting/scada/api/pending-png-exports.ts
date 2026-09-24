/**
 * TASK-027.74 (AI1 correction) — a PNG is drawn by the browser, so its success can only be recorded AFTER the bytes exist. Step 1
 * (`export/PNG`) authorises and registers ONE pending export here; step 2 (`export/PNG/complete`) must present that id from the SAME actor,
 * tenant, customer root and artifact, once, before it expires. Process memory only; a restart drops pending exports (the client then
 * gets a static "context invalid" and can simply export again). Bounded: the oldest entries are evicted.
 */
export interface PendingPngExport {
  actorId: string
  tenantId: string
  customerRootTenantId: string
  artifactCode: string
  rowCount: number
  simulation: boolean
  expiresAtMs: number
}

const TTL_MS = 5 * 60 * 1000
const MAX_PENDING = 500

export class PendingPngExports {
  private readonly entries = new Map<string, PendingPngExport>()

  register(id: string, entry: Omit<PendingPngExport, 'expiresAtMs'>, nowMs: number): void {
    for (const [key, value] of this.entries) if (value.expiresAtMs <= nowMs) this.entries.delete(key)
    while (this.entries.size >= MAX_PENDING) this.entries.delete(this.entries.keys().next().value as string)
    this.entries.set(id, { ...entry, expiresAtMs: nowMs + TTL_MS })
  }

  /** Single use: the entry is removed whether or not the caller turns out to match (a wrong caller cannot probe, a right one cannot replay). */
  take(id: string, nowMs: number): PendingPngExport | null {
    const entry = this.entries.get(id) ?? null
    this.entries.delete(id)
    return entry && entry.expiresAtMs > nowMs ? entry : null
  }
}
