import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { app } from "../app";
import { sql } from "../db/client";

const run = Boolean(process.env.RUN_DB_TESTS);
const origin = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

async function request(path: string, init: RequestInit = {}, cookie?: string) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Origin", origin);
  if (cookie) headers.set("Cookie", cookie);
  return app.request(path, { ...init, headers });
}

describe.skipIf(!run)("critical API writes against PostgreSQL", () => {
  let cookie = "";
  let restaurantId = "";

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.toLowerCase().includes("test"))
      throw new Error("RUN_DB_TESTS requires a dedicated DATABASE_URL containing 'test'.");
    await sql`delete from users`;
  });
  afterAll(async () => {
    await sql.end();
  });

  test("session, tenant authorization, draft isolation, publish, and concurrent booking", async () => {
    const register = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Owner",
        email: "owner@example.com",
        password: "production-passphrase",
      }),
    });
    expect(register.status).toBe(201);
    const registered = (await register.clone().json()) as { data: { userId: string } };
    await sql`update users set email_verified_at = now() where id = ${registered.data.userId}`;
    const ownerLogin = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "owner@example.com", password: "production-passphrase" }),
    });
    cookie = ownerLogin.headers.get("set-cookie")!.split(";")[0]!;

    const onboard = await request(
      "/api/restaurants",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Integration Bistro",
          cuisineType: "Test",
          logoFilename: null,
          notes: "",
          currency: "EUR",
          timezone: "Europe/Bucharest",
          theme: "gold-dark",
          tableCount: 1,
          layoutShape: "intimate",
          teamInvites: [],
        }),
      },
      cookie,
    );
    expect(onboard.status).toBe(201);
    restaurantId = ((await onboard.json()) as { data: { id: string } }).data.id;

    const tax = await request(
      `/api/restaurants/${restaurantId}/menu/tax-categories`,
      {
        method: "POST",
        body: JSON.stringify({ name: "VAT", ratePercentage: 19 }),
      },
      cookie,
    );
    const taxId = ((await tax.json()) as { data: { id: string } }).data.id;
    const category = await request(
      `/api/restaurants/${restaurantId}/menu/categories`,
      { method: "POST", body: JSON.stringify({ name: "Mains" }) },
      cookie,
    );
    const categoryId = ((await category.json()) as { data: { id: string } }).data.id;
    await request(
      `/api/restaurants/${restaurantId}/menu/products`,
      {
        method: "POST",
        body: JSON.stringify({
          categoryId,
          taxCategoryId: taxId,
          name: "Dish",
          description: "",
          priceBeforeTax: 12.5,
          images: [],
          dietaryTags: [],
          isAvailable: true,
        }),
      },
      cookie,
    );
    expect(
      (
        await request(
          `/api/restaurants/${restaurantId}/menu/theme/publish`,
          { method: "POST" },
          cookie,
        )
      ).status,
    ).toBe(200);
    const before = (await (
      await request(`/api/public/restaurants/${restaurantId}/menu`)
    ).json()) as { data: { theme: { accentColor: string } } };
    await request(
      `/api/restaurants/${restaurantId}/menu/theme/draft`,
      {
        method: "PATCH",
        body: JSON.stringify({ patch: { accentColor: "#ff0000" } }),
      },
      cookie,
    );
    const isolated = (await (
      await request(`/api/public/restaurants/${restaurantId}/menu`)
    ).json()) as { data: { theme: { accentColor: string } } };
    expect(isolated.data.theme.accentColor).toBe(before.data.theme.accentColor);
    await request(
      `/api/restaurants/${restaurantId}/menu/theme/publish`,
      { method: "POST" },
      cookie,
    );
    const after = (await (
      await request(`/api/public/restaurants/${restaurantId}/menu`)
    ).json()) as { data: { theme: { accentColor: string } } };
    expect(after.data.theme.accentColor).toBe("#ff0000");

    const stranger = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Stranger",
        email: "stranger@example.com",
        password: "production-passphrase",
      }),
    });
    const strangerBody = (await stranger.json()) as { data: { userId: string } };
    await sql`update users set email_verified_at = now() where id = ${strangerBody.data.userId}`;
    const strangerLogin = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "stranger@example.com", password: "production-passphrase" }),
    });
    const strangerCookie = strangerLogin.headers.get("set-cookie")!.split(";")[0]!;
    expect((await request(`/api/restaurants/${restaurantId}`, {}, strangerCookie)).status).toBe(
      403,
    );

    await request(
      `/api/restaurants/${restaurantId}/reservation-theme/publish`,
      { method: "POST" },
      cookie,
    );
    const layout = (await (
      await request(`/api/restaurants/${restaurantId}/layout`, {}, cookie)
    ).json()) as { data: { tables: Array<{ id: string }> } };
    const payload = {
      tableId: layout.data.tables[0]!.id,
      guestName: "Guest",
      partySize: 2,
      date: "2026-07-16",
      startTime: "19:00",
      email: "guest@example.com",
    };
    const [first, second] = await Promise.all([
      request(`/api/public/restaurants/${restaurantId}/reservations`, {
        method: "POST",
        headers: { "Idempotency-Key": "booking-retry-one" },
        body: JSON.stringify(payload),
      }),
      request(`/api/public/restaurants/${restaurantId}/reservations`, {
        method: "POST",
        headers: { "Idempotency-Key": "booking-retry-two" },
        body: JSON.stringify(payload),
      }),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const createdResponse = first.status === 201 ? first : second;
    const created = (await createdResponse.json()) as { data: { id: string } };
    const rescheduled = await request(
      `/api/restaurants/${restaurantId}/reservations/${created.data.id}/reschedule`,
      {
        method: "POST",
        body: JSON.stringify({ tableId: payload.tableId, date: "2026-07-16", startTime: "20:30" }),
      },
      cookie,
    );
    expect(rescheduled.status).toBe(200);
    expect(((await rescheduled.json()) as { data: { startTime: string } }).data.startTime).toBe(
      "20:30",
    );
    const [queued] = await sql<
      { kind: string; status: string }[]
    >`select kind, status from email_jobs where reservation_id = ${created.data.id} and kind = 'rescheduled'`;
    expect(queued?.status).toBe("pending");
  });
});
