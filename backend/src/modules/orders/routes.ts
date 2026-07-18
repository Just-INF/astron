import { and, asc, desc, eq, inArray, isNull, ne, notInArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/client";
import {
  auditLogs,
  diningTables,
  menuCategories,
  orderItems,
  orders,
  products,
  restaurantMemberships,
  restaurants,
  serviceRequests,
  taxCategories,
  users,
} from "../../db/schema";
import { requireAuth, requireMembership, type AppVariables } from "../../lib/auth";
import { ApiError } from "../../lib/errors";
import { createId, sha256 } from "../../lib/ids";
import { taxMinor } from "../menu/money";
import { deriveOrderStatus } from "./service";
import { sendServiceRequestNotification } from "../../lib/email";
import { requireRestaurantFeature } from "../../lib/entitlements";

const orderInput = z.object({
  tableId: z.string().min(1),
  notes: z.string().trim().max(2_000).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
        notes: z.string().trim().max(1_000).optional(),
      }),
    )
    .min(1)
    .max(100),
});
const requestInput = z
  .object({
    tableCode: z.string().min(8).max(200),
    guestSessionId: z.string().min(8).max(128),
    type: z.enum(["waiter_call", "check"]),
    paymentMethod: z.enum(["card", "cash"]).optional(),
    notes: z.string().trim().max(1_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "check" && !value.paymentMethod)
      ctx.addIssue({
        code: "custom",
        path: ["paymentMethod"],
        message: "Select card or cash.",
      });
    if (value.type === "waiter_call" && value.paymentMethod)
      ctx.addIssue({
        code: "custom",
        path: ["paymentMethod"],
        message: "Payment method is only valid for check requests.",
      });
  });

function databaseErrorCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code ?? candidate.cause?.code;
}

async function staffNames(restaurantId: string) {
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(restaurantMemberships)
    .innerJoin(users, eq(users.id, restaurantMemberships.userId))
    .where(eq(restaurantMemberships.restaurantId, restaurantId));
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function serializeOrders(
  restaurantId: string,
  options: { tableId?: string; history?: boolean } = {},
) {
  const filters = [eq(orders.restaurantId, restaurantId)];
  if (options.tableId) filters.push(eq(orders.tableId, options.tableId));
  filters.push(
    options.history
      ? inArray(orders.status, ["completed", "cancelled"])
      : notInArray(orders.status, ["completed", "cancelled"]),
  );
  const rows = await db
    .select({ order: orders, tableName: diningTables.name })
    .from(orders)
    .leftJoin(diningTables, eq(diningTables.id, orders.tableId))
    .where(and(...filters))
    .orderBy(desc(orders.createdAt))
    .limit(options.history ? 100 : 200);
  if (!rows.length) return [];
  const items = await db
    .select()
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        rows.map((row) => row.order.id),
      ),
    )
    .orderBy(asc(orderItems.createdAt));
  const names = await staffNames(restaurantId);
  return rows.map(({ order, tableName }) => ({
    ...order,
    tableName: tableName ?? "Unassigned",
    createdByName: order.createdBy ? (names.get(order.createdBy) ?? null) : null,
    completedByName: order.completedBy ? (names.get(order.completedBy) ?? null) : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    completedAt: order.completedAt?.toISOString() ?? null,
    closedAt: order.closedAt?.toISOString() ?? null,
    items: items
      .filter((item) => item.orderId === order.id)
      .map((item) => ({
        ...item,
        assignedChefName: item.assignedChefId ? (names.get(item.assignedChefId) ?? null) : null,
        claimedAt: item.claimedAt?.toISOString() ?? null,
        startedAt: item.startedAt?.toISOString() ?? null,
        completedAt: item.completedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
  }));
}

async function refreshOrderStatus(orderId: string) {
  const [order] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order || order.status === "completed" || order.status === "cancelled") return;
  const items = await db
    .select({ status: orderItems.status })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.preparationRelevant, true)));
  await db
    .update(orders)
    .set({
      status: deriveOrderStatus(items.map((item) => item.status)),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));
}

async function tableFromCode(restaurantId: string, tableCode: string) {
  const codeHash = await sha256(tableCode);
  const [table] = await db
    .select()
    .from(diningTables)
    .where(
      and(
        eq(diningTables.restaurantId, restaurantId),
        eq(diningTables.codeHash, codeHash),
        eq(diningTables.linked, true),
      ),
    )
    .limit(1);
  if (!table)
    throw new ApiError(404, "TABLE_SESSION_NOT_FOUND", "This table link is no longer active.");
  return table;
}

function serializeRequest(
  row: typeof serviceRequests.$inferSelect,
  tableName: string,
  names: Map<string, string>,
) {
  return {
    ...row,
    tableName,
    acknowledgedByName: row.acknowledgedBy ? (names.get(row.acknowledgedBy) ?? null) : null,
    completedByName: row.completedBy ? (names.get(row.completedBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export const orderRoutes = new Hono<{ Variables: AppVariables }>();
orderRoutes.use("/*", requireAuth);
orderRoutes.use("/*", async (c, next) => {
  await requireRestaurantFeature(c.req.param("restaurantId")!, "orders");
  await next();
});

orderRoutes.get("/orders", requireMembership("orders:read"), async (c) => {
  const query = z
    .object({
      tableId: z.string().optional(),
      view: z.enum(["active", "history"]).default("active"),
    })
    .parse(c.req.query());
  return c.json({
    data: await serializeOrders(c.req.param("restaurantId")!, {
      tableId: query.tableId,
      history: query.view === "history",
    }),
  });
});

orderRoutes.post("/orders", requireMembership("orders:write"), async (c) => {
  const key = c.req.header("Idempotency-Key");
  if (!key || key.length < 8 || key.length > 200)
    throw new ApiError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Provide an Idempotency-Key header between 8 and 200 characters.",
    );
  const input = orderInput.parse(await c.req.json());
  const restaurantId = c.req.param("restaurantId")!;
  const keyHash = await sha256(key);
  const [existing] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.restaurantId, restaurantId), eq(orders.idempotencyKeyHash, keyHash)))
    .limit(1);
  if (existing) return c.json({ data: { id: existing.id, duplicate: true } }, 200);
  const [table] = await db
    .select()
    .from(diningTables)
    .where(
      and(
        eq(diningTables.id, input.tableId),
        eq(diningTables.restaurantId, restaurantId),
        eq(diningTables.linked, true),
      ),
    )
    .limit(1);
  if (!table) throw new ApiError(404, "TABLE_NOT_FOUND", "Table not found.");
  const quantities = new Map<string, { quantity: number; notes?: string }>();
  for (const item of input.items) {
    const current = quantities.get(item.productId);
    quantities.set(item.productId, {
      quantity: (current?.quantity ?? 0) + item.quantity,
      notes: item.notes ?? current?.notes,
    });
  }
  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      priceMinor: products.priceMinor,
      currency: products.currency,
      categoryName: menuCategories.name,
      taxRateBasisPoints: taxCategories.rateBasisPoints,
    })
    .from(products)
    .innerJoin(menuCategories, eq(menuCategories.id, products.categoryId))
    .innerJoin(taxCategories, eq(taxCategories.id, products.taxCategoryId))
    .where(
      and(
        eq(products.restaurantId, restaurantId),
        eq(products.isAvailable, true),
        isNull(products.archivedAt),
        inArray(products.id, [...quantities.keys()]),
      ),
    );
  if (productRows.length !== quantities.size)
    throw new ApiError(
      422,
      "ORDER_PRODUCT_UNAVAILABLE",
      "One or more selected menu items are unavailable.",
    );
  let subtotalMinor = 0;
  let orderTaxMinor = 0;
  const itemValues = productRows.map((product) => {
    const selection = quantities.get(product.id)!;
    const lineSubtotal = product.priceMinor * selection.quantity;
    const lineTax = taxMinor(lineSubtotal, product.taxRateBasisPoints);
    subtotalMinor += lineSubtotal;
    orderTaxMinor += lineTax;
    return {
      id: createId("orditem"),
      productId: product.id,
      productName: product.name,
      categoryName: product.categoryName,
      notes: selection.notes,
      quantity: selection.quantity,
      unitPriceMinor: product.priceMinor,
      taxRateBasisPoints: product.taxRateBasisPoints,
      taxMinor: lineTax,
      totalMinor: lineSubtotal + lineTax,
    };
  });
  const orderId = createId("order");
  try {
    await db.transaction(async (tx) => {
      await tx.insert(orders).values({
        id: orderId,
        restaurantId,
        tableId: table.id,
        status: "new",
        currency: productRows[0]!.currency,
        subtotalMinor,
        taxMinor: orderTaxMinor,
        totalMinor: subtotalMinor + orderTaxMinor,
        notes: input.notes,
        idempotencyKeyHash: keyHash,
        createdBy: c.get("user").id,
      });
      await tx.insert(orderItems).values(itemValues.map((item) => ({ ...item, orderId })));
      await tx
        .update(diningTables)
        .set({ status: "occupied", updatedAt: new Date() })
        .where(eq(diningTables.id, table.id));
      await tx.insert(auditLogs).values({
        restaurantId,
        actorUserId: c.get("user").id,
        action: "order.created",
        entityType: "order",
        entityId: orderId,
        metadata: { tableId: table.id, itemCount: itemValues.length },
      });
    });
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      const [duplicate] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.idempotencyKeyHash, keyHash)))
        .limit(1);
      if (duplicate) return c.json({ data: { id: duplicate.id, duplicate: true } }, 200);
    }
    throw error;
  }
  return c.json({ data: { id: orderId, duplicate: false } }, 201);
});

orderRoutes.post("/orders/:orderId/complete", requireMembership("orders:complete"), async (c) => {
  const restaurantId = c.req.param("restaurantId")!;
  const orderId = c.req.param("orderId");
  const items = await db
    .select({ status: orderItems.status })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orderItems.orderId, orderId), eq(orders.restaurantId, restaurantId)));
  if (!items.length) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
  if (items.some((item) => item.status !== "done"))
    throw new ApiError(
      409,
      "ORDER_NOT_READY",
      "Every preparation item must be done before completing the order.",
    );
  const now = new Date();
  const [completed] = await db
    .update(orders)
    .set({
      status: "completed",
      completedBy: c.get("user").id,
      completedAt: now,
      closedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.restaurantId, restaurantId),
        ne(orders.status, "completed"),
        ne(orders.status, "cancelled"),
      ),
    )
    .returning({ tableId: orders.tableId });
  if (!completed) throw new ApiError(409, "ORDER_ALREADY_CLOSED", "Order is already closed.");
  if (completed.tableId) {
    const remaining = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, restaurantId),
          eq(orders.tableId, completed.tableId),
          notInArray(orders.status, ["completed", "cancelled"]),
        ),
      )
      .limit(1);
    if (!remaining.length)
      await db
        .update(diningTables)
        .set({ status: "available", updatedAt: now })
        .where(eq(diningTables.id, completed.tableId));
  }
  await db.insert(auditLogs).values({
    restaurantId,
    actorUserId: c.get("user").id,
    action: "order.completed",
    entityType: "order",
    entityId: orderId,
  });
  return c.json({ data: { id: orderId, status: "completed" } });
});

orderRoutes.get("/service-requests", requireMembership("service-requests:read"), async (c) => {
  const restaurantId = c.req.param("restaurantId")!;
  const query = z
    .object({ view: z.enum(["active", "history", "all"]).default("active") })
    .parse(c.req.query());
  const filters = [eq(serviceRequests.restaurantId, restaurantId)];
  if (query.view === "active") filters.push(ne(serviceRequests.status, "completed"));
  else if (query.view === "history") filters.push(eq(serviceRequests.status, "completed"));
  const rows = await db
    .select({ request: serviceRequests, tableName: diningTables.name })
    .from(serviceRequests)
    .innerJoin(diningTables, eq(diningTables.id, serviceRequests.tableId))
    .where(and(...filters))
    .orderBy(
      asc(serviceRequests.status),
      query.view === "history" ? desc(serviceRequests.completedAt) : asc(serviceRequests.createdAt),
    )
    .limit(200);
  const names = await staffNames(restaurantId);
  return c.json({
    data: rows.map((row) => serializeRequest(row.request, row.tableName, names)),
  });
});

orderRoutes.patch(
  "/service-requests/:requestId",
  requireMembership("service-requests:write"),
  async (c) => {
    const { status } = z
      .object({ status: z.enum(["acknowledged", "completed"]) })
      .parse(await c.req.json());
    const restaurantId = c.req.param("restaurantId")!;
    const requestId = c.req.param("requestId");
    const expected = status === "acknowledged" ? "new" : "acknowledged";
    if (status === "completed") {
      const [current] = await db
        .select({ acknowledgedBy: serviceRequests.acknowledgedBy })
        .from(serviceRequests)
        .where(
          and(eq(serviceRequests.id, requestId), eq(serviceRequests.restaurantId, restaurantId)),
        )
        .limit(1);
      const role = c.get("membership").role;
      if (
        current?.acknowledgedBy &&
        current.acknowledgedBy !== c.get("user").id &&
        !["owner", "manager"].includes(role)
      )
        throw new ApiError(
          403,
          "REQUEST_ASSIGNED_TO_ANOTHER_STAFF_MEMBER",
          "Only the staff member who acknowledged this request can complete it.",
        );
    }
    const now = new Date();
    const [updated] = await db
      .update(serviceRequests)
      .set(
        status === "acknowledged"
          ? {
              status,
              acknowledgedBy: c.get("user").id,
              acknowledgedAt: now,
              updatedAt: now,
            }
          : {
              status,
              activeKey: null,
              completedBy: c.get("user").id,
              completedAt: now,
              updatedAt: now,
            },
      )
      .where(
        and(
          eq(serviceRequests.id, requestId),
          eq(serviceRequests.restaurantId, restaurantId),
          eq(serviceRequests.status, expected),
        ),
      )
      .returning();
    if (!updated)
      throw new ApiError(
        409,
        "REQUEST_STATUS_CONFLICT",
        "This request was already handled by another staff member.",
      );
    await db.insert(auditLogs).values({
      restaurantId,
      actorUserId: c.get("user").id,
      action: `service_request.${status}`,
      entityType: "service_request",
      entityId: requestId,
    });
    const [requestWithTable] = await db
      .select({ tableName: diningTables.name, restaurantName: restaurants.name })
      .from(serviceRequests)
      .innerJoin(diningTables, eq(diningTables.id, serviceRequests.tableId))
      .innerJoin(restaurants, eq(restaurants.id, serviceRequests.restaurantId))
      .where(eq(serviceRequests.id, requestId))
      .limit(1);
    const recipients = await db
      .select({ email: users.email })
      .from(restaurantMemberships)
      .innerJoin(users, eq(users.id, restaurantMemberships.userId))
      .where(
        and(
          eq(restaurantMemberships.restaurantId, restaurantId),
          inArray(restaurantMemberships.role, ["owner", "manager", "host", "waiter"]),
        ),
      );
    for (const recipient of recipients)
      void sendServiceRequestNotification(recipient.email, {
        restaurantName: requestWithTable?.restaurantName ?? "Astron restaurant",
        tableName: requestWithTable?.tableName ?? "table",
        type: updated.type,
        status,
      }).catch((error) => console.error("Service request email failed", error));
    return c.json({ data: { id: requestId, status } });
  },
);

orderRoutes.get("/kitchen", requireMembership("kitchen:read"), async (c) => {
  const restaurantId = c.req.param("restaurantId")!;
  const query = z
    .object({
      status: z.enum(["not_taken", "preparing", "done", "all"]).default("all"),
      view: z.enum(["active", "history"]).default("active"),
    })
    .parse(c.req.query());
  const filters = [
    eq(orders.restaurantId, restaurantId),
    eq(orderItems.preparationRelevant, true),
    query.view === "history"
      ? eq(orders.status, "completed")
      : notInArray(orders.status, ["completed", "cancelled"]),
  ];
  if (query.view === "history") filters.push(eq(orderItems.status, "done"));
  else if (query.status !== "all") filters.push(eq(orderItems.status, query.status));
  const rows = await db
    .select({
      item: orderItems,
      orderCreatedAt: orders.createdAt,
      orderNotes: orders.notes,
      orderStatus: orders.status,
      tableName: diningTables.name,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .leftJoin(diningTables, eq(diningTables.id, orders.tableId))
    .where(and(...filters))
    .orderBy(asc(orderItems.status), asc(orders.createdAt))
    .limit(query.view === "history" ? 100 : 300);
  const names = await staffNames(restaurantId);
  return c.json({
    data: rows.map((row) => ({
      ...row.item,
      tableName: row.tableName ?? "Unassigned",
      orderCreatedAt: row.orderCreatedAt.toISOString(),
      orderNotes: row.orderNotes,
      orderStatus: row.orderStatus,
      assignedChefName: row.item.assignedChefId
        ? (names.get(row.item.assignedChefId) ?? null)
        : null,
      claimedAt: row.item.claimedAt?.toISOString() ?? null,
      startedAt: row.item.startedAt?.toISOString() ?? null,
      completedAt: row.item.completedAt?.toISOString() ?? null,
      createdAt: row.item.createdAt.toISOString(),
      updatedAt: row.item.updatedAt.toISOString(),
    })),
  });
});

orderRoutes.post("/kitchen/items/:itemId/claim", requireMembership("kitchen:write"), async (c) => {
  const restaurantId = c.req.param("restaurantId")!;
  const itemId = c.req.param("itemId");
  const [candidate] = await db
    .select({ orderId: orderItems.orderId })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orderItems.id, itemId), eq(orders.restaurantId, restaurantId)))
    .limit(1);
  if (!candidate) throw new ApiError(404, "ORDER_ITEM_NOT_FOUND", "Order item not found.");
  const now = new Date();
  const [claimed] = await db
    .update(orderItems)
    .set({
      status: "preparing",
      assignedChefId: c.get("user").id,
      claimedAt: now,
      startedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(orderItems.id, itemId),
        eq(orderItems.status, "not_taken"),
        isNull(orderItems.assignedChefId),
      ),
    )
    .returning();
  if (!claimed)
    throw new ApiError(409, "ITEM_ALREADY_CLAIMED", "Another chef already claimed this item.");
  await refreshOrderStatus(candidate.orderId);
  return c.json({ data: { id: itemId, status: "preparing" } });
});

orderRoutes.patch(
  "/kitchen/items/:itemId/status",
  requireMembership("kitchen:write"),
  async (c) => {
    const { status } = z.object({ status: z.literal("done") }).parse(await c.req.json());
    const restaurantId = c.req.param("restaurantId")!;
    const itemId = c.req.param("itemId");
    const membership = c.get("membership");
    const [item] = await db
      .select({
        orderId: orderItems.orderId,
        assignedChefId: orderItems.assignedChefId,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orderItems.id, itemId), eq(orders.restaurantId, restaurantId)))
      .limit(1);
    if (!item) throw new ApiError(404, "ORDER_ITEM_NOT_FOUND", "Order item not found.");
    if (membership.role === "chef" && item.assignedChefId !== c.get("user").id)
      throw new ApiError(
        403,
        "ITEM_ASSIGNED_TO_ANOTHER_CHEF",
        "Only the chef who claimed this item can complete it.",
      );
    const now = new Date();
    const [updated] = await db
      .update(orderItems)
      .set({ status, completedAt: now, updatedAt: now })
      .where(and(eq(orderItems.id, itemId), eq(orderItems.status, "preparing")))
      .returning();
    if (!updated)
      throw new ApiError(409, "ITEM_STATUS_CONFLICT", "The item is no longer in preparation.");
    await refreshOrderStatus(item.orderId);
    return c.json({ data: { id: itemId, status } });
  },
);

export const publicOrderRoutes = new Hono();
publicOrderRoutes.use("/*", async (c, next) => {
  await requireRestaurantFeature(c.req.param("restaurantId")!, "orders");
  await next();
});

publicOrderRoutes.get("/table-session", async (c) => {
  const query = z
    .object({
      tableCode: z.string().min(8).max(200),
      guestSessionId: z.string().min(8).max(128),
    })
    .parse(c.req.query());
  const restaurantId = c.req.param("restaurantId")!;
  const table = await tableFromCode(restaurantId, query.tableCode);
  const [restaurant] = await db
    .select({
      callWaiterEnabled: restaurants.callWaiterEnabled,
      requestCheckEnabled: restaurants.requestCheckEnabled,
    })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  const requests = await db
    .select()
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.restaurantId, restaurantId),
        eq(serviceRequests.tableId, table.id),
        eq(serviceRequests.guestSessionId, query.guestSessionId),
        ne(serviceRequests.status, "completed"),
      ),
    )
    .orderBy(desc(serviceRequests.createdAt));
  const activeOrders = await serializeOrders(restaurantId, { tableId: table.id });
  return c.json(
    {
      data: {
        table: { id: table.id, name: table.name, status: table.status },
        features: {
          callWaiter: restaurant?.callWaiterEnabled ?? false,
          requestCheck: restaurant?.requestCheckEnabled ?? false,
        },
        requests: requests.map((request) => ({
          id: request.id,
          type: request.type,
          status: request.status,
          paymentMethod: request.paymentMethod,
          createdAt: request.createdAt.toISOString(),
          acknowledgedAt: request.acknowledgedAt?.toISOString() ?? null,
        })),
        orders: activeOrders.map((order) => ({
          id: order.id,
          status: order.status,
          totalMinor: order.totalMinor,
          currency: order.currency,
          createdAt: order.createdAt,
          items: order.items.map((item) => ({
            id: item.id,
            productName: item.productName,
            quantity: item.quantity,
            status: item.status,
          })),
        })),
      },
    },
    200,
    { "Cache-Control": "no-store" },
  );
});

publicOrderRoutes.post("/table-requests", async (c) => {
  const input = requestInput.parse(await c.req.json());
  const restaurantId = c.req.param("restaurantId")!;
  const table = await tableFromCode(restaurantId, input.tableCode);
  const [restaurant] = await db
    .select({
      callWaiterEnabled: restaurants.callWaiterEnabled,
      requestCheckEnabled: restaurants.requestCheckEnabled,
    })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (
    (input.type === "waiter_call" && !restaurant?.callWaiterEnabled) ||
    (input.type === "check" && !restaurant?.requestCheckEnabled)
  )
    throw new ApiError(403, "TABLE_ACTION_DISABLED", "This table action is currently disabled.");
  const id = createId("request");
  try {
    const [created] = await db
      .insert(serviceRequests)
      .values({
        id,
        restaurantId,
        tableId: table.id,
        type: input.type,
        paymentMethod: input.type === "check" ? input.paymentMethod : null,
        notes: input.notes,
        guestSessionId: input.guestSessionId,
        activeKey: "active",
      })
      .returning();
    return c.json(
      {
        data: {
          id: created!.id,
          type: created!.type,
          status: created!.status,
          paymentMethod: created!.paymentMethod,
          createdAt: created!.createdAt.toISOString(),
          duplicate: false,
        },
      },
      201,
    );
  } catch (error) {
    if (databaseErrorCode(error) !== "23505") throw error;
    const [existing] = await db
      .select()
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.restaurantId, restaurantId),
          eq(serviceRequests.tableId, table.id),
          eq(serviceRequests.type, input.type),
          eq(serviceRequests.activeKey, "active"),
        ),
      )
      .limit(1);
    if (!existing) throw error;
    return c.json({
      data: {
        id: existing.id,
        type: existing.type,
        status: existing.status,
        paymentMethod: existing.paymentMethod,
        createdAt: existing.createdAt.toISOString(),
        duplicate: true,
      },
    });
  }
});
