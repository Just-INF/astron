import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const membershipRole = pgEnum("membership_role", [
  "owner",
  "manager",
  "host",
  "waiter",
  "chef",
  "menu-editor",
  "viewer",
]);
export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);
export const tableStatus = pgEnum("table_status", ["available", "occupied", "reserved"]);
export const reservationStatus = pgEnum("reservation_status", [
  "confirmed",
  "seated",
  "completed",
  "cancelled",
]);
export const reservationSource = pgEnum("reservation_source", ["guest", "staff", "integration"]);
export const proposalStatus = pgEnum("proposal_status", [
  "pending",
  "confirmed",
  "rejected",
  "executed",
  "failed",
]);
export const mediaStatus = pgEnum("media_status", ["pending", "ready", "deleted"]);
export const orderStatus = pgEnum("order_status", [
  "new",
  "in_progress",
  "ready",
  "completed",
  "cancelled",
]);
export const orderItemStatus = pgEnum("order_item_status", ["not_taken", "preparing", "done"]);
export const serviceRequestType = pgEnum("service_request_type", ["waiter_call", "check"]);
export const serviceRequestStatus = pgEnum("service_request_status", [
  "new",
  "acknowledged",
  "completed",
]);
export const paymentMethod = pgEnum("payment_method", ["card", "cash"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("password_reset_token_hash_unique").on(t.tokenHash)],
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_verification_token_hash_unique").on(t.tokenHash),
    index("email_verification_user_idx").on(t.userId),
  ],
);

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    lemonCustomerId: text("lemon_customer_id"),
    lemonSubscriptionId: text("lemon_subscription_id"),
    lemonOrderId: text("lemon_order_id"),
    productId: text("product_id"),
    variantId: text("variant_id"),
    status: text("status").notNull().default("inactive"),
    planName: text("plan_name"),
    cardBrand: text("card_brand"),
    cardLastFour: text("card_last_four"),
    renewsAt: timestamp("renews_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true }),
    portalUrl: text("portal_url"),
    updatePaymentUrl: text("update_payment_url"),
    testMode: boolean("test_mode").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("billing_subscription_unique").on(t.lemonSubscriptionId)],
);

export const emailJobs = pgTable(
  "email_jobs",
  {
    id: text("id").primaryKey(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    text: text("text").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(6),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    reservationId: text("reservation_id"),
    kind: text("kind"),
    ...timestamps,
  },
  (t) => [
    index("email_jobs_delivery_idx").on(t.status, t.runAt),
    index("email_jobs_reservation_idx").on(t.reservationId, t.kind),
  ],
);

export const billingWebhookEvents = pgTable("billing_webhook_events", {
  id: text("id").primaryKey(),
  eventName: text("event_name").notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const restaurants = pgTable("restaurants", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  coverImageUrl: text("cover_image_url"),
  cuisineType: text("cuisine_type").notNull().default(""),
  notes: text("notes").notNull().default(""),
  currency: text("currency").notNull().default("EUR"),
  language: text("language").notNull().default("en"),
  timezone: text("timezone").notNull().default("UTC"),
  reservationsEnabled: boolean("reservations_enabled").notNull().default(true),
  callWaiterEnabled: boolean("call_waiter_enabled").notNull().default(false),
  requestCheckEnabled: boolean("request_check_enabled").notNull().default(false),
  theme: text("theme").notNull().default("gold-dark"),
  tableCount: integer("table_count").notNull().default(0),
  layoutShape: text("layout_shape").notNull().default("intimate"),
  ...timestamps,
});

export const restaurantMemberships = pgTable(
  "restaurant_memberships",
  {
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.restaurantId, t.userId] }),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const restaurantInvitations = pgTable(
  "restaurant_invitations",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: membershipRole("role").notNull().default("viewer"),
    status: invitationStatus("status").notNull().default("pending"),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("invitations_restaurant_idx").on(t.restaurantId)],
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    publicUrl: text("public_url"),
    mimeType: text("mime_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    status: mediaStatus("status").notNull().default("pending"),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("media_object_key_unique").on(t.objectKey),
    index("media_restaurant_idx").on(t.restaurantId),
  ],
);

export const menuCategories = pgTable(
  "menu_categories",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    position: integer("position").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("menu_categories_order_idx").on(t.restaurantId, t.position)],
);

export const taxCategories = pgTable(
  "tax_categories",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    rateBasisPoints: integer("rate_basis_points").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("tax_categories_restaurant_idx").on(t.restaurantId)],
);

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => menuCategories.id),
    taxCategoryId: text("tax_category_id")
      .notNull()
      .references(() => taxCategories.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    isAvailable: boolean("is_available").notNull().default(true),
    position: integer("position").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("products_category_order_idx").on(t.restaurantId, t.categoryId, t.position)],
);

export const productImages = pgTable(
  "product_images",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => mediaAssets.id),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.mediaId] })],
);

export const productDietaryTags = pgTable(
  "product_dietary_tags",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.tag] })],
);

function themeDraft(name: string) {
  return pgTable(name, {
    restaurantId: text("restaurant_id")
      .primaryKey()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    document: jsonb("document").notNull(),
    revision: integer("revision").notNull().default(1),
    updatedBy: text("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  });
}

function themeVersion(name: string) {
  return pgTable(
    name,
    {
      id: text("id").primaryKey(),
      restaurantId: text("restaurant_id")
        .notNull()
        .references(() => restaurants.id, { onDelete: "cascade" }),
      version: integer("version").notNull(),
      document: jsonb("document").notNull(),
      publishedBy: text("published_by")
        .notNull()
        .references(() => users.id),
      publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [uniqueIndex(`${name}_restaurant_version_unique`).on(t.restaurantId, t.version)],
  );
}

export const menuThemeDrafts = themeDraft("menu_theme_drafts");
export const menuThemeVersions = themeVersion("menu_theme_versions");
export const floorPlanThemeDrafts = themeDraft("floor_plan_theme_drafts");
export const floorPlanThemeVersions = themeVersion("floor_plan_theme_versions");
export const reservationThemeDrafts = themeDraft("reservation_theme_drafts");
export const reservationThemeVersions = themeVersion("reservation_theme_versions");

export const floorLayouts = pgTable("floor_layouts", {
  restaurantId: text("restaurant_id")
    .primaryKey()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(1),
  walls: jsonb("walls").notNull().default([]),
  zones: jsonb("zones").notNull().default([]),
  updatedBy: text("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const diningTables = pgTable(
  "dining_tables",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull(),
    shape: text("shape").notNull(),
    position: jsonb("position").notNull(),
    rotation: integer("rotation").notNull().default(0),
    status: tableStatus("status").notNull().default("available"),
    codeHash: text("code_hash").notNull(),
    codeDisplay: text("code_display").notNull(),
    linked: boolean("linked").notNull().default(true),
    width: integer("width"),
    depth: integer("depth"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("table_code_hash_unique").on(t.codeHash),
    index("tables_restaurant_idx").on(t.restaurantId),
  ],
);

export const reservationSettings = pgTable("reservation_settings", {
  restaurantId: text("restaurant_id")
    .primaryKey()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  maxStayMinutes: integer("max_stay_minutes").notNull().default(120),
  slotMinutes: integer("slot_minutes").notNull().default(30),
  is24_7: boolean("is_24_7").notNull().default(false),
  weeklyHours: jsonb("weekly_hours").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reservations = pgTable(
  "reservations",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tableId: text("table_id")
      .notNull()
      .references(() => diningTables.id),
    guestName: text("guest_name").notNull(),
    guestEmail: text("guest_email"),
    guestPhone: text("guest_phone"),
    partySize: integer("party_size").notNull(),
    serviceDate: date("service_date").notNull(),
    localStartTime: text("local_start_time").notNull(),
    localEndTime: text("local_end_time").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: reservationStatus("status").notNull().default("confirmed"),
    source: reservationSource("source").notNull(),
    notes: text("notes"),
    idempotencyKeyHash: text("idempotency_key_hash"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("reservations_search_idx").on(t.restaurantId, t.startAt, t.endAt),
    uniqueIndex("reservations_idempotency_unique").on(t.restaurantId, t.idempotencyKeyHash),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tableId: text("table_id").references(() => diningTables.id),
    status: orderStatus("status").notNull().default("new"),
    currency: text("currency").notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    taxMinor: integer("tax_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    notes: text("notes"),
    idempotencyKeyHash: text("idempotency_key_hash"),
    createdBy: text("created_by").references(() => users.id),
    completedBy: text("completed_by").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("orders_analytics_idx").on(t.restaurantId, t.closedAt),
    index("orders_active_idx").on(t.restaurantId, t.status, t.createdAt),
    uniqueIndex("orders_idempotency_unique").on(t.restaurantId, t.idempotencyKeyHash),
    check(
      "orders_totals_nonnegative",
      sql`${t.subtotalMinor} >= 0 and ${t.taxMinor} >= 0 and ${t.totalMinor} >= 0`,
    ),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id),
    productName: text("product_name").notNull(),
    categoryName: text("category_name").notNull(),
    notes: text("notes"),
    status: orderItemStatus("status").notNull().default("not_taken"),
    preparationRelevant: boolean("preparation_relevant").notNull().default(true),
    assignedChefId: text("assigned_chef_id").references(() => users.id),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull(),
    taxMinor: integer("tax_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("order_items_quantity_positive", sql`${t.quantity} > 0`),
    check(
      "order_items_money_nonnegative",
      sql`${t.unitPriceMinor} >= 0 and ${t.taxMinor} >= 0 and ${t.totalMinor} >= 0`,
    ),
  ],
);

export const serviceRequests = pgTable(
  "service_requests",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tableId: text("table_id")
      .notNull()
      .references(() => diningTables.id, { onDelete: "cascade" }),
    type: serviceRequestType("type").notNull(),
    status: serviceRequestStatus("status").notNull().default("new"),
    paymentMethod: paymentMethod("payment_method"),
    notes: text("notes"),
    guestSessionId: text("guest_session_id"),
    createdBy: text("created_by").references(() => users.id),
    activeKey: text("active_key").default("active"),
    acknowledgedBy: text("acknowledged_by").references(() => users.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    completedBy: text("completed_by").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("service_requests_queue_idx").on(t.restaurantId, t.status, t.createdAt),
    uniqueIndex("service_requests_active_unique").on(
      t.restaurantId,
      t.tableId,
      t.type,
      t.activeKey,
    ),
    check(
      "service_requests_payment_method_check",
      sql`(${t.type} = 'check' and ${t.paymentMethod} is not null) or (${t.type} = 'waiter_call' and ${t.paymentMethod} is null)`,
    ),
  ],
);

export const assistantConversations = pgTable("assistant_conversations", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

export const assistantMessages = pgTable("assistant_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => assistantConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assistantActionProposals = pgTable("assistant_action_proposals", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => assistantConversations.id, { onDelete: "cascade" }),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  payload: jsonb("payload").notNull(),
  status: proposalStatus("status").notNull().default("pending"),
  confirmedBy: text("confirmed_by").references(() => users.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  ...timestamps,
});

export const mcpApiKeys = pgTable(
  "mcp_api_keys",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mcp_api_keys_token_hash_unique").on(t.tokenHash),
    index("mcp_api_keys_restaurant_idx").on(t.restaurantId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: text("restaurant_id").references(() => restaurants.id, {
      onDelete: "set null",
    }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_restaurant_created_idx").on(t.restaurantId, t.createdAt)],
);
