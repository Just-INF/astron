import { afterAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { app } from "../../app";
import { db } from "../../db/client";
import { restaurantMemberships, restaurants, users } from "../../db/schema";

const run = Boolean(process.env.RUN_ORDER_DB_TESTS);
const origin = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
const createdUserIds: string[] = [];
let createdRestaurantId = "";

async function request(path: string, init: RequestInit = {}, cookie?: string) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Origin", origin);
  if (cookie) headers.set("Cookie", cookie);
  return app.request(path, { ...init, headers });
}

async function register(label: string) {
  const email = `${label.toLowerCase().replaceAll(" ", "-")}-${suffix}@example.com`;
  const response = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: label,
      email,
      password: "production-passphrase",
    }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { data: { userId: string } };
  createdUserIds.push(body.data.userId);
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, body.data.userId));
  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "production-passphrase" }),
  });
  return {
    id: body.data.userId,
    cookie: login.headers.get("set-cookie")!.split(";")[0]!,
  };
}

describe.skipIf(!run)("production order and service workflows", () => {
  afterAll(async () => {
    if (createdRestaurantId)
      await db.delete(restaurants).where(eq(restaurants.id, createdRestaurantId));
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  test("waiter order, request lifecycle, payment method, authorization, and atomic chef claim", async () => {
    const owner = await register("Order Owner");
    const waiter = await register("Order Waiter");
    const chefA = await register("Chef Alpha");
    const chefB = await register("Chef Beta");
    const viewer = await register("Order Viewer");

    const onboard = await request(
      "/api/restaurants",
      {
        method: "POST",
        body: JSON.stringify({
          name: `Order Test ${suffix}`,
          cuisineType: "Integration",
          logoFilename: null,
          notes: "",
          currency: "EUR",
          timezone: "Europe/Bucharest",
          theme: "gold-dark",
          tableCount: 0,
          layoutShape: "intimate",
          teamInvites: [],
        }),
      },
      owner.cookie,
    );
    expect(onboard.status).toBe(201);
    createdRestaurantId = ((await onboard.json()) as { data: { id: string } }).data.id;
    expect(
      (
        await request(
          `/api/restaurants/${createdRestaurantId}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              callWaiterEnabled: true,
              requestCheckEnabled: true,
              currency: "USD",
            }),
          },
          owner.cookie,
        )
      ).status,
    ).toBe(200);
    await db.insert(restaurantMemberships).values([
      { restaurantId: createdRestaurantId, userId: waiter.id, role: "waiter" },
      { restaurantId: createdRestaurantId, userId: chefA.id, role: "chef" },
      { restaurantId: createdRestaurantId, userId: chefB.id, role: "chef" },
      { restaurantId: createdRestaurantId, userId: viewer.id, role: "viewer" },
    ]);

    const savedLayout = await request(
      `/api/restaurants/${createdRestaurantId}/layout`,
      {
        method: "PUT",
        body: JSON.stringify({
          expectedRevision: 1,
          tables: [
            {
              name: "T1",
              capacity: 4,
              shape: "square",
              position: { x: 0, y: 0, z: 0 },
              rotation: 0,
              status: "occupied",
              linked: true,
            },
          ],
          walls: [],
          zones: [],
        }),
      },
      owner.cookie,
    );
    expect(savedLayout.status).toBe(200);
    const table = (
      (await savedLayout.json()) as { data: { tables: Array<{ id: string; code: string }> } }
    ).data.tables[0]!;

    const tax = await request(
      `/api/restaurants/${createdRestaurantId}/menu/tax-categories`,
      { method: "POST", body: JSON.stringify({ name: "VAT", ratePercentage: 19 }) },
      owner.cookie,
    );
    const taxId = ((await tax.json()) as { data: { id: string } }).data.id;
    const category = await request(
      `/api/restaurants/${createdRestaurantId}/menu/categories`,
      { method: "POST", body: JSON.stringify({ name: "Kitchen" }) },
      owner.cookie,
    );
    const categoryId = ((await category.json()) as { data: { id: string } }).data.id;
    const product = await request(
      `/api/restaurants/${createdRestaurantId}/menu/products`,
      {
        method: "POST",
        body: JSON.stringify({
          categoryId,
          taxCategoryId: taxId,
          name: "Test dish",
          description: "",
          priceBeforeTax: 12,
          images: [],
          dietaryTags: [],
          isAvailable: true,
        }),
      },
      owner.cookie,
    );
    const productId = ((await product.json()) as { data: { id: string } }).data.id;

    const createOrder = await request(
      `/api/restaurants/${createdRestaurantId}/orders`,
      {
        method: "POST",
        headers: { "Idempotency-Key": `order-${suffix}` },
        body: JSON.stringify({
          tableId: table.id,
          notes: "No rush",
          items: [{ productId, quantity: 2, notes: "One well done" }],
        }),
      },
      waiter.cookie,
    );
    expect(createOrder.status).toBe(201);
    const createdOrder = (await createOrder.json()) as { data: { id: string } };
    const orderId = createdOrder.data.id;
    const duplicateOrder = await request(
      `/api/restaurants/${createdRestaurantId}/orders`,
      {
        method: "POST",
        headers: { "Idempotency-Key": `order-${suffix}` },
        body: JSON.stringify({ tableId: table.id, items: [{ productId, quantity: 2 }] }),
      },
      waiter.cookie,
    );
    expect(duplicateOrder.status).toBe(200);

    const call = await request(`/api/public/restaurants/${createdRestaurantId}/table-requests`, {
      method: "POST",
      body: JSON.stringify({
        tableCode: table.code,
        guestSessionId: `guest-${suffix}`,
        type: "waiter_call",
        notes: "Water please",
      }),
    });
    expect(call.status).toBe(201);
    const duplicateCall = await request(
      `/api/public/restaurants/${createdRestaurantId}/table-requests`,
      {
        method: "POST",
        body: JSON.stringify({
          tableCode: table.code,
          guestSessionId: `guest-${suffix}`,
          type: "waiter_call",
        }),
      },
    );
    expect(duplicateCall.status).toBe(200);
    expect(((await duplicateCall.json()) as { data: { duplicate: boolean } }).data.duplicate).toBe(
      true,
    );

    const activeRequests = await request(
      `/api/restaurants/${createdRestaurantId}/service-requests`,
      {},
      waiter.cookie,
    );
    const requestId = (
      (await activeRequests.json()) as { data: Array<{ id: string; notes: string }> }
    ).data[0]!.id;
    expect(
      (
        await request(
          `/api/restaurants/${createdRestaurantId}/service-requests/${requestId}`,
          { method: "PATCH", body: JSON.stringify({ status: "acknowledged" }) },
          waiter.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/api/restaurants/${createdRestaurantId}/service-requests/${requestId}`,
          { method: "PATCH", body: JSON.stringify({ status: "completed" }) },
          waiter.cookie,
        )
      ).status,
    ).toBe(200);

    const check = await request(`/api/public/restaurants/${createdRestaurantId}/table-requests`, {
      method: "POST",
      body: JSON.stringify({
        tableCode: table.code,
        guestSessionId: `guest-${suffix}`,
        type: "check",
        paymentMethod: "cash",
      }),
    });
    expect(check.status).toBe(201);
    const checkQueue = (await (
      await request(`/api/restaurants/${createdRestaurantId}/service-requests`, {}, waiter.cookie)
    ).json()) as { data: Array<{ paymentMethod: string }> };
    expect(checkQueue.data[0]!.paymentMethod).toBe("cash");

    expect(
      (await request(`/api/restaurants/${createdRestaurantId}/orders`, {}, viewer.cookie)).status,
    ).toBe(403);
    const kitchen = (await (
      await request(`/api/restaurants/${createdRestaurantId}/kitchen`, {}, chefA.cookie)
    ).json()) as { data: Array<{ id: string }> };
    const itemId = kitchen.data[0]!.id;
    const claims = await Promise.all([
      request(
        `/api/restaurants/${createdRestaurantId}/kitchen/items/${itemId}/claim`,
        { method: "POST" },
        chefA.cookie,
      ),
      request(
        `/api/restaurants/${createdRestaurantId}/kitchen/items/${itemId}/claim`,
        { method: "POST" },
        chefB.cookie,
      ),
    ]);
    expect(claims.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(
      (
        await request(
          `/api/restaurants/${createdRestaurantId}/kitchen/items/${itemId}/status`,
          { method: "PATCH", body: JSON.stringify({ status: "done" }) },
          owner.cookie,
        )
      ).status,
    ).toBe(200);

    const readyOrders = (await (
      await request(`/api/restaurants/${createdRestaurantId}/orders`, {}, waiter.cookie)
    ).json()) as { data: Array<{ id: string; status: string; currency: string }> };
    expect(readyOrders.data.find((order) => order.id === orderId)?.status).toBe("ready");
    expect(readyOrders.data.find((order) => order.id === orderId)?.currency).toBe("USD");
    expect(
      (
        await request(
          `/api/restaurants/${createdRestaurantId}/orders/${orderId}/complete`,
          { method: "POST" },
          waiter.cookie,
        )
      ).status,
    ).toBe(200);
    const localDateParts = new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Bucharest",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const localPart = (type: Intl.DateTimeFormatPartTypes) =>
      localDateParts.find((part) => part.type === type)!.value;
    const localDate = `${localPart("year")}-${localPart("month")}-${localPart("day")}`;
    const revenue = await request(
      `/api/restaurants/${createdRestaurantId}/analytics/revenue?from=${localDate}&to=${localDate}&interval=day`,
      {},
      owner.cookie,
    );
    expect(revenue.status).toBe(200);
    expect(
      ((await revenue.json()) as { data: Array<{ bucket: string; orders: number }> }).data[0],
    ).toMatchObject({ bucket: localDate, orders: 1 });
    const peakHours = await request(
      `/api/restaurants/${createdRestaurantId}/analytics/peak-hours?from=${localDate}&to=${localDate}`,
      {},
      owner.cookie,
    );
    expect(peakHours.status).toBe(200);
    expect(((await peakHours.json()) as { data: Array<{ orders: number }> }).data[0]?.orders).toBe(
      1,
    );
  });
});
