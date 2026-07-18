CREATE TYPE "public"."order_item_status" AS ENUM('not_taken', 'preparing', 'done');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('new', 'in_progress', 'ready', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('card', 'cash');--> statement-breakpoint
CREATE TYPE "public"."service_request_status" AS ENUM('new', 'acknowledged', 'completed');--> statement-breakpoint
CREATE TYPE "public"."service_request_type" AS ENUM('waiter_call', 'check');--> statement-breakpoint
ALTER TYPE "public"."membership_role" ADD VALUE 'waiter' BEFORE 'menu-editor';--> statement-breakpoint
ALTER TYPE "public"."membership_role" ADD VALUE 'chef' BEFORE 'menu-editor';--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"table_id" text NOT NULL,
	"type" "service_request_type" NOT NULL,
	"status" "service_request_status" DEFAULT 'new' NOT NULL,
	"payment_method" "payment_method",
	"notes" text,
	"guest_session_id" text,
	"created_by" text,
	"active_key" text DEFAULT 'active',
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone,
	"completed_by" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "closed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "status" "order_item_status" DEFAULT 'not_taken' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "preparation_relevant" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "assigned_chef_id" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "status" "order_status" DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "idempotency_key_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "completed_by" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "orders" SET "status" = 'completed', "completed_at" = "closed_at" WHERE "closed_at" IS NOT NULL;--> statement-breakpoint
UPDATE "order_items" AS oi SET "status" = 'done', "completed_at" = o."closed_at" FROM "orders" AS o WHERE oi."order_id" = o."id" AND o."closed_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_requests_queue_idx" ON "service_requests" USING btree ("restaurant_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_requests_active_unique" ON "service_requests" USING btree ("restaurant_id","table_id","type","active_key");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_assigned_chef_id_users_id_fk" FOREIGN KEY ("assigned_chef_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_active_idx" ON "orders" USING btree ("restaurant_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_unique" ON "orders" USING btree ("restaurant_id","idempotency_key_hash");
