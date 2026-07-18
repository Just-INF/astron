import { eq } from "drizzle-orm";
import { db, sql } from "./client";
import {
  diningTables,
  floorLayouts,
  floorPlanThemeDrafts,
  floorPlanThemeVersions,
  menuCategories,
  menuThemeDrafts,
  menuThemeVersions,
  orderItems,
  orders,
  products,
  reservationSettings,
  reservationThemeDrafts,
  reservationThemeVersions,
  restaurantMemberships,
  restaurants,
  taxCategories,
  users,
} from "./schema";
import { sha256 } from "../lib/ids";
import {
  defaultFloorTheme,
  defaultMenuTheme,
  defaultReservationTheme,
  defaultWeeklyHours,
} from "../lib/theme";

if (process.env.NODE_ENV === "production")
  throw new Error("The demo restaurant seed is development-only.");
const userId = "user_demo_admin",
  restaurantId = "rest_demo_seed";
const passwordHash = await Bun.password.hash(process.env.DEV_SEED_PASSWORD ?? "password123", {
  algorithm: "argon2id",
  memoryCost: 65_536,
  timeCost: 3,
});

await db.transaction(async (tx) => {
  await tx
    .insert(users)
    .values({
      id: userId,
      email: "admin@demo.example",
      name: "Mira Laurent",
      passwordHash,
      emailVerifiedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { passwordHash, name: "Mira Laurent", emailVerifiedAt: new Date() },
    });
  await tx.delete(restaurants).where(eq(restaurants.id, restaurantId));
  await tx.insert(restaurants).values({
    id: restaurantId,
    ownerId: userId,
    name: "Demo Bistro",
    cuisineType: "Modern Mediterranean",
    currency: "EUR",
    language: "en",
    timezone: "Europe/Bucharest",
    reservationsEnabled: true,
    callWaiterEnabled: true,
    requestCheckEnabled: true,
    theme: "gold-dark",
    tableCount: 4,
    layoutShape: "terrace",
  });
  await tx.insert(restaurantMemberships).values({ restaurantId, userId, role: "owner" });
  const menuTheme = defaultMenuTheme(restaurantId),
    floorTheme = defaultFloorTheme(restaurantId),
    reservationTheme = defaultReservationTheme(restaurantId),
    now = new Date();
  await tx.insert(menuThemeDrafts).values({ restaurantId, document: menuTheme, updatedBy: userId });
  await tx.insert(menuThemeVersions).values({
    id: "menuver_demo_1",
    restaurantId,
    version: 1,
    document: menuTheme,
    publishedBy: userId,
    publishedAt: now,
  });
  await tx
    .insert(floorPlanThemeDrafts)
    .values({ restaurantId, document: floorTheme, updatedBy: userId });
  await tx.insert(floorPlanThemeVersions).values({
    id: "floorver_demo_1",
    restaurantId,
    version: 1,
    document: floorTheme,
    publishedBy: userId,
    publishedAt: now,
  });
  await tx
    .insert(reservationThemeDrafts)
    .values({ restaurantId, document: reservationTheme, updatedBy: userId });
  await tx.insert(reservationThemeVersions).values({
    id: "resver_demo_1",
    restaurantId,
    version: 1,
    document: reservationTheme,
    publishedBy: userId,
    publishedAt: now,
  });
  await tx.insert(reservationSettings).values({ restaurantId, weeklyHours: defaultWeeklyHours() });
  const tableValues = await Promise.all(
    ["Window Booth", "Table 1", "Chef's Counter", "Terrace 1"].map(async (name, index) => ({
      id: `table_demo_${index + 1}`,
      restaurantId,
      name,
      capacity: index === 2 ? 6 : 4,
      shape: index === 0 || index === 2 ? "rectangle" : "circle",
      position: { x: (index - 1.5) * 3, y: index % 2 ? -2 : 2, z: 0 },
      rotation: 0,
      status: "available" as const,
      codeHash: await sha256(`demo-development-table-${index + 1}`),
      codeDisplay: `demo-development-table-${index + 1}`,
    })),
  );
  await tx.insert(diningTables).values(tableValues);
  await tx.insert(floorLayouts).values({
    restaurantId,
    walls: [
      {
        id: "wall_demo",
        restaurantId,
        nodes: [
          { x: -7, y: 5 },
          { x: 7, y: 5 },
        ],
        segments: [{ curve: 0 }],
        thickness: 0.24,
        height: 0.8,
      },
    ],
    zones: [
      {
        id: "zone_demo",
        restaurantId,
        name: "Terrace",
        color: "#9ee1c3",
        shape: "rectangle",
        points: [
          { x: 2, y: -5 },
          { x: 8, y: 0 },
        ],
      },
    ],
    updatedBy: userId,
  });
  await tx.insert(taxCategories).values([
    {
      id: "tax_demo_standard",
      restaurantId,
      name: "Standard Dine-in",
      rateBasisPoints: 1_900,
    },
    {
      id: "tax_demo_alcohol",
      restaurantId,
      name: "Alcohol",
      rateBasisPoints: 2_700,
    },
  ]);
  await tx.insert(menuCategories).values([
    {
      id: "cat_demo_starters",
      restaurantId,
      name: "Starters",
      description: "Small plates to begin",
      position: 0,
    },
    {
      id: "cat_demo_mains",
      restaurantId,
      name: "Mains",
      description: "The centre of the table",
      position: 1,
    },
  ]);
  await tx.insert(products).values([
    {
      id: "dish_demo_octopus",
      restaurantId,
      categoryId: "cat_demo_starters",
      taxCategoryId: "tax_demo_standard",
      name: "Charred Octopus",
      description: "Salsa verde and caperberries.",
      priceMinor: 1_850,
      currency: "EUR",
      isAvailable: true,
      position: 0,
    },
    {
      id: "dish_demo_ribeye",
      restaurantId,
      categoryId: "cat_demo_mains",
      taxCategoryId: "tax_demo_standard",
      name: "Dry-Aged Ribeye",
      description: "Herbs and smoked jus.",
      priceMinor: 3_600,
      currency: "EUR",
      isAvailable: true,
      position: 0,
    },
  ]);
  for (let day = 0; day < 30; day += 1) {
    const closedAt = new Date(Date.UTC(2026, 6, 14 - day, 18 + (day % 5))),
      orderId = `order_demo_${day}`,
      subtotalMinor = 5_450 + day * 37,
      taxMinor = Math.round(subtotalMinor * 0.19);
    await tx.insert(orders).values({
      id: orderId,
      restaurantId,
      tableId: tableValues[day % tableValues.length]!.id,
      currency: "EUR",
      subtotalMinor,
      taxMinor,
      totalMinor: subtotalMinor + taxMinor,
      status: "completed",
      completedAt: closedAt,
      closedAt,
    });
    await tx.insert(orderItems).values({
      id: `item_demo_${day}`,
      orderId,
      productId: day % 2 ? "dish_demo_octopus" : "dish_demo_ribeye",
      productName: day % 2 ? "Charred Octopus" : "Dry-Aged Ribeye",
      categoryName: day % 2 ? "Starters" : "Mains",
      quantity: 2,
      status: "done",
      completedAt: closedAt,
      unitPriceMinor: Math.floor(subtotalMinor / 2),
      taxRateBasisPoints: 1_900,
      taxMinor,
      totalMinor: subtotalMinor + taxMinor,
    });
  }
});

await sql.end();
console.log(
  "Seeded demo restaurant. Login: admin@demo.example /",
  process.env.DEV_SEED_PASSWORD ?? "password123",
);
