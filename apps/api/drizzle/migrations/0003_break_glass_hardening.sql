CREATE TABLE "break_glass_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"singletonKey" integer DEFAULT 1 NOT NULL,
	"windowStartAt" timestamp (3) DEFAULT now() NOT NULL,
	"attemptCount" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "break_glass_recovery_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tokenHash" text NOT NULL,
	"eventId" text NOT NULL,
	"targetUserId" text NOT NULL,
	"consumedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "break_glass_recovery_events" ADD CONSTRAINT "break_glass_recovery_events_targetUserId_users_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "break_glass_attempts_singletonKey_key" ON "break_glass_attempts" USING btree ("singletonKey");--> statement-breakpoint
CREATE UNIQUE INDEX "break_glass_recovery_events_tokenHash_key" ON "break_glass_recovery_events" USING btree ("tokenHash");