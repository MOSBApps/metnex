DROP TABLE "demo_sample_definitions" CASCADE;--> statement-breakpoint
DROP TABLE "demo_sample_transactions" CASCADE;--> statement-breakpoint
-- TASK-022.3: remove the Demo Operations report artifact seeded by the now-removed
-- ReportingService.ensureDemoReportArtifact() / demo bootstrap seed.
DELETE FROM "report_artifacts" WHERE "code" = 'DEMO_SAMPLE_TRANSACTIONS';--> statement-breakpoint
-- TASK-022.3: remove the demo resource package feature record, but only when nothing still
-- subscribes to it (customer_subscriptions.resourcePackageId is ON DELETE RESTRICT). If a demo
-- tenant subscription is still active, this package row is deliberately left in place — decommission
-- the demo tenant first, then re-run this cleanup manually.
DELETE FROM "resource_packages" AS rp
WHERE rp."code" = 'AIS_DEMO_PACKAGE'
  AND NOT EXISTS (
    SELECT 1 FROM "customer_subscriptions" cs WHERE cs."resourcePackageId" = rp."id"
  );