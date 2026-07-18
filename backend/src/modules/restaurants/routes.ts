import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/client";
import {
  auditLogs,
  floorLayouts,
  floorPlanThemeDrafts,
  menuThemeDrafts,
  mediaAssets,
  products,
  reservationSettings,
  reservationThemeDrafts,
  restaurantInvitations,
  restaurantMemberships,
  restaurants,
  users,
} from "../../db/schema";
import { requireAuth, requireMembership, type AppVariables } from "../../lib/auth";
import { ApiError } from "../../lib/errors";
import { createId } from "../../lib/ids";
import {
  defaultFloorTheme,
  defaultMenuTheme,
  defaultReservationTheme,
  defaultWeeklyHours,
} from "../../lib/theme";
import { sendTeamInvitation } from "../../lib/email";
import { requireMemberCapacity, requireRestaurantCapacity } from "../../lib/entitlements";

const roleSchema = z.enum(["owner", "manager", "host", "waiter", "chef", "menu-editor", "viewer"]);
const paletteSchema = z.enum([
  "gold-dark",
  "emerald-light",
  "rose-terracotta",
  "monochrome-classic",
]);
const shapeSchema = z.enum(["intimate", "linear", "terrace"]);
const supportedCurrencies = new Set(
  Intl.supportedValuesOf("currency").map((currency) => currency.toUpperCase()),
);
const currencySchema = z
  .string()
  .trim()
  .transform((currency) => currency.toUpperCase())
  .refine((currency) => supportedCurrencies.has(currency), {
    message: "Must be a supported ISO 4217 currency",
  });
const timezoneSchema = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Must be a valid IANA timezone");
const onboardingInput = z.object({
  name: z.string().trim().min(2).max(160),
  cuisineType: z.string().trim().max(120).default(""),
  logoFilename: z.string().nullable().default(null),
  notes: z.string().trim().max(4_000).default(""),
  currency: currencySchema,
  timezone: timezoneSchema,
  theme: paletteSchema,
  tableCount: z.number().int().min(0).max(500).optional().default(0),
  layoutShape: shapeSchema,
  teamInvites: z.array(z.email()).max(50).default([]),
});

const restaurantPatch = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  cuisineType: z.string().trim().max(120).optional(),
  notes: z.string().max(4_000).optional(),
  currency: currencySchema.optional(),
  language: z.string().min(2).max(10).optional(),
  timezone: timezoneSchema.optional(),
  reservationsEnabled: z.boolean().optional(),
  callWaiterEnabled: z.boolean().optional(),
  requestCheckEnabled: z.boolean().optional(),
  logoUrl: z.string().url().nullable().optional(),
});

function publicRestaurant(row: typeof restaurants.$inferSelect, teamInvites: string[] = []) {
  return {
    ...row,
    teamInvites,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const restaurantRoutes = new Hono<{ Variables: AppVariables }>();
restaurantRoutes.use("/*", requireAuth);

restaurantRoutes.post("/", async (c) => {
  const input = onboardingInput.parse(await c.req.json());
  const user = c.get("user");
  await requireRestaurantCapacity(user.id);
  const restaurantId = createId("rest");
  await db.transaction(async (tx) => {
    await tx.insert(restaurants).values({
      id: restaurantId,
      ownerId: user.id,
      name: input.name,
      cuisineType: input.cuisineType,
      logoUrl: null,
      notes: input.notes,
      currency: input.currency,
      timezone: input.timezone,
      theme: input.theme,
      tableCount: 0,
      layoutShape: input.layoutShape,
    });
    await tx.insert(restaurantMemberships).values({ restaurantId, userId: user.id, role: "owner" });
    if (input.teamInvites.length)
      await tx.insert(restaurantInvitations).values(
        input.teamInvites.map((email) => ({
          id: createId("invite"),
          restaurantId,
          email: email.toLowerCase(),
          role: "viewer" as const,
          invitedBy: user.id,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        })),
      );
    await tx
      .insert(floorLayouts)
      .values({ restaurantId, walls: [], zones: [], updatedBy: user.id });
    await tx.insert(menuThemeDrafts).values({
      restaurantId,
      document: defaultMenuTheme(restaurantId),
      updatedBy: user.id,
    });
    await tx.insert(floorPlanThemeDrafts).values({
      restaurantId,
      document: defaultFloorTheme(restaurantId),
      updatedBy: user.id,
    });
    await tx.insert(reservationThemeDrafts).values({
      restaurantId,
      document: defaultReservationTheme(restaurantId),
      updatedBy: user.id,
    });
    await tx
      .insert(reservationSettings)
      .values({ restaurantId, weeklyHours: defaultWeeklyHours() });
    await tx.insert(auditLogs).values({
      restaurantId,
      actorUserId: user.id,
      action: "restaurant.created",
      entityType: "restaurant",
      entityId: restaurantId,
    });
  });
  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
  for (const email of input.teamInvites)
    void sendTeamInvitation(email, input.name, user.name).catch((error) =>
      console.error("Invitation email failed", error),
    );
  return c.json({ data: publicRestaurant(restaurant!, input.teamInvites) }, 201);
});

restaurantRoutes.get("/:restaurantId", requireMembership("restaurant:read"), async (c) => {
  const [restaurant] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, c.req.param("restaurantId")!))
    .limit(1);
  if (!restaurant) throw new ApiError(404, "RESTAURANT_NOT_FOUND", "Restaurant not found.");
  const invites = await db
    .select({ email: restaurantInvitations.email })
    .from(restaurantInvitations)
    .where(
      and(
        eq(restaurantInvitations.restaurantId, restaurant.id),
        eq(restaurantInvitations.status, "pending"),
      ),
    );
  return c.json({
    data: publicRestaurant(
      restaurant,
      invites.map((item) => item.email),
    ),
  });
});

restaurantRoutes.patch("/:restaurantId", requireMembership("restaurant:update"), async (c) => {
  const patch = restaurantPatch.parse(await c.req.json());
  if (patch.logoUrl) {
    const [ownedLogo] = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.restaurantId, c.req.param("restaurantId")!),
          eq(mediaAssets.publicUrl, patch.logoUrl),
          eq(mediaAssets.status, "ready"),
        ),
      )
      .limit(1);
    if (!ownedLogo)
      throw new ApiError(
        422,
        "INVALID_RESTAURANT_LOGO",
        "Choose an uploaded image owned by this restaurant.",
      );
  }
  const restaurantId = c.req.param("restaurantId")!;
  await db.transaction(async (tx) => {
    await tx
      .update(restaurants)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(restaurants.id, restaurantId));
    if (patch.currency)
      await tx
        .update(products)
        .set({ currency: patch.currency, updatedAt: new Date() })
        .where(eq(products.restaurantId, restaurantId));
  });
  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
  return c.json({ data: publicRestaurant(restaurant!) });
});

restaurantRoutes.get("/:restaurantId/members", requireMembership("members:read"), async (c) => {
  const rows = await db
    .select({
      userId: restaurantMemberships.userId,
      restaurantId: restaurantMemberships.restaurantId,
      role: restaurantMemberships.role,
      name: users.name,
      email: users.email,
      createdAt: restaurantMemberships.createdAt,
      updatedAt: restaurantMemberships.updatedAt,
    })
    .from(restaurantMemberships)
    .innerJoin(users, eq(users.id, restaurantMemberships.userId))
    .where(eq(restaurantMemberships.restaurantId, c.req.param("restaurantId")!));
  return c.json({ data: rows });
});

restaurantRoutes.post(
  "/:restaurantId/invitations",
  requireMembership("members:write"),
  async (c) => {
    const input = z
      .object({
        email: z.email().transform((v) => v.toLowerCase()),
        role: roleSchema.exclude(["owner"]).default("viewer"),
      })
      .parse(await c.req.json());
    const [capacityRestaurant] = await db
      .select({ ownerId: restaurants.ownerId })
      .from(restaurants)
      .where(eq(restaurants.id, c.req.param("restaurantId")!))
      .limit(1);
    if (!capacityRestaurant)
      throw new ApiError(404, "RESTAURANT_NOT_FOUND", "Restaurant not found.");
    await requireMemberCapacity(c.req.param("restaurantId")!, capacityRestaurant.ownerId);
    const id = createId("invite");
    await db.insert(restaurantInvitations).values({
      id,
      restaurantId: c.req.param("restaurantId")!,
      email: input.email,
      role: input.role,
      invitedBy: c.get("user").id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    });
    await db.insert(auditLogs).values({
      restaurantId: c.req.param("restaurantId")!,
      actorUserId: c.get("user").id,
      action: "invitation.created",
      entityType: "invitation",
      entityId: id,
      metadata: { role: input.role },
    });
    const [restaurant] = await db
      .select({ name: restaurants.name })
      .from(restaurants)
      .where(eq(restaurants.id, c.req.param("restaurantId")!))
      .limit(1);
    void sendTeamInvitation(
      input.email,
      restaurant?.name ?? "this restaurant",
      c.get("user").name,
    ).catch((error) => console.error("Invitation email failed", error));
    return c.json({ data: { id, ...input } }, 201);
  },
);

restaurantRoutes.delete(
  "/:restaurantId/invitations",
  requireMembership("members:write"),
  async (c) => {
    const email = z.email().parse(c.req.query("email"));
    const [invitation] = await db
      .update(restaurantInvitations)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(
        and(
          eq(restaurantInvitations.restaurantId, c.req.param("restaurantId")!),
          eq(restaurantInvitations.email, email.toLowerCase()),
          eq(restaurantInvitations.status, "pending"),
        ),
      )
      .returning({ id: restaurantInvitations.id });
    if (!invitation)
      throw new ApiError(404, "INVITATION_NOT_FOUND", "Pending invitation not found.");
    await db.insert(auditLogs).values({
      restaurantId: c.req.param("restaurantId")!,
      actorUserId: c.get("user").id,
      action: "invitation.revoked",
      entityType: "invitation",
      entityId: invitation.id,
    });
    return c.body(null, 204);
  },
);

restaurantRoutes.post(
  "/:restaurantId/transfer-ownership",
  requireMembership("members:write"),
  async (c) => {
    if (c.get("membership").role !== "owner")
      throw new ApiError(403, "OWNER_REQUIRED", "Only the owner can transfer ownership.");
    const { newOwnerId, password } = z
      .object({ newOwnerId: z.string().min(1), password: z.string().min(10).max(200) })
      .parse(await c.req.json());
    const restaurantId = c.req.param("restaurantId")!,
      currentOwnerId = c.get("user").id;
    if (newOwnerId === currentOwnerId)
      throw new ApiError(422, "ALREADY_OWNER", "Choose another member.");
    const [[owner], [target]] = await Promise.all([
      db.select().from(users).where(eq(users.id, currentOwnerId)).limit(1),
      db
        .select()
        .from(restaurantMemberships)
        .where(
          and(
            eq(restaurantMemberships.restaurantId, restaurantId),
            eq(restaurantMemberships.userId, newOwnerId),
          ),
        )
        .limit(1),
    ]);
    if (!owner || !(await Bun.password.verify(password, owner.passwordHash)))
      throw new ApiError(400, "PASSWORD_INCORRECT", "The password is incorrect.");
    if (!target)
      throw new ApiError(
        404,
        "MEMBER_NOT_FOUND",
        "The new owner must already be a restaurant member.",
      );
    await db.transaction(async (tx) => {
      await tx
        .update(restaurantMemberships)
        .set({ role: "manager", updatedAt: new Date() })
        .where(
          and(
            eq(restaurantMemberships.restaurantId, restaurantId),
            eq(restaurantMemberships.userId, currentOwnerId),
          ),
        );
      await tx
        .update(restaurantMemberships)
        .set({ role: "owner", updatedAt: new Date() })
        .where(
          and(
            eq(restaurantMemberships.restaurantId, restaurantId),
            eq(restaurantMemberships.userId, newOwnerId),
          ),
        );
      await tx
        .update(restaurants)
        .set({ ownerId: newOwnerId, updatedAt: new Date() })
        .where(eq(restaurants.id, restaurantId));
      await tx.insert(auditLogs).values({
        restaurantId,
        actorUserId: currentOwnerId,
        action: "restaurant.ownership_transferred",
        entityType: "restaurant",
        entityId: restaurantId,
        metadata: { newOwnerId },
      });
    });
    return c.json({ data: { restaurantId, ownerId: newOwnerId } });
  },
);

restaurantRoutes.delete("/:restaurantId", requireMembership("restaurant:update"), async (c) => {
  if (c.get("membership").role !== "owner")
    throw new ApiError(403, "OWNER_REQUIRED", "Only the owner can delete this restaurant.");
  const restaurantId = c.req.param("restaurantId")!;
  const [restaurant] = await db
    .select({ name: restaurants.name })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!restaurant) throw new ApiError(404, "RESTAURANT_NOT_FOUND", "Restaurant not found.");
  const input = z
    .object({ password: z.string().min(10).max(200), confirmation: z.string() })
    .parse(await c.req.json());
  if (input.confirmation !== restaurant.name)
    throw new ApiError(
      422,
      "CONFIRMATION_MISMATCH",
      "Type the restaurant name exactly to confirm deletion.",
    );
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, c.get("user").id))
    .limit(1);
  if (!user || !(await Bun.password.verify(input.password, user.passwordHash)))
    throw new ApiError(400, "PASSWORD_INCORRECT", "The password is incorrect.");
  await db.transaction(async (tx) => {
    await tx.insert(auditLogs).values({
      restaurantId,
      actorUserId: user.id,
      action: "restaurant.deleted",
      entityType: "restaurant",
      entityId: restaurantId,
    });
    await tx
      .delete(restaurants)
      .where(and(eq(restaurants.id, restaurantId), eq(restaurants.ownerId, user.id)));
  });
  return c.body(null, 204);
});

restaurantRoutes.delete(
  "/:restaurantId/invitations/:invitationId",
  requireMembership("members:write"),
  async (c) => {
    await db
      .update(restaurantInvitations)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(
        and(
          eq(restaurantInvitations.id, c.req.param("invitationId")),
          eq(restaurantInvitations.restaurantId, c.req.param("restaurantId")!),
        ),
      );
    await db.insert(auditLogs).values({
      restaurantId: c.req.param("restaurantId")!,
      actorUserId: c.get("user").id,
      action: "invitation.revoked",
      entityType: "invitation",
      entityId: c.req.param("invitationId"),
    });
    return c.body(null, 204);
  },
);

restaurantRoutes.patch(
  "/:restaurantId/members/:memberId",
  requireMembership("members:write"),
  async (c) => {
    const { role } = z.object({ role: roleSchema.exclude(["owner"]) }).parse(await c.req.json());
    await db
      .update(restaurantMemberships)
      .set({ role, updatedAt: new Date() })
      .where(
        and(
          eq(restaurantMemberships.restaurantId, c.req.param("restaurantId")!),
          eq(restaurantMemberships.userId, c.req.param("memberId")),
          inArray(restaurantMemberships.role, [
            "manager",
            "host",
            "waiter",
            "chef",
            "menu-editor",
            "viewer",
          ]),
        ),
      );
    await db.insert(auditLogs).values({
      restaurantId: c.req.param("restaurantId")!,
      actorUserId: c.get("user").id,
      action: "membership.role_changed",
      entityType: "membership",
      entityId: c.req.param("memberId"),
      metadata: { role },
    });
    return c.json({ data: { userId: c.req.param("memberId"), role } });
  },
);

restaurantRoutes.delete(
  "/:restaurantId/members/:memberId",
  requireMembership("members:write"),
  async (c) => {
    await db
      .delete(restaurantMemberships)
      .where(
        and(
          eq(restaurantMemberships.restaurantId, c.req.param("restaurantId")!),
          eq(restaurantMemberships.userId, c.req.param("memberId")),
          inArray(restaurantMemberships.role, [
            "manager",
            "host",
            "waiter",
            "chef",
            "menu-editor",
            "viewer",
          ]),
        ),
      );
    await db.insert(auditLogs).values({
      restaurantId: c.req.param("restaurantId")!,
      actorUserId: c.get("user").id,
      action: "membership.removed",
      entityType: "membership",
      entityId: c.req.param("memberId"),
    });
    return c.body(null, 204);
  },
);
