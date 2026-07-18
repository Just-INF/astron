import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../db/client";
import { billingSubscriptions, billingWebhookEvents } from "../../db/schema";
import { requireAuth, type AppVariables } from "../../lib/auth";
import { config } from "../../lib/config";
import { ApiError } from "../../lib/errors";
import { entitlementsForUser } from "../../lib/entitlements";
import { z } from "zod";

type LemonResource = { id: string; attributes: Record<string, any> };
const planId = z.enum(["table", "house", "group"]);

function configuredPlans() {
  return {
    table: config.LEMONSQUEEZY_TABLE_VARIANT_ID,
    house: config.LEMONSQUEEZY_VARIANT_ID,
    group: config.LEMONSQUEEZY_GROUP_VARIANT_ID,
  } as const;
}

function requireBillingConfig() {
  if (
    !config.LEMONSQUEEZY_API_KEY ||
    !config.LEMONSQUEEZY_STORE_ID ||
    !config.LEMONSQUEEZY_VARIANT_ID
  )
    throw new ApiError(503, "BILLING_NOT_CONFIGURED", "Billing is not configured yet.");
}

async function lemonRequest(path: string, init: RequestInit = {}) {
  requireBillingConfig();
  const response = await fetch(`https://api.lemonsqueezy.com/v1${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${config.LEMONSQUEEZY_API_KEY}`,
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as any;
  if (!response.ok)
    throw new ApiError(
      502,
      "BILLING_PROVIDER_ERROR",
      payload?.errors?.[0]?.detail ?? "The billing provider could not complete the request.",
    );
  return payload;
}

function subscriptionFields(resource: LemonResource) {
  const a = resource.attributes;
  return {
    lemonCustomerId: String(a.customer_id ?? ""),
    lemonSubscriptionId: resource.id,
    lemonOrderId: String(a.order_id ?? ""),
    productId: String(a.product_id ?? ""),
    variantId: String(a.variant_id ?? ""),
    status: String(a.status ?? "inactive"),
    planName:
      a.product_name && a.variant_name
        ? `${a.product_name} · ${a.variant_name}`
        : (a.product_name ?? a.variant_name ?? null),
    cardBrand: a.card_brand ?? null,
    cardLastFour: a.card_last_four ?? null,
    renewsAt: a.renews_at ? new Date(a.renews_at) : null,
    trialEndsAt: a.trial_ends_at ? new Date(a.trial_ends_at) : null,
    endsAt: a.ends_at ? new Date(a.ends_at) : null,
    providerUpdatedAt: new Date(String(a.updated_at ?? a.created_at ?? new Date().toISOString())),
    portalUrl: a.urls?.customer_portal ?? null,
    updatePaymentUrl: a.urls?.update_payment_method ?? null,
    testMode: Boolean(a.test_mode),
    updatedAt: new Date(),
  };
}

async function persistSubscription(userId: string, resource: LemonResource) {
  const fields = subscriptionFields(resource);
  const [row] = await db
    .insert(billingSubscriptions)
    .values({ userId, ...fields })
    .onConflictDoUpdate({
      target: billingSubscriptions.userId,
      set: fields,
    })
    .returning();
  return row;
}

async function recoverSubscription(user: { id: string; email: string }) {
  if (!config.LEMONSQUEEZY_API_KEY || !config.LEMONSQUEEZY_STORE_ID) return undefined;
  const query = new URLSearchParams({
    "filter[store_id]": config.LEMONSQUEEZY_STORE_ID,
    "filter[user_email]": user.email,
    "page[size]": "10",
  });
  const payload = (await lemonRequest(`/subscriptions?${query}`)) as { data?: LemonResource[] };
  const configuredVariants = new Set(Object.values(configuredPlans()).filter(Boolean));
  const resource = payload.data?.find((candidate) =>
    configuredVariants.has(String(candidate.attributes.variant_id ?? "")),
  );
  return resource ? persistSubscription(user.id, resource) : undefined;
}

function publicSubscription(row: typeof billingSubscriptions.$inferSelect | undefined) {
  return row
    ? {
        status: row.status,
        planName: row.planName,
        cardBrand: row.cardBrand,
        cardLastFour: row.cardLastFour,
        renewsAt: row.renewsAt?.toISOString() ?? null,
        endsAt: row.endsAt?.toISOString() ?? null,
        testMode: row.testMode,
        portalUrl: row.portalUrl ?? null,
      }
    : {
        status: "inactive",
        planName: null,
        cardBrand: null,
        cardLastFour: null,
        renewsAt: null,
        endsAt: null,
        testMode: false,
        portalUrl: null,
      };
}

export const billingRoutes = new Hono<{ Variables: AppVariables }>();

async function requireSubscription(userId: string) {
  const [row] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.userId, userId))
    .limit(1);
  if (!row) throw new ApiError(404, "SUBSCRIPTION_NOT_FOUND", "No subscription found.");
  if (!row.lemonSubscriptionId)
    throw new ApiError(400, "NO_SUBSCRIPTION_ID", "Subscription reference is missing.");
  return row;
}

billingRoutes.post("/webhook", async (c) => {
  const secret = config.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret)
    throw new ApiError(
      503,
      "BILLING_WEBHOOK_NOT_CONFIGURED",
      "Billing webhooks are not configured.",
    );
  const raw = await c.req.text();
  const supplied = c.req.header("X-Signature") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const valid =
    supplied.length === expected.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!valid) throw new ApiError(401, "INVALID_WEBHOOK_SIGNATURE", "Invalid webhook signature.");
  const payload = JSON.parse(raw) as {
    meta?: { event_name?: string; custom_data?: { user_id?: string } };
    data?: LemonResource;
  };
  const eventName = payload.meta?.event_name;
  const resource = payload.data;
  if (!eventName || !resource)
    throw new ApiError(422, "INVALID_WEBHOOK", "Webhook payload is incomplete.");
  const eventId = `${eventName}:${resource.id}:${resource.attributes.updated_at ?? resource.attributes.created_at ?? "event"}`;
  const inserted = await db
    .insert(billingWebhookEvents)
    .values({ id: eventId, eventName, payload })
    .onConflictDoNothing()
    .returning({ id: billingWebhookEvents.id });
  if (!inserted.length) return c.json({ data: { accepted: true, duplicate: true } });

  try {
    if (eventName.startsWith("subscription_") && !eventName.startsWith("subscription_payment_")) {
      const providerUpdatedAt = subscriptionFields(resource).providerUpdatedAt;
      let userId = payload.meta?.custom_data?.user_id;
      if (!userId) {
        const [existing] = await db
          .select({ userId: billingSubscriptions.userId })
          .from(billingSubscriptions)
          .where(eq(billingSubscriptions.lemonSubscriptionId, resource.id))
          .limit(1);
        userId = existing?.userId;
      }
      if (userId) {
        const [current] = await db
          .select({ providerUpdatedAt: billingSubscriptions.providerUpdatedAt })
          .from(billingSubscriptions)
          .where(eq(billingSubscriptions.userId, userId))
          .limit(1);
        if (current?.providerUpdatedAt && current.providerUpdatedAt >= providerUpdatedAt)
          return c.json({ data: { accepted: true, duplicate: false, stale: true } });
        await persistSubscription(userId, resource);
      }
    }
  } catch (error) {
    await db.delete(billingWebhookEvents).where(eq(billingWebhookEvents.id, eventId));
    throw error;
  }
  return c.json({ data: { accepted: true, duplicate: false } });
});

billingRoutes.use("/*", requireAuth);
billingRoutes.get("/subscription", async (c) => {
  const user = c.get("user");
  let [row] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.userId, user.id))
    .limit(1);
  if (!row) {
    try {
      row = await recoverSubscription(user);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "warn",
          event: "subscription_recovery_failed",
          userId: user.id,
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
      // Fall through — treat as no subscription rather than crashing the endpoint
    }
  }
  const entitlements = await entitlementsForUser(user.id);
  return c.json({
    data: {
      ...publicSubscription(row),
      access: entitlements.access,
      plan: entitlements.plan,
      limits: entitlements.limits,
      features: entitlements.features,
    },
  });
});
billingRoutes.get("/plans", (c) => {
  const variants = configuredPlans();
  return c.json({
    data: Object.entries(variants).map(([id, variant]) => ({ id, available: Boolean(variant) })),
  });
});
billingRoutes.post("/cancel", async (c) => {
  const user = c.get("user");
  const row = await requireSubscription(user.id);
  if (row.status === "cancelled" || row.status === "expired")
    return c.json({ data: { accepted: true, note: "already_inactive" } });
  await lemonRequest(`/subscriptions/${row.lemonSubscriptionId}`, { method: "DELETE" });
  return c.json({ data: { accepted: true } });
});

billingRoutes.post("/resume", async (c) => {
  const user = c.get("user");
  const row = await requireSubscription(user.id);
  if (row.status !== "cancelled")
    return c.json({ data: { accepted: true, note: "not_cancelled" } });
  await lemonRequest(`/subscriptions/${row.lemonSubscriptionId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "subscriptions",
        id: row.lemonSubscriptionId,
        attributes: { cancelled: false },
      },
    }),
  });
  return c.json({ data: { accepted: true } });
});

billingRoutes.post("/change-plan", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const selectedPlan = planId.parse(body.plan);
  const variantId = configuredPlans()[selectedPlan];
  if (!variantId)
    throw new ApiError(503, "PLAN_NOT_CONFIGURED", "This plan is not connected to a variant yet.");
  const row = await requireSubscription(user.id);
  await lemonRequest(`/subscriptions/${row.lemonSubscriptionId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "subscriptions",
        id: row.lemonSubscriptionId,
        attributes: { variant_id: Number(variantId) },
      },
    }),
  });
  return c.json({ data: { accepted: true } });
});

billingRoutes.post("/checkout", async (c) => {
  requireBillingConfig();
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const selectedPlan = planId.default("house").parse(body.plan);
  const variantId = configuredPlans()[selectedPlan];
  if (!variantId)
    throw new ApiError(
      503,
      "PLAN_NOT_CONFIGURED",
      "This plan is not connected to a Lemon Squeezy variant yet.",
    );
  const payload = await lemonRequest("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          product_options: {
            redirect_url: `${config.FRONTEND_ORIGIN}/account/billing?checkout=success`,
            enabled_variants: [Number(variantId)],
          },
          checkout_options: {
            embed: true,
            media: false,
            background_color: "#0b1320",
            headings_color: "#f1f4f8",
            primary_text_color: "#c7d0dd",
            button_color: "#6685c1",
          },
          checkout_data: {
            email: user.email,
            name: user.name,
            custom: { user_id: user.id, plan: selectedPlan },
          },
        },
        relationships: {
          store: { data: { type: "stores", id: config.LEMONSQUEEZY_STORE_ID } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
  });
  return c.json({ data: { url: payload.data.attributes.url } });
});
