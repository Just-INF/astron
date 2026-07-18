ALTER TABLE "email_jobs" ADD COLUMN "reservation_id" text;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN "kind" text;
--> statement-breakpoint
CREATE INDEX "email_jobs_reservation_idx" ON "email_jobs" USING btree ("reservation_id", "kind");
