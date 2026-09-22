/**
 * Data-plane migration version stamped onto a freshly provisioned customer-root schema.
 * '0000_empty' means: the schema exists, no domain tables have been created inside it yet.
 * A future domain module moved into the tenant data-plane will introduce real versions
 * (e.g. '0001_<module>_foundation') and the migration-fan-out mechanism described in DEC-0010 §9.
 */
export const DATA_PLANE_SCHEMA_VERSION = '0000_empty'
