CREATE TYPE "public"."CustomerSchemaStatus" AS ENUM('PROVISIONING', 'ACTIVE', 'FAILED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."SubscriptionStatus" AS ENUM('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."TenantStatus" AS ENUM('ACTIVE', 'SUSPENDED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."TenantType" AS ENUM('PLATFORM_ROOT', 'ROOT', 'STANDARD');--> statement-breakpoint
CREATE TYPE "public"."UserStatus" AS ENUM('ACTIVE', 'INACTIVE', 'LOCKED');--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"refreshTokenHash" text NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"isRevoked" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_schema_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"customerRootTenantId" text NOT NULL,
	"schemaName" text NOT NULL,
	"migrationVersion" text NOT NULL,
	"status" text DEFAULT 'PROVISIONING' NOT NULL,
	"lastError" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "customer_schema_registry_customerRootTenantId_unique" UNIQUE("customerRootTenantId"),
	CONSTRAINT "customer_schema_registry_schemaName_unique" UNIQUE("schemaName")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description" text,
	CONSTRAINT "permissions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"roleId" text NOT NULL,
	"permissionId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_bootstrap" (
	"id" text PRIMARY KEY NOT NULL,
	"singletonKey" integer DEFAULT 1 NOT NULL,
	"adminUserId" text NOT NULL,
	"completedAt" timestamp (3) NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"isBuiltin" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "system_roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tenant_closure" (
	"ancestorTenantId" text NOT NULL,
	"descendantTenantId" text NOT NULL,
	"customerRootTenantId" text,
	"depth" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"userId" text NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_role_permissions" (
	"roleId" text NOT NULL,
	"permissionCode" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_roles_id_tenantId_key" UNIQUE("id","tenantId")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"shortName" text,
	"slug" text NOT NULL,
	"type" "TenantType" DEFAULT 'STANDARD' NOT NULL,
	"status" "TenantStatus" DEFAULT 'ACTIVE' NOT NULL,
	"parentId" text,
	"customerRootId" text,
	"canEnterData" boolean DEFAULT true NOT NULL,
	"canAggregateChildren" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_system_role_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"roleId" text NOT NULL,
	"tenantId" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_tenant_role_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"roleId" text NOT NULL,
	"tenantId" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"passwordHash" text NOT NULL,
	"displayName" text NOT NULL,
	"isSystemAdmin" boolean DEFAULT false NOT NULL,
	"status" "UserStatus" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_ai_provider_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"providerType" text DEFAULT 'OPENAI' NOT NULL,
	"endpoint" text,
	"defaultModel" text,
	"apiKeyCiphertext" text,
	"isActive" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_general_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"shortName" text,
	"address" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_smtp_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"notificationsEnabled" boolean DEFAULT false NOT NULL,
	"host" text,
	"port" integer,
	"secure" boolean DEFAULT false NOT NULL,
	"username" text,
	"passwordCiphertext" text,
	"fromName" text,
	"fromEmail" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_ai_provider_overrides" (
	"tenantId" text PRIMARY KEY NOT NULL,
	"providerType" text DEFAULT 'OPENAI' NOT NULL,
	"endpoint" text,
	"defaultModel" text,
	"apiKeyCiphertext" text,
	"isActive" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_smtp_overrides" (
	"tenantId" text PRIMARY KEY NOT NULL,
	"notificationsEnabled" boolean DEFAULT false NOT NULL,
	"host" text,
	"port" integer,
	"secure" boolean DEFAULT false NOT NULL,
	"username" text,
	"passwordCiphertext" text,
	"fromName" text,
	"fromEmail" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"customerRootTenantId" text NOT NULL,
	"resourcePackageId" text NOT NULL,
	"status" "SubscriptionStatus" DEFAULT 'ACTIVE' NOT NULL,
	"startsAt" timestamp (3) DEFAULT now() NOT NULL,
	"endsAt" timestamp (3),
	"purchasedAt" timestamp (3) DEFAULT now() NOT NULL,
	"externalReference" text,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "customer_subscriptions_customerRootTenantId_unique" UNIQUE("customerRootTenantId")
);
--> statement-breakpoint
CREATE TABLE "package_features" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"moduleKey" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"maxChildTenantCount" integer NOT NULL,
	"maxUserCount" integer NOT NULL,
	"maxStorageMb" integer NOT NULL,
	"maxDatabaseMb" integer NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_package_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"packageFeatureId" text NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"assignedByUserId" text,
	"assignedAt" timestamp (3) DEFAULT now() NOT NULL,
	"revokedAt" timestamp (3),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "performance_request_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"requestId" text NOT NULL,
	"method" varchar(10) NOT NULL,
	"route" varchar(500) NOT NULL,
	"statusCode" integer NOT NULL,
	"durationMs" integer NOT NULL,
	"userId" text,
	"tenantId" text,
	"queryCount" integer,
	"dbTotalMs" integer,
	"maxQueryMs" integer,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_request_query_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"requestLogId" text NOT NULL,
	"queryHash" varchar(64),
	"durationMs" integer NOT NULL,
	"model" varchar(100),
	"operation" varchar(50),
	"queryText" varchar(1000),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actorId" text,
	"actorSnapshot" jsonb,
	"actionCode" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text NOT NULL,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_performance_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"singletonKey" integer DEFAULT 1 NOT NULL,
	"slowRequestThresholdMs" integer DEFAULT 1000 NOT NULL,
	"dbTraceEnabled" boolean DEFAULT false NOT NULL,
	"updatedByUserId" text,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_sample_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unitPrice" numeric(12, 2) NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "demo_sample_definitions_id_tenantId_key" UNIQUE("id","tenantId")
);
--> statement-breakpoint
CREATE TABLE "demo_sample_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"definitionId" text NOT NULL,
	"transactionNo" text NOT NULL,
	"transactionDate" timestamp (3) NOT NULL,
	"quantity" integer NOT NULL,
	"unitPrice" numeric(12, 2) NOT NULL,
	"status" varchar(24) DEFAULT 'OPEN' NOT NULL,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"moduleKey" text NOT NULL,
	"packageFeatureId" text,
	"viewMode" varchar(24) NOT NULL,
	"defaultPreviewFormat" varchar(12) DEFAULT 'HTML' NOT NULL,
	"primaryOutputFormat" varchar(12),
	"supportedOutputFormats" text[] DEFAULT '{}' NOT NULL,
	"printStrategy" varchar(32) DEFAULT 'NONE' NOT NULL,
	"templatePath" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_schema_registry" ADD CONSTRAINT "customer_schema_registry_customerRootTenantId_tenants_id_fk" FOREIGN KEY ("customerRootTenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_system_roles_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."system_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_permissions_id_fk" FOREIGN KEY ("permissionId") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_closure" ADD CONSTRAINT "tenant_closure_ancestorTenantId_tenants_id_fk" FOREIGN KEY ("ancestorTenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_closure" ADD CONSTRAINT "tenant_closure_descendantTenantId_tenants_id_fk" FOREIGN KEY ("descendantTenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_closure" ADD CONSTRAINT "tenant_closure_customerRootTenantId_tenants_id_fk" FOREIGN KEY ("customerRootTenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_role_permissions" ADD CONSTRAINT "tenant_role_permissions_roleId_tenant_roles_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."tenant_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_roles" ADD CONSTRAINT "tenant_roles_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_parentId_tenants_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_customerRootId_tenants_id_fk" FOREIGN KEY ("customerRootId") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_system_role_assignments" ADD CONSTRAINT "user_system_role_assignments_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_system_role_assignments" ADD CONSTRAINT "user_system_role_assignments_roleId_system_roles_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."system_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_system_role_assignments" ADD CONSTRAINT "user_system_role_assignments_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tenant_role_assignments" ADD CONSTRAINT "user_tenant_role_assignments_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tenant_role_assignments" ADD CONSTRAINT "user_tenant_role_assignments_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tenant_role_assignments" ADD CONSTRAINT "user_tenant_role_assignments_roleId_tenantId_fkey" FOREIGN KEY ("roleId","tenantId") REFERENCES "public"."tenant_roles"("id","tenantId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_ai_provider_overrides" ADD CONSTRAINT "tenant_ai_provider_overrides_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_smtp_overrides" ADD CONSTRAINT "tenant_smtp_overrides_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_subscriptions" ADD CONSTRAINT "customer_subscriptions_customerRootTenantId_tenants_id_fk" FOREIGN KEY ("customerRootTenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_subscriptions" ADD CONSTRAINT "customer_subscriptions_resourcePackageId_resource_packages_id_fk" FOREIGN KEY ("resourcePackageId") REFERENCES "public"."resource_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_package_assignments" ADD CONSTRAINT "tenant_package_assignments_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_package_assignments" ADD CONSTRAINT "tenant_package_assignments_packageFeatureId_package_features_id_fk" FOREIGN KEY ("packageFeatureId") REFERENCES "public"."package_features"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_package_assignments" ADD CONSTRAINT "tenant_package_assignments_assignedByUserId_users_id_fk" FOREIGN KEY ("assignedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_request_logs" ADD CONSTRAINT "performance_request_logs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_request_logs" ADD CONSTRAINT "performance_request_logs_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_request_query_logs" ADD CONSTRAINT "performance_request_query_logs_requestLogId_performance_request_logs_id_fk" FOREIGN KEY ("requestLogId") REFERENCES "public"."performance_request_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_sample_definitions" ADD CONSTRAINT "demo_sample_definitions_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_sample_transactions" ADD CONSTRAINT "demo_sample_transactions_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_sample_transactions" ADD CONSTRAINT "demo_sample_transactions_definitionId_tenantId_fkey" FOREIGN KEY ("definitionId","tenantId") REFERENCES "public"."demo_sample_definitions"("id","tenantId") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_artifacts" ADD CONSTRAINT "report_artifacts_packageFeatureId_package_features_id_fk" FOREIGN KEY ("packageFeatureId") REFERENCES "public"."package_features"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_refreshTokenHash_key" ON "auth_sessions" USING btree ("refreshTokenHash");--> statement-breakpoint
CREATE INDEX "auth_sessions_userId_isRevoked_idx" ON "auth_sessions" USING btree ("userId","isRevoked");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_pkey" ON "role_permissions" USING btree ("roleId","permissionId");--> statement-breakpoint
CREATE UNIQUE INDEX "system_bootstrap_singletonKey_key" ON "system_bootstrap" USING btree ("singletonKey");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_closure_pkey" ON "tenant_closure" USING btree ("ancestorTenantId","descendantTenantId");--> statement-breakpoint
CREATE INDEX "tenant_closure_descendantTenantId_idx" ON "tenant_closure" USING btree ("descendantTenantId");--> statement-breakpoint
CREATE INDEX "tenant_closure_customerRootTenantId_idx" ON "tenant_closure" USING btree ("customerRootTenantId");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_memberships_tenantId_userId_key" ON "tenant_memberships" USING btree ("tenantId","userId");--> statement-breakpoint
CREATE INDEX "tenant_memberships_userId_isActive_idx" ON "tenant_memberships" USING btree ("userId","isActive");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_role_permissions_pkey" ON "tenant_role_permissions" USING btree ("roleId","permissionCode");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_roles_tenantId_name_key" ON "tenant_roles" USING btree ("tenantId","name");--> statement-breakpoint
CREATE INDEX "tenant_roles_tenantId_idx" ON "tenant_roles" USING btree ("tenantId");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenants_type_idx" ON "tenants" USING btree ("type");--> statement-breakpoint
CREATE INDEX "tenants_parentId_idx" ON "tenants" USING btree ("parentId");--> statement-breakpoint
CREATE INDEX "tenants_customerRootId_idx" ON "tenants" USING btree ("customerRootId");--> statement-breakpoint
CREATE UNIQUE INDEX "user_system_role_assignments_userId_roleId_tenantId_key" ON "user_system_role_assignments" USING btree ("userId","roleId","tenantId");--> statement-breakpoint
CREATE INDEX "user_system_role_assignments_tenantId_idx" ON "user_system_role_assignments" USING btree ("tenantId");--> statement-breakpoint
CREATE UNIQUE INDEX "user_tenant_role_assignments_userId_roleId_key" ON "user_tenant_role_assignments" USING btree ("userId","roleId");--> statement-breakpoint
CREATE INDEX "user_tenant_role_assignments_userId_tenantId_idx" ON "user_tenant_role_assignments" USING btree ("userId","tenantId");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_email_status_idx" ON "users" USING btree ("email","status");--> statement-breakpoint
CREATE INDEX "customer_subscriptions_resourcePackageId_status_idx" ON "customer_subscriptions" USING btree ("resourcePackageId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "package_features_code_key" ON "package_features" USING btree ("code");--> statement-breakpoint
CREATE INDEX "package_features_moduleKey_isActive_idx" ON "package_features" USING btree ("moduleKey","isActive");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_packages_code_key" ON "resource_packages" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_package_assignments_tenantId_packageFeatureId_key" ON "tenant_package_assignments" USING btree ("tenantId","packageFeatureId");--> statement-breakpoint
CREATE INDEX "tenant_package_assignments_tenantId_isActive_idx" ON "tenant_package_assignments" USING btree ("tenantId","isActive");--> statement-breakpoint
CREATE INDEX "tenant_package_assignments_packageFeatureId_isActive_idx" ON "tenant_package_assignments" USING btree ("packageFeatureId","isActive");--> statement-breakpoint
CREATE INDEX "performance_request_logs_createdAt_idx" ON "performance_request_logs" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "performance_request_logs_route_createdAt_idx" ON "performance_request_logs" USING btree ("route","createdAt");--> statement-breakpoint
CREATE INDEX "performance_request_logs_tenantId_createdAt_idx" ON "performance_request_logs" USING btree ("tenantId","createdAt");--> statement-breakpoint
CREATE INDEX "performance_request_query_logs_requestLogId_idx" ON "performance_request_query_logs" USING btree ("requestLogId");--> statement-breakpoint
CREATE INDEX "performance_request_query_logs_durationMs_idx" ON "performance_request_query_logs" USING btree ("durationMs");--> statement-breakpoint
CREATE INDEX "platform_audit_logs_actionCode_idx" ON "platform_audit_logs" USING btree ("actionCode");--> statement-breakpoint
CREATE INDEX "platform_audit_logs_actorId_idx" ON "platform_audit_logs" USING btree ("actorId");--> statement-breakpoint
CREATE INDEX "platform_audit_logs_entityType_entityId_idx" ON "platform_audit_logs" USING btree ("entityType","entityId");--> statement-breakpoint
CREATE INDEX "platform_audit_logs_createdAt_idx" ON "platform_audit_logs" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_performance_settings_singletonKey_key" ON "platform_performance_settings" USING btree ("singletonKey");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_sample_definitions_tenantId_code_key" ON "demo_sample_definitions" USING btree ("tenantId","code");--> statement-breakpoint
CREATE INDEX "demo_sample_definitions_tenantId_isActive_idx" ON "demo_sample_definitions" USING btree ("tenantId","isActive");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_sample_transactions_tenantId_transactionNo_key" ON "demo_sample_transactions" USING btree ("tenantId","transactionNo");--> statement-breakpoint
CREATE INDEX "demo_sample_transactions_tenantId_transactionDate_idx" ON "demo_sample_transactions" USING btree ("tenantId","transactionDate");--> statement-breakpoint
CREATE INDEX "demo_sample_transactions_tenantId_status_idx" ON "demo_sample_transactions" USING btree ("tenantId","status");--> statement-breakpoint
CREATE INDEX "demo_sample_transactions_tenantId_definitionId_idx" ON "demo_sample_transactions" USING btree ("tenantId","definitionId");--> statement-breakpoint
CREATE UNIQUE INDEX "report_artifacts_code_key" ON "report_artifacts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "report_artifacts_moduleKey_isActive_idx" ON "report_artifacts" USING btree ("moduleKey","isActive");