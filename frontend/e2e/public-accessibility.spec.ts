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
      const scrollParent = element.closest(".public-menu-category-nav");
      if (scrollParent) return [];
      return rect.left < -1 || rect.right > document.documentElement.clientWidth + 1
        ? [element.tagName.toLowerCase()]
        : [];
    }),
  );
}

for (const path of [
  "/",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/privacy",
  "/terms",
  "/cookies",
]) {
  test(`${path} renders without serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("body")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(700);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);
  });
}

test("forgot-password flow accepts a valid address", async ({ page }) => {
  await page.route("**/api/auth/forgot-password", (route) =>
    route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ data: { accepted: true } }),
    }),
  );
  await page.goto("/auth/forgot-password");
  await page.getByLabel("Work email").fill("owner@example.com");
  await page.getByRole("button", { name: /prepare recovery link/i }).click();
  await expect(page.getByText("Check your inbox.")).toBeVisible();
});

test("landing page stays usable at a narrow mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Run every service with clarity." })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});

test("published guest pages stay within a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
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
    timezone: "Europe/Bucharest",
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
  const menuTheme = {
    id: "menu_theme_e2e",
    restaurantId: restaurant.id,
    paletteId: "gold-dark",
    fontPairingId: "modern-sans-clean",
    density: "comfortable",
    entranceAnimationPreset: "none",
    exitAnimationPreset: "none",
    animationSpeed: "normal",
    layoutType: "grid",
    categoryNavigation: "pills",
    widthPreset: "wide",
    accentColor: "#9ee1c3",
    backgroundColor: "#090d18",
    textColor: "#eef3ff",
    isPublished: true,
    orderStatus: "disabled",
    version: 1,
    updatedAt: new Date(0).toISOString(),
  };
  await page.route("**/api/public/restaurants/rest_e2e/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const table = {
      id: "table_e2e",
      restaurantId: restaurant.id,
      name: "Table 1",
      capacity: 4,
      shape: "square",
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      status: "available",
      linked: true,
    };
    let data: unknown;
    if (path.endsWith("/menu")) {
      data = {
        restaurant,
        categories: [
          {
            id: "category_e2e",
            restaurantId: restaurant.id,
            name: "Dinner",
            description: "Seasonal dishes",
            position: 0,
          },
        ],
        products: [
          {
            id: "product_e2e",
            restaurantId: restaurant.id,
            categoryId: "category_e2e",
            name: "Garden plate",
            description: "A responsive menu item with a deliberately useful description.",
            priceBeforeTax: 18,
            taxCategoryId: "tax_e2e",
            imageUrl: null,
            images: [],
            dietaryTags: ["vegetarian"],
            isAvailable: true,
            position: 0,
          },
        ],
        taxCategories: [
          {
            id: "tax_e2e",
            restaurantId: restaurant.id,
            name: "Standard",
            ratePercentage: 0,
          },
        ],
        theme: menuTheme,
        themeRevision: 1,
        versions: [],
      };
    } else if (path.endsWith("/booking-config")) {
      data = {
        restaurant,
        settings: {
          restaurantId: restaurant.id,
          maxStayMinutes: 120,
          slotMinutes: 30,
          is24_7: true,
          weeklyHours: {},
        },
        theme: {
          ...menuTheme,
          id: "reservation_theme_e2e",
          pageTitle: "Reserve a table",
          pageSubtitle: "Choose the best time for your visit",
          showFloorPlan: true,
          layoutVariant: "guided",
          stepIndicator: "numbered",
        },
        floorPlanTheme: null,
        layout: { tables: [table], walls: [], zones: [] },
        preselectedTableId: null,
      };
    } else {
      data = { availableTables: [table] };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });

  for (const path of ["/menu/rest_e2e", "/reserve/rest_e2e"]) {
    await page.goto(path);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
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
