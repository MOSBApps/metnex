import type { BotcIdentitySourceSnapshot } from './types'

/**
 * Read-only source port for BOTC identity data. This task explicitly forbids a live SQL Server
 * connection (see TASK-027.12 security rules) — a real adapter implementing this interface against
 * `../BOTC`'s SQL Server (per docs/migration/METNEX_SQLSERVER_READONLY_ADAPTER_ARCHITECTURE.md) is
 * out of scope here and is not implemented. Only the in-memory fixture adapter below exists in
 * this module, for tests and for a future CLI wired to an approved real adapter.
 */
export interface BotcIdentitySourceAdapter {
  readSnapshot(): Promise<BotcIdentitySourceSnapshot>
}

export class InMemoryBotcIdentitySourceAdapter implements BotcIdentitySourceAdapter {
  constructor(private readonly snapshot: BotcIdentitySourceSnapshot) {}

  async readSnapshot(): Promise<BotcIdentitySourceSnapshot> {
    return this.snapshot
  }
}
