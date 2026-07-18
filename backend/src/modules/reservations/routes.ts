import { and, asc, eq, gt, gte, inArray, lt, lte, max, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/client";
import {
  auditLogs,
  diningTables,
  floorLayouts,
  floorPlanThemeVersions,
  reservations,
  reservationSettings,
  reservationThemeDrafts,
  reservationThemeVersions,
  restaurants,
} from "../../db/schema";
import { requireAuth, requireMembership, type AppVariables } from "../../lib/auth";
import { ApiError } from "../../lib/errors";
import { createId, sha256 } from "../../lib/ids";
import { can } from "../../lib/permissions";
import { validateCustomCss } from "../../lib/theme";
import { assertWithinHours, type ReservationSettingsValue } from "./service";
import {
  sendReservationCancellation,
  sendReservationConfirmation,
  sendReservationRescheduled,
} from "../../lib/email";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const reservationInput = z.object({
  tableId: z.string().min(1),
  guestName: z.string().trim().min(1).max(160),
  partySize: z.number().int().min(1).max(100),
  date: dateSchema,
  startTime: timeSchema,
  email: z.email().max(320).optional(),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2_000).optional(),
  status: z.enum(["confirmed", "seated", "completed", "cancelled"]).optional(),
});
const rescheduleInput = z.object({
  tableId: z.string().min(1),
  date: dateSchema,
  startTime: timeSchema,
});
const settingsInput = z.object({
  maxStayMinutes: z.number().int().min(15).max(1_440),
  slotMinutes: z.number().int().min(5).max(240),
  is24_7: z.boolean(),
  weeklyHours: z.record(
    z.string(),
    z.object({
      open: timeSchema.or(z.literal("24:00")),
      close: timeSchema.or(z.literal("24:00")),
      closed: z.boolean(),
    }),
  ),
});

function mapSettings(row: typeof reservationSettings.$inferSelect) {
  return {
    restaurantId: row.restaurantId,
    maxStayMinutes: row.maxStayMinutes,
    slotMinutes: row.slotMinutes,
    is24_7: row.is24_7,
    weeklyHours: row.weeklyHours as ReservationSettingsValue["weeklyHours"],
  };
}
function mapStaffReservation(row: typeof reservations.$inferSelect) {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    tableId: row.tableId,
    guestName: row.guestName,
    partySize: row.partySize,
    date: row.serviceDate,
    startTime: row.localStartTime,
    endTime: row.localEndTime,
    status: row.status,
    email: row.guestEmail ?? undefined,
    phone: row.guestPhone ?? undefined,
    notes: row.notes ?? undefined,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
function themeDocument(
  document: unknown,
  restaurantId: string,
  version: number,
  updatedAt: Date,
  published: boolean,
) {
  return {
    ...(document as object),
    restaurantId,
    version,
    updatedAt: updatedAt.toISOString(),
    isPublished: published,
  };
}

async function createReservationAuthoritatively(
  restaurantId: string,
  input: z.infer<typeof reservationInput>,
  source: "guest" | "staff",
  idempotencyKey?: string,
) {
  const idempotencyKeyHash = idempotencyKey ? await sha256(idempotencyKey) : null;
  try {
    return await db.transaction(async (tx) => {
      if (idempotencyKeyHash) {
        const [existing] = await tx
          .select()
          .from(reservations)
          .where(
            and(
              eq(reservations.restaurantId, restaurantId),
              eq(reservations.idempotencyKeyHash, idempotencyKeyHash),
            ),
          )
          .limit(1);
        if (existing) return existing;
      }
      await tx.execute(
        sql`select id from dining_tables where id = ${input.tableId} and restaurant_id = ${restaurantId} for update`,
      );
      const [restaurant] = await tx
        .select({
          timezone: restaurants.timezone,
          reservationsEnabled: restaurants.reservationsEnabled,
        })
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);
      const [settingsRow] = await tx
        .select()
        .from(reservationSettings)
        .where(eq(reservationSettings.restaurantId, restaurantId))
        .limit(1);
      const [table] = await tx
        .select()
        .from(diningTables)
        .where(and(eq(diningTables.id, input.tableId), eq(diningTables.restaurantId, restaurantId)))
        .limit(1);
      if (!restaurant || !settingsRow || !table)
        throw new ApiError(
          404,
          "BOOKING_RESOURCE_NOT_FOUND",
          "Restaurant, booking settings, or table not found.",
        );
      if (!restaurant.reservationsEnabled)
        throw new ApiError(
          409,
          "RESERVATIONS_DISABLED",
          "Online reservations are currently disabled.",
        );
      if (table.status !== "available" || !table.linked)
        throw new ApiError(409, "TABLE_UNAVAILABLE", "That table is not available.");
      if (table.capacity < input.partySize)
        throw new ApiError(
          422,
          "TABLE_CAPACITY_EXCEEDED",
          "That table is too small for this party.",
        );
      const settings = mapSettings(settingsRow),
        interval = assertWithinHours(
          input.date,
          input.startTime,
          settings.maxStayMinutes,
          restaurant.timezone,
          settings,
        );
      const conflict = await tx
        .select({ id: reservations.id })
        .from(reservations)
        .where(
          and(
            eq(reservations.tableId, table.id),
            inArray(reservations.status, ["confirmed", "seated"]),
            lt(reservations.startAt, interval.endAt),
            gt(reservations.endAt, interval.startAt),
          ),
        )
        .limit(1);
      if (conflict.length)
        throw new ApiError(
          409,
          "RESERVATION_CONFLICT",
          "That table was just booked. Choose another table or time.",
        );
      const [created] = await tx
        .insert(reservations)
        .values({
          id: createId("res"),
          restaurantId,
          tableId: table.id,
          guestName: input.guestName,
          guestEmail: input.email,
          guestPhone: input.phone,
          partySize: input.partySize,
          serviceDate: input.date,
          localStartTime: input.startTime,
          localEndTime: interval.localEndTime,
          startAt: interval.startAt,
          endAt: interval.endAt,
          status: input.status ?? "confirmed",
          source,
          notes: input.notes,
          idempotencyKeyHash,
        })
        .returning();
      return created!;
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23P01")
      throw new ApiError(
        409,
        "RESERVATION_CONFLICT",
        "That table was just booked. Choose another table or time.",
      );
    if (code === "23505" && idempotencyKeyHash) {
      const [existing] = await db
        .select()
        .from(reservations)
        .where(
          and(
            eq(reservations.restaurantId, restaurantId),
            eq(reservations.idempotencyKeyHash, idempotencyKeyHash),
          ),
        )
        .limit(1);
      if (existing) return existing;
    }
    throw error;
  }
}

export const reservationRoutes = new Hono<{ Variables: AppVariables }>();
reservationRoutes.use("/*", requireAuth);
reservationRoutes.use("/*", requireMembership("reservations:read"));

reservationRoutes.get("/reservations", async (c) => {
  const query = z
    .object({
      from: dateSchema.optional(),
      to: dateSchema.optional(),
      status: z.enum(["confirmed", "seated", "completed", "cancelled"]).optional(),
    })
    .parse(c.req.query());
  const clauses = [eq(reservations.restaurantId, c.req.param("restaurantId")!)];
  if (query.from) clauses.push(gte(reservations.serviceDate, query.from));
  if (query.to) clauses.push(lte(reservations.serviceDate, query.to));
  if (query.status) clauses.push(eq(reservations.status, query.status));
  const rows = await db
    .select()
    .from(reservations)
    .where(and(...clauses))
    .orderBy(asc(reservations.startAt));
  return c.json({ data: rows.map(mapStaffReservation) }, 200, {
    "Cache-Control": "private, no-store",
  });
});
reservationRoutes.post("/reservations", requireMembership("reservations:write"), async (c) => {
  const row = await createReservationAuthoritatively(
    c.req.param("restaurantId")!,
    reservationInput.parse(await c.req.json()),
    "staff",
  );
  if (row.guestEmail) {
    const [restaurant] = await db
      .select({ name: restaurants.name })
      .from(restaurants)
      .where(eq(restaurants.id, row.restaurantId))
      .limit(1);
    void sendReservationConfirmation(row.guestEmail, {
      reservationId: row.id,
      restaurantName: restaurant?.name ?? "Astron restaurant",
      guestName: row.guestName,
      date: row.serviceDate,
      startTime: row.localStartTime,
      partySize: row.partySize,
      startAt: row.startAt,
    }).catch((error) => console.error("Reservation email failed", error));
  }
  return c.json({ data: mapStaffReservation(row) }, 201);
});
reservationRoutes.post(
  "/reservations/:reservationId/reschedule",
  requireMembership("reservations:write"),
  async (c) => {
    const restaurantId = c.req.param("restaurantId")!;
    const reservationId = c.req.param("reservationId");
    const input = rescheduleInput.parse(await c.req.json());
    const row = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from reservations where id = ${reservationId} and restaurant_id = ${restaurantId} for update`,
      );
      await tx.execute(
        sql`select id from dining_tables where id = ${input.tableId} and restaurant_id = ${restaurantId} for update`,
      );
      const [[current], [restaurant], [settingsRow], [table]] = await Promise.all([
        tx
          .select()
          .from(reservations)
          .where(
            and(eq(reservations.id, reservationId), eq(reservations.restaurantId, restaurantId)),
          )
          .limit(1),
        tx
          .select({ timezone: restaurants.timezone, name: restaurants.name })
          .from(restaurants)
          .where(eq(restaurants.id, restaurantId))
          .limit(1),
        tx
          .select()
          .from(reservationSettings)
          .where(eq(reservationSettings.restaurantId, restaurantId))
          .limit(1),
        tx
          .select()
          .from(diningTables)
          .where(
            and(eq(diningTables.id, input.tableId), eq(diningTables.restaurantId, restaurantId)),
          )
          .limit(1),
      ]);
      if (!current) throw new ApiError(404, "RESERVATION_NOT_FOUND", "Reservation not found.");
      if (!restaurant || !settingsRow || !table)
        throw new ApiError(
          404,
          "BOOKING_RESOURCE_NOT_FOUND",
          "Restaurant, booking settings, or table not found.",
        );
      if (["cancelled", "completed"].includes(current.status))
        throw new ApiError(
          409,
          "RESERVATION_NOT_RESCHEDULABLE",
          "Cancelled or completed reservations cannot be rescheduled.",
        );
      if (table.status !== "available" || !table.linked)
        throw new ApiError(409, "TABLE_UNAVAILABLE", "That table is not available.");
      if (table.capacity < current.partySize)
        throw new ApiError(
          422,
          "TABLE_CAPACITY_EXCEEDED",
          "That table is too small for this party.",
        );
      const interval = assertWithinHours(
        input.date,
        input.startTime,
        settingsRow.maxStayMinutes,
        restaurant.timezone,
        mapSettings(settingsRow),
      );
      const conflict = await tx
        .select({ id: reservations.id })
        .from(reservations)
        .where(
          and(
            eq(reservations.tableId, table.id),
            ne(reservations.id, current.id),
            inArray(reservations.status, ["confirmed", "seated"]),
            lt(reservations.startAt, interval.endAt),
            gt(reservations.endAt, interval.startAt),
          ),
        )
        .limit(1);
      if (conflict.length)
        throw new ApiError(
          409,
          "RESERVATION_CONFLICT",
          "That table was just booked. Choose another table or time.",
        );
      const [updated] = await tx
        .update(reservations)
        .set({
          tableId: table.id,
          serviceDate: input.date,
          localStartTime: input.startTime,
          localEndTime: interval.localEndTime,
          startAt: interval.startAt,
          endAt: interval.endAt,
          updatedAt: new Date(),
        })
        .where(eq(reservations.id, current.id))
        .returning();
      await tx.insert(auditLogs).values({
        restaurantId,
        actorUserId: c.get("user").id,
        action: "reservation.rescheduled",
        entityType: "reservation",
        entityId: current.id,
        metadata: {
          from: {
            tableId: current.tableId,
            date: current.serviceDate,
            startTime: current.localStartTime,
          },
          to: input,
        },
      });
      return { reservation: updated!, restaurantName: restaurant.name };
    });
    if (row.reservation.guestEmail)
      await sendReservationRescheduled(row.reservation.guestEmail, {
        reservationId: row.reservation.id,
        restaurantName: row.restaurantName,
        guestName: row.reservation.guestName,
        date: row.reservation.serviceDate,
        startTime: row.reservation.localStartTime,
        partySize: row.reservation.partySize,
        startAt: row.reservation.startAt,
      });
    return c.json({ data: mapStaffReservation(row.reservation) });
  },
);
reservationRoutes.patch(
  "/reservations/:reservationId",
  requireMembership("reservations:write"),
  async (c) => {
    const patch = reservationInput
      .partial()
      .omit({ tableId: true, date: true, startTime: true })
      .parse(await c.req.json());
    const mapped = {
      ...(patch.guestName !== undefined ? { guestName: patch.guestName } : {}),
      ...(patch.partySize !== undefined ? { partySize: patch.partySize } : {}),
      ...(patch.email !== undefined ? { guestEmail: patch.email } : {}),
      ...(patch.phone !== undefined ? { guestPhone: patch.phone } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: new Date(),
    };
    const [row] = await db
      .update(reservations)
      .set(mapped)
      .where(
        and(
          eq(reservations.id, c.req.param("reservationId")),
          eq(reservations.restaurantId, c.req.param("restaurantId")!),
        ),
      )
      .returning();
    if (!row) throw new ApiError(404, "RESERVATION_NOT_FOUND", "Reservation not found.");
    return c.json({ data: mapStaffReservation(row) });
  },
);
reservationRoutes.post(
  "/reservations/:reservationId/cancel",
  requireMembership("reservations:write"),
  async (c) => {
    const [row] = await db
      .update(reservations)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy: c.get("user").id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(reservations.id, c.req.param("reservationId")),
          eq(reservations.restaurantId, c.req.param("restaurantId")!),
        ),
      )
      .returning();
    if (!row) throw new ApiError(404, "RESERVATION_NOT_FOUND", "Reservation not found.");
    await db.insert(auditLogs).values({
      restaurantId: row.restaurantId,
      actorUserId: c.get("user").id,
      action: "reservation.cancelled",
      entityType: "reservation",
      entityId: row.id,
    });
    if (row.guestEmail) {
      const [restaurant] = await db
        .select({ name: restaurants.name })
        .from(restaurants)
        .where(eq(restaurants.id, row.restaurantId))
        .limit(1);
      void sendReservationCancellation(row.guestEmail, {
        reservationId: row.id,
        restaurantName: restaurant?.name ?? "Astron restaurant",
        guestName: row.guestName,
        date: row.serviceDate,
        startTime: row.localStartTime,
        partySize: row.partySize,
      }).catch((error) => console.error("Reservation cancellation email failed", error));
    }
    return c.json({ data: mapStaffReservation(row) });
  },
);
reservationRoutes.delete(
  "/reservations/:reservationId",
  requireMembership("reservations:delete"),
  async (c) => {
    const [row] = await db
      .delete(reservations)
      .where(
        and(
          eq(reservations.id, c.req.param("reservationId")),
          eq(reservations.restaurantId, c.req.param("restaurantId")!),
        ),
      )
      .returning({ id: reservations.id });
    if (!row) throw new ApiError(404, "RESERVATION_NOT_FOUND", "Reservation not found.");
    await db.insert(auditLogs).values({
      restaurantId: c.req.param("restaurantId")!,
      actorUserId: c.get("user").id,
      action: "reservation.deleted",
      entityType: "reservation",
      entityId: row.id,
    });
    return c.body(null, 204);
  },
);

reservationRoutes.get("/reservation-settings", async (c) => {
  const [row] = await db
    .select()
    .from(reservationSettings)
    .where(eq(reservationSettings.restaurantId, c.req.param("restaurantId")!))
    .limit(1);
  if (!row)
    throw new ApiError(404, "RESERVATION_SETTINGS_NOT_FOUND", "Reservation settings not found.");
  return c.json({ data: mapSettings(row) });
});
reservationRoutes.patch(
  "/reservation-settings",
  requireMembership("reservations:write"),
  async (c) => {
    const input = settingsInput.partial().parse(await c.req.json());
    const [row] = await db
      .update(reservationSettings)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(reservationSettings.restaurantId, c.req.param("restaurantId")!))
      .returning();
    if (!row)
      throw new ApiError(404, "RESERVATION_SETTINGS_NOT_FOUND", "Reservation settings not found.");
    return c.json({ data: mapSettings(row) });
  },
);

reservationRoutes.get("/reservation-theme/draft", async (c) => {
  const restaurantId = c.req.param("restaurantId")!;
  const [[row], [latestVersion]] = await Promise.all([
    db
      .select()
      .from(reservationThemeDrafts)
      .where(eq(reservationThemeDrafts.restaurantId, restaurantId))
      .limit(1),
    db
      .select()
      .from(reservationThemeVersions)
      .where(eq(reservationThemeVersions.restaurantId, restaurantId))
      .orderBy(sql`${reservationThemeVersions.version} desc`)
      .limit(1),
  ]);
  if (!row) throw new ApiError(404, "RESERVATION_THEME_NOT_FOUND", "Reservation theme not found.");
  return c.json(
    {
      data: themeDocument(
        row.document,
        row.restaurantId,
        latestVersion?.version ?? 0,
        latestVersion?.publishedAt ?? row.updatedAt,
        Boolean(latestVersion),
      ),
      revision: row.revision,
    },
    200,
    { "Cache-Control": "private, no-store" },
  );
});
reservationRoutes.patch(
  "/reservation-theme/draft",
  requireMembership("reservations:write"),
  async (c) => {
    const input = z
      .object({
        patch: z.record(z.string(), z.unknown()),
        expectedRevision: z.number().int().positive().optional(),
      })
      .parse(await c.req.json());
    validateCustomCss(input.patch, can(c.get("membership").role, "theme:custom-css"));
    const [current] = await db
      .select()
      .from(reservationThemeDrafts)
      .where(eq(reservationThemeDrafts.restaurantId, c.req.param("restaurantId")!))
      .limit(1);
    if (!current)
      throw new ApiError(404, "RESERVATION_THEME_NOT_FOUND", "Reservation theme not found.");
    if (input.expectedRevision && current.revision !== input.expectedRevision)
      throw new ApiError(
        409,
        "REVISION_CONFLICT",
        "The reservation theme changed in another session.",
      );
    const [row] = await db
      .update(reservationThemeDrafts)
      .set({
        document: { ...(current.document as object), ...input.patch },
        revision: current.revision + 1,
        updatedBy: c.get("user").id,
        updatedAt: new Date(),
      })
      .where(eq(reservationThemeDrafts.restaurantId, current.restaurantId))
      .returning();
    return c.json({
      data: themeDocument(row!.document, row!.restaurantId, row!.revision, row!.updatedAt, false),
      revision: row!.revision,
    });
  },
);
reservationRoutes.post(
  "/reservation-theme/publish",
  requireMembership("reservations:publish"),
  async (c) => {
    const restaurantId = c.req.param("restaurantId")!,
      userId = c.get("user").id;
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select restaurant_id from reservation_theme_drafts where restaurant_id = ${restaurantId} for update`,
      );
      const [draft] = await tx
        .select()
        .from(reservationThemeDrafts)
        .where(eq(reservationThemeDrafts.restaurantId, restaurantId));
      if (!draft)
        throw new ApiError(404, "RESERVATION_THEME_NOT_FOUND", "Reservation theme not found.");
      const [{ value } = { value: null }] = await tx
        .select({ value: max(reservationThemeVersions.version) })
        .from(reservationThemeVersions)
        .where(eq(reservationThemeVersions.restaurantId, restaurantId));
      const version = (value ?? 0) + 1,
        id = createId("resver"),
        now = new Date();
      await tx.insert(reservationThemeVersions).values({
        id,
        restaurantId,
        version,
        document: draft.document,
        publishedBy: userId,
        publishedAt: now,
      });
      await tx.insert(auditLogs).values({
        restaurantId,
        actorUserId: userId,
        action: "reservation.theme_published",
        entityType: "reservation_theme_version",
        entityId: id,
        metadata: { version },
      });
      return { document: draft.document, version, now };
    });
    return c.json({
      data: themeDocument(result.document, restaurantId, result.version, result.now, true),
    });
  },
);

export const publicReservationRoutes = new Hono();
publicReservationRoutes.get("/booking-config", async (c) => {
  const restaurantId = c.req.param("restaurantId")!;
  const tableCode = c.req.query("tableCode");
  const [restaurant, settings, resTheme, floorTheme, layout, tables] = await Promise.all([
    db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        logoUrl: restaurants.logoUrl,
        cuisineType: restaurants.cuisineType,
        timezone: restaurants.timezone,
        currency: restaurants.currency,
        language: restaurants.language,
        reservationsEnabled: restaurants.reservationsEnabled,
      })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1),
    db
      .select()
      .from(reservationSettings)
      .where(eq(reservationSettings.restaurantId, restaurantId))
      .limit(1),
    db
      .select()
      .from(reservationThemeVersions)
      .where(eq(reservationThemeVersions.restaurantId, restaurantId))
      .orderBy(sql`${reservationThemeVersions.version} desc`)
      .limit(1),
    db
      .select()
      .from(floorPlanThemeVersions)
      .where(eq(floorPlanThemeVersions.restaurantId, restaurantId))
      .orderBy(sql`${floorPlanThemeVersions.version} desc`)
      .limit(1),
    db.select().from(floorLayouts).where(eq(floorLayouts.restaurantId, restaurantId)).limit(1),
    db
      .select({
        id: diningTables.id,
        name: diningTables.name,
        capacity: diningTables.capacity,
        shape: diningTables.shape,
        position: diningTables.position,
        rotation: diningTables.rotation,
        width: diningTables.width,
        depth: diningTables.depth,
        status: diningTables.status,
      })
      .from(diningTables)
      .where(and(eq(diningTables.restaurantId, restaurantId), eq(diningTables.linked, true))),
  ]);
  if (!restaurant[0] || !settings[0] || !resTheme[0])
    throw new ApiError(404, "BOOKING_NOT_PUBLISHED", "Online booking is not published.");
  const rv = resTheme[0],
    fv = floorTheme[0];
  const preselectedTable = tableCode
    ? await db
        .select({ id: diningTables.id })
        .from(diningTables)
        .where(
          and(
            eq(diningTables.restaurantId, restaurantId),
            eq(diningTables.codeHash, await sha256(tableCode)),
            eq(diningTables.linked, true),
          ),
        )
        .limit(1)
    : [];
  return c.json(
    {
      data: {
        restaurant: restaurant[0],
        settings: mapSettings(settings[0]),
        theme: themeDocument(rv.document, restaurantId, rv.version, rv.publishedAt, true),
        floorPlanTheme: fv
          ? themeDocument(fv.document, restaurantId, fv.version, fv.publishedAt, true)
          : null,
        layout: {
          tables: tables.map((table) => ({
            ...table,
            restaurantId,
            linked: true,
          })),
          walls: layout[0]?.walls ?? [],
          zones: layout[0]?.zones ?? [],
        },
        preselectedTableId: preselectedTable[0]?.id ?? null,
      },
    },
    200,
    {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      ETag: `\"booking-${restaurantId}-${rv.version}-${fv?.version ?? 0}\"`,
    },
  );
});
publicReservationRoutes.get("/availability", async (c) => {
  const query = z
    .object({
      date: dateSchema,
      time: timeSchema,
      partySize: z.coerce.number().int().min(1).max(100),
    })
    .parse(c.req.query());
  const restaurantId = c.req.param("restaurantId")!;
  const [restaurant] = await db
      .select({
        timezone: restaurants.timezone,
        reservationsEnabled: restaurants.reservationsEnabled,
      })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1),
    [settingsRow] = await db
      .select()
      .from(reservationSettings)
      .where(eq(reservationSettings.restaurantId, restaurantId))
      .limit(1);
  if (!restaurant || !settingsRow || !restaurant.reservationsEnabled)
    throw new ApiError(404, "BOOKING_UNAVAILABLE", "Online booking is unavailable.");
  const settings = mapSettings(settingsRow),
    interval = assertWithinHours(
      query.date,
      query.time,
      settings.maxStayMinutes,
      restaurant.timezone,
      settings,
    );
  const rows = await db
    .select({
      id: diningTables.id,
      name: diningTables.name,
      capacity: diningTables.capacity,
    })
    .from(diningTables)
    .where(
      and(
        eq(diningTables.restaurantId, restaurantId),
        eq(diningTables.status, "available"),
        eq(diningTables.linked, true),
        gte(diningTables.capacity, query.partySize),
        sql`not exists (select 1 from reservations r where r.table_id = ${diningTables.id} and r.status in ('confirmed','seated') and r.start_at < ${interval.endAt.toISOString()}::timestamptz and r.end_at > ${interval.startAt.toISOString()}::timestamptz)`,
      ),
    );
  return c.json(
    {
      data: {
        date: query.date,
        time: query.time,
        durationMinutes: settings.maxStayMinutes,
        availableTables: rows,
      },
    },
    200,
    { "Cache-Control": "no-store" },
  );
});
publicReservationRoutes.post("/reservations", async (c) => {
  const key = c.req.header("Idempotency-Key");
  if (!key || key.length < 8 || key.length > 200)
    throw new ApiError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Provide an Idempotency-Key header between 8 and 200 characters.",
    );
  const row = await createReservationAuthoritatively(
    c.req.param("restaurantId")!,
    reservationInput.omit({ status: true }).parse(await c.req.json()),
    "guest",
    key,
  );
  if (row.guestEmail) {
    const [restaurant] = await db
      .select({ name: restaurants.name })
      .from(restaurants)
      .where(eq(restaurants.id, row.restaurantId))
      .limit(1);
    void sendReservationConfirmation(row.guestEmail, {
      reservationId: row.id,
      restaurantName: restaurant?.name ?? "Astron restaurant",
      guestName: row.guestName,
      date: row.serviceDate,
      startTime: row.localStartTime,
      partySize: row.partySize,
      startAt: row.startAt,
    }).catch((error) => console.error("Reservation email failed", error));
  }
  return c.json(
    {
      data: {
        id: row.id,
        restaurantId: row.restaurantId,
        tableId: row.tableId,
        guestName: row.guestName,
        partySize: row.partySize,
        date: row.serviceDate,
        startTime: row.localStartTime,
        endTime: row.localEndTime,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      },
    },
    201,
    { "Cache-Control": "no-store" },
  );
});
