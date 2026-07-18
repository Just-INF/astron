CREATE TABLE "billing_subscriptions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"lemon_customer_id" text,
	"lemon_subscription_id" text,
	"lemon_order_id" text,
	"product_id" text,
	"variant_id" text,
	"status" text DEFAULT 'inactive' NOT NULL,
	"plan_name" text,
	"card_brand" text,
	"card_last_four" text,
	"renews_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"portal_url" text,
	"update_payment_url" text,
	"test_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscription_unique" ON "billing_subscriptions" USING btree ("lemon_subscription_id");