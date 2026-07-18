import { and, eq, inArray, max, notInArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/client";
import {
  auditLogs,
  diningTables,
  floorLayouts,
  floorPlanThemeDrafts,
  floorPlanThemeVersions,
} from "../../db/schema";
import { requireAuth, requireMembership, type AppVariables } from "../../lib/auth";
import { ApiError } from "../../lib/errors";
import { createId, randomToken, sha256 } from "../../lib/ids";
import { requireRestaurantFeature, requireTableCapacity } from "../../lib/entitlements";

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const tableSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(100),
  capacity: z.number().int().min(1).max(100),
  shape: z.enum(["circle", "square", "rectangle"]),
  position: point.extend({ z: z.number().finite().default(0) }),
  rotation: z.number().finite().default(0),
  status: z.enum(["available", "occupied", "reserved"]).default("available"),
  linked: z.boolean().default(true),
  width: z.number().positive().optional(),
  depth: z.number().positive().optional(),
});
const wallSchema = z.object({
  id: z.string(),
  nodes: z.array(point).min(2).max(500),
  segments: z.array(z.object({ curve: z.number().min(-1).max(1) })).max(500),
  thickness: z.number().positive().max(20),
  height: z.number().positive().max(100),
  closed: z.boolean().optional(),
});
const zoneSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  shape: z.enum(["rectangle", "polygon"]),
  points: z.array(point).min(2).max(500),
  segments: z.array(z.object({ curve: z.number().min(-1).max(1) })).optional(),
});
const layoutInput = z.object({
  expectedRevision: z.number().int().positive(),
  tables: z.array(tableSchema).max(1_000),
  walls: z.array(wallSchema).max(1_000),
  zones: z.array(zoneSchema).max(1_000),
});

function mapTable(row: typeof diningTables.$inferSelect) {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    name: row.name,
    capacity: row.capacity,
    shape: row.shape,
    position: row.position,
    rotation: row.rotation,
    status: row.status,
    code: row.codeDisplay,
    linked: row.linked,
    width: row.width ? row.width / 100 : undefined,
    depth: row.depth ? row.depth / 100 : undefined,
  };
}
function themeDocument(
  document: unknown,
  restaurantId: string,
  version: number,
  updatedAt: Date,
  isPublished: boolean,
) {
  return {
    ...(document as object),
    restaurantId,
    version,
    updatedAt: updatedAt.toISOString(),
    isPublished,
  };
}

export const layoutRoutes = new Hono<{ Variables: AppVariables }>();
layoutRoutes.use("/*", requireAuth);
layoutRoutes.use("/*", requireMembership("layout:read"));

layoutRoutes.get("/layout", async (c) => {
  const restaurantId = c.req.param("restaurantId")!;
  const [layout, tables] = await Promise.all([
    db.select().from(floorLayouts).where(eq(floorLayouts.restaurantId, restaurantId)).limit(1),
    db.select().from(diningTables).where(eq(diningTables.restaurantId, restaurantId)),
  ]);
  if (!layout[0]) throw new ApiError(404, "LAYOUT_NOT_FOUND", "Layout not found.");
  return c.json({
    data: {
      revision: layout[0].revision,
      tables: tables.map(mapTable),
      walls: layout[0].walls,
      zones: layout[0].zones,
      updatedAt: layout[0].updatedAt.toISOString(),
    },
  });
});

layoutRoutes.put("/layout", requireMembership("layout:write"), async (c) => {
  const restaurantId = c.req.param("restaurantId")!,
    input = layoutInput.parse(await c.req.json()),
    userId = c.get("user").id;
  const entitlements = await requireTableCapacity(restaurantId, input.tables.length);
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select restaurant_id from floor_layouts where restaurant_id = ${restaurantId} for update`,
    );
    const [current] = await tx
      .select()
      .from(floorLayouts)
      .where(eq(floorLayouts.restaurantId, restaurantId));
    if (!current) throw new ApiError(404, "LAYOUT_NOT_FOUND", "Layout not found.");
    if (current.revision !== input.expectedRevision)
      throw new ApiError(
        409,
        "REVISION_CONFLICT",
        "The layout changed in another session. Reload before saving.",
        { expectedRevision: [`Current revision is ${current.revision}.`] },
      );
    const hasFloorPlan = (entitlements.features as readonly string[]).includes("floorPlan");
    if (
      !hasFloorPlan &&
      (JSON.stringify(current.walls) !== JSON.stringify(input.walls) ||
        JSON.stringify(current.zones) !== JSON.stringify(input.zones))
    )
      throw new ApiError(
        402,
        "PLAN_UPGRADE_REQUIRED",
        "Advanced floor planning is available on The House and The Group plans.",
      );
    const existing = await tx
      .select()
      .from(diningTables)
      .where(eq(diningTables.restaurantId, restaurantId));
    const existingById = new Map(existing.map((table) => [table.id, table]));
    const saved = [] as Array<typeof diningTables.$inferInsert>;
    for (const table of input.tables) {
      const old = table.id ? existingById.get(table.id) : undefined;
      const rawCode = old?.codeDisplay ?? randomToken(18);
      saved.push({
        id: old?.id ?? createId("table"),
        restaurantId,
        name: table.name,
        capacity: table.capacity,
        shape: table.shape,
        position: table.position,
        rotation: Math.round(table.rotation),
        status: table.status,
        codeHash: old?.codeHash ?? (await sha256(rawCode)),
        codeDisplay: rawCode,
        linked: table.linked,
        width: table.width ? Math.round(table.width * 100) : null,
        depth: table.depth ? Math.round(table.depth * 100) : null,
      });
    }
    if (saved.length)
      await tx
        .insert(diningTables)
        .values(saved)
        .onConflictDoUpdate({
          target: diningTables.id,
          set: {
            name: sql`excluded.name`,
            capacity: sql`excluded.capacity`,
            shape: sql`excluded.shape`,
            position: sql`excluded.position`,
            rotation: sql`excluded.rotation`,
            status: sql`excluded.status`,
            linked: sql`excluded.linked`,
            width: sql`excluded.width`,
            depth: sql`excluded.depth`,
            updatedAt: new Date(),
          },
        });
    const savedIds = saved.map((table) => table.id!);
    if (savedIds.length) {
      try {
        await tx
          .delete(diningTables)
          .where(
            and(eq(diningTables.restaurantId, restaurantId), notInArray(diningTables.id, savedIds)),
          );
      } catch {
        throw new ApiError(
          409,
          "TABLE_HAS_HISTORY",
          "A table with reservation history cannot be removed. Unlink or archive it instead.",
        );
      }
    } else {
      try {
        await tx.delete(diningTables).where(eq(diningTables.restaurantId, restaurantId));
      } catch {
        throw new ApiError(
          409,
          "TABLE_HAS_HISTORY",
          "A table with reservation history cannot be removed.",
        );
      }
    }
    const [layout] = await tx
      .update(floorLayouts)
      .set({
        walls: input.walls.map((w) => ({ ...w, restaurantId })),
        zones: input.zones.map((z) => ({ ...z, restaurantId })),
        revision: current.revision + 1,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(floorLayouts.restaurantId, restaurantId))
      .returning();
    await tx.insert(auditLogs).values({
      restaurantId,
      actorUserId: userId,
      action: "layout.saved",
      entityType: "floor_layout",
      entityId: restaurantId,
      metadata: { revision: layout!.revision },
    });
    return {
      ...layout!,
      tables: saved.map((row) =>
        mapTable({
          ...row,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as typeof diningTables.$inferSelect),
      ),
    };
  });
  return c.json({
    data: {
      revision: result.revision,
      tables: result.tables,
      walls: result.walls,
      zones: result.zones,
      updatedAt: result.updatedAt.toISOString(),
    },
  });
});

layoutRoutes.post(
  "/tables/:tableId/regenerate-code",
  requireMembership("layout:write"),
  async (c) => {
    const raw = randomToken(18);
    const [row] = await db
      .update(diningTables)
      .set({
        codeDisplay: raw,
        codeHash: await sha256(raw),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(diningTables.id, c.req.param("tableId")),
          eq(diningTables.restaurantId, c.req.param("restaurantId")!),
        ),
      )
      .returning();
    if (!row) throw new ApiError(404, "TABLE_NOT_FOUND", "Table not found.");
    return c.json({ data: mapTable(row) });
  },
);

layoutRoutes.get("/floor-plan-theme/draft", async (c) => {
  const restaurantId = c.req.param("restaurantId")!;
  try {
    await requireRestaurantFeature(restaurantId, "floorPlan");
  } catch {
    return c.json({ data: null }, 200);
  }
  const [[row], [latestVersion]] = await Promise.all([
    db
      .select()
      .from(floorPlanThemeDrafts)
      .where(eq(floorPlanThemeDrafts.restaurantId, restaurantId))
      .limit(1),
    db
      .select()
      .from(floorPlanThemeVersions)
      .where(eq(floorPlanThemeVersions.restaurantId, restaurantId))
      .orderBy(sql`${floorPlanThemeVersions.version} desc`)
      .limit(1),
  ]);
  if (!row) throw new ApiError(404, "FLOOR_THEME_NOT_FOUND", "Floor-plan theme not found.");
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
layoutRoutes.patch("/floor-plan-theme/draft", requireMembership("layout:write"), async (c) => {
  await requireRestaurantFeature(c.req.param("restaurantId")!, "floorPlan");
  const input = z
    .object({
      patch: z.record(z.string(), z.unknown()),
      expectedRevision: z.number().int().positive().optional(),
    })
    .parse(await c.req.json());
  const [current] = await db
    .select()
    .from(floorPlanThemeDrafts)
    .where(eq(floorPlanThemeDrafts.restaurantId, c.req.param("restaurantId")!))
    .limit(1);
  if (!current) throw new ApiError(404, "FLOOR_THEME_NOT_FOUND", "Floor-plan theme not found.");
  if (input.expectedRevision && input.expectedRevision !== current.revision)
    throw new ApiError(
      409,
      "REVISION_CONFLICT",
      "The floor-plan theme changed in another session.",
    );
  const [row] = await db
    .update(floorPlanThemeDrafts)
    .set({
      document: { ...(current.document as object), ...input.patch },
      revision: current.revision + 1,
      updatedBy: c.get("user").id,
      updatedAt: new Date(),
    })
    .where(eq(floorPlanThemeDrafts.restaurantId, current.restaurantId))
    .returning();
  return c.json({
    data: themeDocument(row!.document, row!.restaurantId, row!.revision, row!.updatedAt, false),
    revision: row!.revision,
  });
});
layoutRoutes.post("/floor-plan-theme/publish", requireMembership("layout:publish"), async (c) => {
  const restaurantId = c.req.param("restaurantId")!,
    userId = c.get("user").id;
  await requireRestaurantFeature(restaurantId, "floorPlan");
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select restaurant_id from floor_plan_theme_drafts where restaurant_id = ${restaurantId} for update`,
    );
    const [draft] = await tx
      .select()
      .from(floorPlanThemeDrafts)
      .where(eq(floorPlanThemeDrafts.restaurantId, restaurantId));
    if (!draft) throw new ApiError(404, "FLOOR_THEME_NOT_FOUND", "Floor-plan theme not found.");
    const [{ value } = { value: null }] = await tx
      .select({ value: max(floorPlanThemeVersions.version) })
      .from(floorPlanThemeVersions)
      .where(eq(floorPlanThemeVersions.restaurantId, restaurantId));
    const version = (value ?? 0) + 1,
      id = createId("floorver"),
      now = new Date();
    await tx.insert(floorPlanThemeVersions).values({
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
      action: "floor_plan.theme_published",
      entityType: "floor_plan_theme_version",
      entityId: id,
      metadata: { version },
    });
    return { document: draft.document, version, now };
  });
  return c.json({
    data: themeDocument(result.document, restaurantId, result.version, result.now, true),
  });
});
