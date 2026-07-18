import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function clippedInteractiveElements(page: Page) {
  return page.locator("a, button, input, select, textarea").evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        rect.width === 0 ||
        rect.height === 0
      )
        return [];
      const scrollParent = element.closest(
        ".dashboard-sidebar nav, .orders-tabs, .settings-section-nav, .public-menu-category-nav",
      );
      if (scrollParent) return [];
      return rect.left < -1 || rect.right > document.documentElement.clientWidth + 1
        ? [`${element.tagName.toLowerCase()}${element.getAttribute("aria-label") ? `[aria-label="${element.getAttribute("aria-label")}"]` : ""}`]
        : [];
    }),
  );
}

const restaurant = {
  id: "rest_e2e",
  ownerId: "user_e2e",
  name: "E2E Bistro",
  logoUrl: null,
  coverImageUrl: null,
  cuisineType: "Bistro",
  notes: "",
  currency: "EUR",
  language: "en",
  timezone: "Europe/Istanbul",
  reservationsEnabled: true,
  callWaiterEnabled: true,
  requestCheckEnabled: true,
  theme: "gold-dark",
  tableCount: 1,
  layoutShape: "intimate",
  teamInvites: [],
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};
const theme = {
  id: "theme_e2e",
  restaurantId: restaurant.id,
  paletteId: "gold-dark",
  accentColor: "#9ee1c3",
  backgroundColor: "#090d18",
  textColor: "#eef3ff",
  isPublished: true,
  version: 1,
  updatedAt: new Date(0).toISOString(),
};

async function mockAuthenticatedApi(page: Page, role = "owner") {
  const user = {
    userId: "user_e2e",
    email: "owner@example.com",
    name: "E2E Owner",
    createdAt: new Date(0).toISOString(),
    emailVerified: true,
    mfaEnabled: false,
    activeRestaurantId: restaurant.id,
    restaurantIds: [restaurant.id],
    memberships: [{ restaurantId: restaurant.id, role }],
  };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data: unknown = [];
    if (path === "/api/me") data = user;
    else if (path === "/api/me/restaurants") data = [restaurant];
    else if (path.endsWith("/menu"))
      data = {
        restaurant,
        categories: [],
        products: [],
        taxCategories: [],
        theme,
        themeRevision: 1,
        versions: [],
      };
    else if (path.endsWith("/layout"))
      data = {
        revision: 1,
        tables: [
          {
            id: "table_e2e",
            restaurantId: restaurant.id,
            name: "Table 1",
            capacity: 4,
            shape: "square",
            position: { x: 0, y: 0, z: 0 },
            rotation: 0,
            status: "available",
            linked: true,
          },
        ],
        walls: [],
        zones: [],
        updatedAt: new Date(0).toISOString(),
      };
    else if (path.endsWith("/floor-plan-theme/draft"))
      data = {
        restaurantId: restaurant.id,
        initialZoomPadding: 1,
        snapToGrid: true,
        labelMode: "both",
        defaultTableShape: "square",
        availableColor: "#9ee1c3",
        reservedColor: "#f0c36a",
        occupiedColor: "#ef7777",
        isPublished: true,
        version: 1,
        updatedAt: new Date(0).toISOString(),
      };
    else if (path.endsWith("/reservation-settings"))
      data = {
        restaurantId: restaurant.id,
        maxStayMinutes: 120,
        slotMinutes: 30,
        is24_7: true,
        weeklyHours: {},
      };
    else if (path.endsWith("/reservation-theme/draft"))
      data = {
        ...theme,
        pageTitle: "Reserve",
        pageSubtitle: "Choose a table",
        showFloorPlan: true,
      };
    else if (path.endsWith("/reservations"))
      data = [
        {
          id: "res_e2e",
          restaurantId: restaurant.id,
          tableId: "table_e2e",
          guestName: "Guest Example",
          partySize: 2,
          date: "2026-07-16",
          startTime: "19:00",
          endTime: "21:00",
          status: "confirmed",
          email: "guest@example.com",
          createdAt: new Date(0).toISOString(),
        },
      ];
    else if (path === "/api/billing/subscription")
      data = {
        status: "active",
        planName: "Pro",
        cardBrand: null,
        cardLastFour: null,
        renewsAt: null,
        endsAt: null,
        testMode: true,
        portalUrl: null,
        access: "pro",
        plan: "group",
        limits: { restaurants: 10, membersPerRestaurant: 50, tablesPerRestaurant: null },
        features: [
          "menu",
          "reservations",
          "floorPlan",
          "orders",
          "nora",
          "analytics",
          "multiRestaurant",
        ],
      };
    else if (path.endsWith("/members"))
      data = [
        {
          userId: user.userId,
          restaurantId: restaurant.id,
          role,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
          updatedAt: user.createdAt,
        },
      ];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
}

test("authenticated owner can reach critical workspace routes", async ({ page }) => {
  await mockAuthenticatedApi(page);
  for (const path of [
    "/dashboard",
    "/dashboard/menu",
    "/dashboard/tables",
    "/dashboard/orders",
    "/dashboard/layout-editor",
    "/dashboard/analytics",
    "/dashboard/settings",
    "/dashboard/settings/mcp",
    "/account",
    "/account/billing",
    "/account/settings",
    "/onboarding",
  ]) {
    await page.goto(path);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await expect(page.locator("body")).toBeVisible();
  }
});

test("authenticated pages stay within a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await mockAuthenticatedApi(page);
  for (const path of [
    "/dashboard",
    "/dashboard/menu",
    "/dashboard/tables",
    "/dashboard/orders",
    "/dashboard/layout-editor",
    "/dashboard/analytics",
    "/dashboard/settings",
    "/dashboard/settings/mcp",
    "/account",
    "/account/billing",
    "/account/settings",
  ]) {
    await page.goto(path);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    if (path.startsWith("/dashboard") || path.startsWith("/account")) {
      await expect(page.locator(".sidebar-bottom"), `${path} keeps account actions reachable`).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    }
    if (path.startsWith("/dashboard")) {
      await expect(page.getByRole("link", { name: "All restaurants" })).toBeVisible();
    }
    await expect
      .poll(() =>
        page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
        })),
      )
      .toEqual({ viewport: 320, content: 320 });
    expect(await clippedInteractiveElements(page), `${path} has clipped controls`).toEqual([]);
  }
});

test("authenticated dashboard supports keyboard navigation and dialog escape", async ({ page }) => {
  await mockAuthenticatedApi(page);
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByRole("button", { name: "Open Nora business assistant" }).click();
  await expect(page.getByRole("dialog", { name: "Nora restaurant assistant" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Nora restaurant assistant" })).toHaveCount(0);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});

test("viewer navigation does not expose operational order controls", async ({ page }) => {
  await mockAuthenticatedApi(page, "viewer");
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Orders" })).toHaveCount(0);
});

test("staff can start and submit the reservation reschedule workflow", async ({ page }) => {
  await mockAuthenticatedApi(page);
  await page.goto("/dashboard/tables");
  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByRole("tab", { name: "Reservations" }).click();
  await page.getByRole("button", { name: "Reschedule reservation for Guest Example" }).click();
  const submitted = page.waitForRequest(
    (request) =>
      request.url().endsWith("/reservations/res_e2e/reschedule") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Save new time" }).click();
  expect((await submitted).postDataJSON()).toMatchObject({
    tableId: "table_e2e",
    date: "2026-07-16",
    startTime: "19:00",
  });
});

test("anonymous users are redirected away from authenticated routes", async ({ page }) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: null }),
    }),
  );
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login$/);
});
