import { Inject, Injectable } from '@nestjs/common'
import { analyzePrivilegeSnapshot, type PrivilegeReport } from './privilege-report.domain'
import { PRIVILEGE_SNAPSHOT_PORT, type PrivilegeSnapshotPort } from './privilege-snapshot.port'

/**
 * Read-only privilege audit (DRY_RUN only). It loads a snapshot through a SELECT-only port and returns a report.
 * It grants nothing, changes no access and repairs nothing — drift, global TENANT_ADMIN assignments or a violated
 * invariant only appear in the returned value (Q-DP24; enforcement belongs to TASK-027.46/.47).
 */
@Injectable()
export class PrivilegeAuditService {
  constructor(@Inject(PRIVILEGE_SNAPSHOT_PORT) private readonly snapshots: PrivilegeSnapshotPort) {}

  async report(): Promise<PrivilegeReport> {
    return analyzePrivilegeSnapshot(await this.snapshots.load())
  }
}
