import { count, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  billingSubscriptions,
  diningTables,
  restaurantMemberships,
  restaurants,
} from "../db/schema";
import { config } from "./config";
import { ApiError } from "./errors";

export type PlanTier = "free" | "table" | "house" | "group";
export type PlanFeature =
  | "menu"
  | "reservations"
  | "floorPlan"
  | "orders"
  | "nora"
  | "analytics"
  | "multiRestaurant";

export const plans = {
  free: { restaurants: 0, membersPerRestaurant: 0, tablesPerRestaurant: 0, features: [] },
  table: {
    restaurants: 1,
    membersPerRestaurant: 3,
    tablesPerRestaurant: 20,
    features: ["menu", "reservations"],
  },
  house: {
    restaurants: 1,
    membersPerRestaurant: 50,
    tablesPerRestaurant: null,
    features: ["menu", "reservations", "floorPlan", "orders", "nora", "analytics"],
  },
  group: {
    restaurants: 5,
    membersPerRestaurant: 250,
    tablesPerRestaurant: null,
    features: [
      "menu",
      "reservations",
      "floorPlan",
      "orders",
      "nora",
      "analytics",
      "multiRestaurant",
    ],
  },
} as const satisfies Record<
  PlanTier,
  {
    restaurants: number;
    membersPerRestaurant: number;
    tablesPerRestaurant: number | null;
    features: readonly PlanFeature[];
  }
>;

export function hasPaidAccess(
  subscription: typeof billingSubscriptions.$inferSelect | undefined,
  now = new Date(),
) {
  if (!subscription) return false;
  if (inArrayValue(subscription.status, ["active", "on_trial", "past_due"])) return true;
  return (
    subscription.status === "cancelled" && Boolean(subscription.endsAt && subscription.endsAt > now)
  );
}

function inArrayValue<T>(value: T, values: readonly T[]) {
  return values.includes(value);
}

export function planForVariant(
  variantId: string | null | undefined,
  variants: { table?: string; house?: string; group?: string } = {
    table: config.LEMONSQUEEZY_TABLE_VARIANT_ID,
    house: config.LEMONSQUEEZY_VARIANT_ID,
    group: config.LEMONSQUEEZY_GROUP_VARIANT_ID,
  },
): Exclude<PlanTier, "free"> {
  if (variantId && variants.table && variantId === variants.table) return "table";
  if (variantId && variants.group && variantId === variants.group) return "group";
  // Existing subscriptions used the original variant before tiers existed. Preserve
  // their access as The House unless they match a more specific configured variant.
  return "house";
}

export async function entitlementsForUser(userId: string) {
  const [subscription] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.userId, userId))
    .limit(1);
  const paid = hasPaidAccess(subscription);
  const plan: PlanTier = paid ? planForVariant(subscription?.variantId) : "free";
  return {
    access: paid ? ("pro" as const) : ("free" as const),
    plan,
    limits: plans[plan],
    features: plans[plan].features,
    subscription,
  };
}

export async function requirePaidSubscription(userId: string) {
  const entitlements = await entitlementsForUser(userId);
  if (entitlements.access !== "pro")
    throw new ApiError(
      402,
      "SUBSCRIPTION_REQUIRED",
      "An active subscription is required to use restaurant workspaces. Open Billing to subscribe or restore access.",
    );
  return entitlements;
}

async function restaurantOwner(restaurantId: string) {
  const [restaurant] = await db
    .select({ ownerId: restaurants.ownerId })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!restaurant) throw new ApiError(404, "RESTAURANT_NOT_FOUND", "Restaurant not found.");
  return restaurant.ownerId;
}

export async function requireRestaurantSubscription(restaurantId: string) {
  return requirePaidSubscription(await restaurantOwner(restaurantId));
}

export async function requireRestaurantFeature(restaurantId: string, feature: PlanFeature) {
  const entitlements = await requireRestaurantSubscription(restaurantId);
  if (!(entitlements.features as readonly PlanFeature[]).includes(feature))
    throw new ApiError(
      402,
      "PLAN_UPGRADE_REQUIRED",
      `The ${entitlements.plan} plan does not include this feature. Upgrade in Billing to continue.`,
    );
  return entitlements;
}

export async function requireRestaurantCapacity(userId: string) {
  const [entitlements, [usage]] = await Promise.all([
    requirePaidSubscription(userId),
    db.select({ value: count() }).from(restaurants).where(eq(restaurants.ownerId, userId)),
  ]);
  if ((usage?.value ?? 0) >= entitlements.limits.restaurants)
    throw new ApiError(
      402,
      "RESTAURANT_LIMIT_REACHED",
      `Your ${entitlements.plan} plan allows ${entitlements.limits.restaurants} restaurant${entitlements.limits.restaurants === 1 ? "" : "s"}.`,
    );
}

export async function requireMemberCapacity(restaurantId: string, ownerId: string) {
  const [entitlements, [usage]] = await Promise.all([
    requirePaidSubscription(ownerId),
    db
      .select({ value: count() })
      .from(restaurantMemberships)
      .where(eq(restaurantMemberships.restaurantId, restaurantId)),
  ]);
  if ((usage?.value ?? 0) >= entitlements.limits.membersPerRestaurant)
    throw new ApiError(
      402,
      "MEMBER_LIMIT_REACHED",
      `Your ${entitlements.plan} plan allows ${entitlements.limits.membersPerRestaurant} team members per restaurant.`,
    );
}

export async function requireTableCapacity(restaurantId: string, requestedCount?: number) {
  const entitlements = await requireRestaurantSubscription(restaurantId);
  const limit = entitlements.limits.tablesPerRestaurant;
  if (limit === null) return entitlements;
  const countToCheck =
    requestedCount ??
    (
      await db
        .select({ value: count() })
        .from(diningTables)
        .where(eq(diningTables.restaurantId, restaurantId))
    )[0]?.value ??
    0;
  if (countToCheck > limit)
    throw new ApiError(
      402,
      "TABLE_LIMIT_REACHED",
      `Your ${entitlements.plan} plan allows up to ${limit} tables per restaurant.`,
    );
  return entitlements;
}
