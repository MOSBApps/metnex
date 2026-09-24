import { describeScadaReadOnlyContract } from './test-helpers/scada-readonly-port.contract'
import { ReferenceScadaPort } from './test-helpers/reference-scada-port'

/**
 * TASK-027.58 — runs the SCADA read-only security/performance contract against the TEST-ONLY
 * reference model (aligned with DEC-0015 in TASK-027.64 R1). The production adapter
 * (`reporting/scada/adapter/`) proves the same properties in its own specs because its request/response shape
 * (catalog UUID, catalog-owned limits) differs from this allowlist-keyed model.
 */
describeScadaReadOnlyContract('test-only reference model', ({ allowlist, limits, driver, audit, correlationId }) => new ReferenceScadaPort(allowlist, limits, driver, audit, correlationId))
