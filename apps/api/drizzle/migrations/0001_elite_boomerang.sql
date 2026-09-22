CREATE TABLE IF NOT EXISTS "tenant_security_settings" (
	"tenantId" text PRIMARY KEY NOT NULL,
	"mfaRequired" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedBy" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_mfa_recovery_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"codeHash" text NOT NULL,
	"usedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_mfa_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"method" text DEFAULT 'TOTP' NOT NULL,
	"secretEncrypted" text,
	"keyVersion" text,
	"isEnabled" boolean DEFAULT false NOT NULL,
	"enabledAt" timestamp (3),
	"lastVerifiedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "user_mfa_settings_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "package_features" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "tenant_package_assignments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "package_features" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "tenant_package_assignments" CASCADE;--> statement-breakpoint
ALTER TABLE "report_artifacts" DROP CONSTRAINT IF EXISTS "report_artifacts_packageFeatureId_package_features_id_fk";
--> statement-breakpoint
ALTER TABLE "tenant_roles" ADD COLUMN IF NOT EXISTS "requiresMfa" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tenant_security_settings" ADD CONSTRAINT "tenant_security_settings_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tenant_security_settings" ADD CONSTRAINT "tenant_security_settings_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_mfa_recovery_codes" ADD CONSTRAINT "user_mfa_recovery_codes_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_mfa_settings" ADD CONSTRAINT "user_mfa_settings_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_mfa_recovery_codes_userId_idx" ON "user_mfa_recovery_codes" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_mfa_settings_userId_key" ON "user_mfa_settings" USING btree ("userId");--> statement-breakpoint
ALTER TABLE "report_artifacts" DROP COLUMN IF EXISTS "packageFeatureId";