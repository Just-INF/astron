import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/client";
import {
  auditLogs,
  menuCategories,
  menuThemeDrafts,
  menuThemeVersions,
  mediaAssets,
  productDietaryTags,
  productImages,
  products,
  restaurants,
  taxCategories,
} from "../../db/schema";
import { requireAuth, requireMembership, type AppVariables } from "../../lib/auth";
import { ApiError } from "../../lib/errors";
import { createId } from "../../lib/ids";
import { can } from "../../lib/permissions";
import { validateCustomCss } from "../../lib/theme";

const categoryInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1_000).nullable().optional(),
});
const productInput = z.object({
  categoryId: z.string().min(1),
  taxCategoryId: z.string().min(1),
  name: z.string().trim().min(1).max(180),
  description: z.string().max(4_000).default(""),
  priceBeforeTax: z.number().nonnegative().max(1_000_000),
  imageUrl: z.string().url().nullable().optional(),
  images: z.array(z.string().url()).max(10).default([]),
  dietaryTags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  isAvailable: z.boolean().default(true),
});
const taxInput = z.object({
  name: z.string().trim().min(1).max(120),
  ratePercentage: z.number().min(0).max(100),
});
const menuImportInput = z
  .object({
    mode: z.enum(["replace", "merge"]).default("replace"),
    categories: z
      .array(
        categoryInput.extend({
          id: z.string().optional(),
          position: z.number().int().nonnegative().optional(),
        }),
      )
      .max(500),
    taxes: z.array(taxInput.extend({ id: z.string().optional() })).max(100),
    products: z
      .array(
        productInput.extend({
          id: z.string().optional(),
          position: z.number().int().nonnegative().optional(),
        }),
      )
      .max(5_000),
  })
  .superRefine((value, ctx) => {
    const categoryIds = new Set(value.categories.flatMap((item) => (item.id ? [item.id] : [])));
    const taxIds = new Set(value.taxes.flatMap((item) => (item.id ? [item.id] : [])));
    value.products.forEach((item, index) => {
      if (!categoryIds.has(item.categoryId))
        ctx.addIssue({
          code: "custom",
          path: ["products", index, "categoryId"],
          message: "Product categoryId must refer to an imported category.",
        });
      if (!taxIds.has(item.taxCategoryId))
        ctx.addIssue({
          code: "custom",
          path: ["products", index, "taxCategoryId"],
          message: "Product taxCategoryId must refer to an imported tax category.",
        });
    });
  });

function mapCategory(row: typeof menuCategories.$inferSelect) {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    name: row.name,
    description: row.description,
    position: row.position,
  };
}
function mapTax(row: typeof taxCategories.$inferSelect) {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    name: row.name,
    ratePercentage: row.rateBasisPoints / 100,
  };
}
function mapProduct(
  row: typeof products.$inferSelect,
  dietaryTags: string[] = [],
  images: string[] = [],
) {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    categoryId: row.categoryId,
    name: row.name,
    description: row.description,
    priceBeforeTax: row.priceMinor / 100,
    taxCategoryId: row.taxCategoryId,
    imageUrl: images[0] ?? null,
    images,
    dietaryTags,
    isAvailable: row.isAvailable,
    position: row.position,
    currency: row.currency,
    priceMinor: row.priceMinor,
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
    isPublished: published,
    version,
    updatedAt: updatedAt.toISOString(),
  };
}

export const menuRoutes = new Hono<{ Variables: AppVariables }>();
menuRoutes.use("/*", requireAuth);
menuRoutes.use("/*", requireMembership("menu:read"));

menuRoutes.get("/", async (c) => {
  const restaurantId = c.req.param("restaurantId")!;
  const [restaurant, categories, productRows, taxes, tags, draft, versions] = await Promise.all([
    db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        logoUrl: restaurants.logoUrl,
        cuisineType: restaurants.cuisineType,
        currency: restaurants.currency,
        language: restaurants.language,
        timezone: restaurants.timezone,
      })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1),
    db
      .select()
      .from(menuCategories)
      .where(and(eq(menuCategories.restaurantId, restaurantId), isNull(menuCategories.archivedAt)))
      .orderBy(asc(menuCategories.position)),
    db
      .select()
      .from(products)
      .where(and(eq(products.restaurantId, restaurantId), isNull(products.archivedAt)))
      .orderBy(asc(products.position)),
    db
      .select()
      .from(taxCategories)
      .where(and(eq(taxCategories.restaurantId, restaurantId), isNull(taxCategories.archivedAt))),
    db
      .select()
      .from(productDietaryTags)
      .innerJoin(products, eq(products.id, productDietaryTags.productId))
      .where(and(eq(products.restaurantId, restaurantId), isNull(products.archivedAt))),
    db
      .select()
      .from(menuThemeDrafts)
      .where(eq(menuThemeDrafts.restaurantId, restaurantId))
      .limit(1),
    db
      .select()
      .from(menuThemeVersions)
      .where(eq(menuThemeVersions.restaurantId, restaurantId))
      .orderBy(sql`${menuThemeVersions.version} desc`)
      .limit(20),
  ]);
  const tagMap = new Map<string, string[]>();
  for (const row of tags)
    tagMap.set(row.product_dietary_tags.productId, [
      ...(tagMap.get(row.product_dietary_tags.productId) ?? []),
      row.product_dietary_tags.tag,
    ]);
  const imageRows = productRows.length
    ? await db
        .select({
          productId: productImages.productId,
          position: productImages.position,
          url: mediaAssets.publicUrl,
        })
        .from(productImages)
        .innerJoin(mediaAssets, eq(mediaAssets.id, productImages.mediaId))
        .where(
          inArray(
            productImages.productId,
            productRows.map((product) => product.id),
          ),
        )
        .orderBy(asc(productImages.position))
    : [];
  const imageMap = new Map<string, string[]>();
  for (const image of imageRows)
    if (image.url)
      imageMap.set(image.productId, [...(imageMap.get(image.productId) ?? []), image.url]);
  const draftRow = draft[0];
  const latestVersion = versions[0];
  return c.json({
    data: {
      restaurant: restaurant[0],
      categories: categories.map(mapCategory),
      products: productRows.map((p) => mapProduct(p, tagMap.get(p.id), imageMap.get(p.id))),
      taxCategories: taxes.map(mapTax),
      theme: draftRow
        ? themeDocument(
            draftRow.document,
            restaurantId,
            latestVersion?.version ?? 0,
            latestVersion?.publishedAt ?? draftRow.updatedAt,
            Boolean(latestVersion),
          )
        : null,
      themeRevision: draftRow?.revision ?? 0,
      versions: versions.map((v) => ({
        id: v.id,
        restaurantId,
        version: v.version,
        label: `Published version ${v.version}`,
        createdAt: v.publishedAt.toISOString(),
      })),
    },
  });
});

menuRoutes.post("/import", requireMembership("menu:write"), async (c) => {
  const restaurantId = c.req.param("restaurantId")!;
  const input = menuImportInput.parse(await c.req.json());
  const [restaurant] = await db
    .select({ currency: restaurants.currency })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!restaurant) throw new ApiError(404, "RESTAURANT_NOT_FOUND", "Restaurant not found.");
  await db.transaction(async (tx) => {
    if (input.mode === "replace") {
      const now = new Date();
      await tx
        .update(products)
        .set({ archivedAt: now, updatedAt: now })
        .where(and(eq(products.restaurantId, restaurantId), isNull(products.archivedAt)));
      await tx
        .update(menuCategories)
        .set({ archivedAt: now, updatedAt: now })
        .where(
          and(eq(menuCategories.restaurantId, restaurantId), isNull(menuCategories.archivedAt)),
        );
      await tx
        .update(taxCategories)
        .set({ archivedAt: now, updatedAt: now })
        .where(and(eq(taxCategories.restaurantId, restaurantId), isNull(taxCategories.archivedAt)));
    }
    const categoryIds = new Map<string, string>();
    const taxIds = new Map<string, string>();
    for (const [position, category] of input.categories.entries()) {
      const newId = createId("cat");
      if (category.id) categoryIds.set(category.id, newId);
      await tx.insert(menuCategories).values({
        id: newId,
        restaurantId,
        name: category.name,
        description: category.description ?? null,
        position: category.position ?? position,
      });
    }
    for (const tax of input.taxes) {
      const newId = createId("tax");
      if (tax.id) taxIds.set(tax.id, newId);
      await tx.insert(taxCategories).values({
        id: newId,
        restaurantId,
        name: tax.name,
        rateBasisPoints: Math.round(tax.ratePercentage * 100),
      });
    }
    for (const [position, product] of input.products.entries()) {
      const productId = createId("prod");
      await tx.insert(products).values({
        id: productId,
        restaurantId,
        categoryId: categoryIds.get(product.categoryId)!,
        taxCategoryId: taxIds.get(product.taxCategoryId)!,
        name: product.name,
        description: product.description,
        priceMinor: Math.round(product.priceBeforeTax * 100),
        currency: restaurant.currency,
        isAvailable: product.isAvailable,
        position: product.position ?? position,
      });
      if (product.dietaryTags.length)
        await tx
          .insert(productDietaryTags)
          .values(product.dietaryTags.map((tag) => ({ productId, tag })));
      const urls = [
        ...new Set([...(product.images ?? []), ...(product.imageUrl ? [product.imageUrl] : [])]),
      ];
      if (urls.length) {
        const assets = await tx
          .select({ id: mediaAssets.id, url: mediaAssets.publicUrl })
          .from(mediaAssets)
          .where(
            and(eq(mediaAssets.restaurantId, restaurantId), inArray(mediaAssets.publicUrl, urls)),
          );
        const mediaByUrl = new Map(
          assets.flatMap((asset) => (asset.url ? [[asset.url, asset.id] as const] : [])),
        );
        const imageValues = urls.flatMap((url, imagePosition) => {
          const mediaId = mediaByUrl.get(url);
          return mediaId ? [{ productId, mediaId, position: imagePosition }] : [];
        });
        if (imageValues.length) await tx.insert(productImages).values(imageValues);
      }
    }
    await tx.insert(auditLogs).values({
      restaurantId,
      actorUserId: c.get("user").id,
      action: "menu.imported",
      entityType: "menu",
      entityId: restaurantId,
      metadata: {
        mode: input.mode,
        categories: input.categories.length,
        products: input.products.length,
        taxes: input.taxes.length,
      },
    });
  });
  return c.json(
    {
      data: {
        imported: {
          categories: input.categories.length,
          products: input.products.length,
          taxes: input.taxes.length,
        },
      },
    },
    201,
  );
});

menuRoutes.post("/categories", requireMembership("menu:write"), async (c) => {
  const restaurantId = c.req.param("restaurantId")!;
  const input = categoryInput.parse(await c.req.json());
  const [{ next } = { next: 0 }] = await db
    .select({
      next: sql<number>`coalesce(max(${menuCategories.position}), -1) + 1`,
    })
    .from(menuCategories)
    .where(and(eq(menuCategories.restaurantId, restaurantId), isNull(menuCategories.archivedAt)));
  const category = {
    id: createId("cat"),
    restaurantId,
    name: input.name,
    description: input.description ?? null,
    position: Number(next),
  };
  await db.insert(menuCategories).values(category);
  return c.json({ data: category }, 201);
});
menuRoutes.patch("/categories/:categoryId", requireMembership("menu:write"), async (c) => {
  const input = categoryInput.partial().parse(await c.req.json());
  const [row] = await db
    .update(menuCategories)
    .set({ ...input, updatedAt: new Date() })
    .where(
      and(
        eq(menuCategories.id, c.req.param("categoryId")),
        eq(menuCategories.restaurantId, c.req.param("restaurantId")!),
        isNull(menuCategories.archivedAt),
      ),
    )
    .returning();
  if (!row) throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found.");
  return c.json({ data: mapCategory(row) });
});
menuRoutes.put("/categories/order", requireMembership("menu:write"), async (c) => {
  const { orderedIds } = z
    .object({ orderedIds: z.array(z.string()).min(1) })
    .parse(await c.req.json());
  const restaurantId = c.req.param("restaurantId")!;
  await db.transaction(async (tx) => {
    for (const [position, id] of orderedIds.entries())
      await tx
        .update(menuCategories)
        .set({ position, updatedAt: new Date() })
        .where(
          and(
            eq(menuCategories.id, id),
            eq(menuCategories.restaurantId, restaurantId),
            isNull(menuCategories.archivedAt),
          ),
        );
  });
  return c.json({ data: { orderedIds } });
});
menuRoutes.delete("/categories/:categoryId", requireMembership("menu:write"), async (c) => {
  const restaurantId = c.req.param("restaurantId")!,
    categoryId = c.req.param("categoryId"),
    now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({ archivedAt: now, updatedAt: now })
      .where(and(eq(products.restaurantId, restaurantId), eq(products.categoryId, categoryId)));
    await tx
      .update(menuCategories)
      .set({ archivedAt: now, updatedAt: now })
      .where(and(eq(menuCategories.restaurantId, restaurantId), eq(menuCategories.id, categoryId)));
    await tx.insert(auditLogs).values({
      restaurantId,
      actorUserId: c.get("user").id,
      action: "menu.category_archived",
      entityType: "menu_category",
      entityId: categoryId,
    });
  });
  return c.body(null, 204);
});

menuRoutes.post("/products", requireMembership("menu:write"), async (c) => {
  const restaurantId = c.req.param("restaurantId")!,
    input = productInput.parse(await c.req.json());
  const [restaurant, category, tax] = await Promise.all([
    db
      .select({ currency: restaurants.currency })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1),
    db
      .select({ id: menuCategories.id })
      .from(menuCategories)
      .where(
        and(
          eq(menuCategories.id, input.categoryId),
          eq(menuCategories.restaurantId, restaurantId),
          isNull(menuCategories.archivedAt),
        ),
      )
      .limit(1),
    db
      .select({ id: taxCategories.id })
      .from(taxCategories)
      .where(
        and(
          eq(taxCategories.id, input.taxCategoryId),
          eq(taxCategories.restaurantId, restaurantId),
          isNull(taxCategories.archivedAt),
        ),
      )
      .limit(1),
  ]);
  if (!category.length || !tax.length)
    throw new ApiError(
      422,
      "INVALID_MENU_REFERENCE",
      "Category and tax category must belong to this restaurant.",
    );
  const [{ next } = { next: 0 }] = await db
    .select({ next: sql<number>`coalesce(max(${products.position}), -1) + 1` })
    .from(products)
    .where(
      and(
        eq(products.restaurantId, restaurantId),
        eq(products.categoryId, input.categoryId),
        isNull(products.archivedAt),
      ),
    );
  const row = {
    id: createId("dish"),
    restaurantId,
    categoryId: input.categoryId,
    taxCategoryId: input.taxCategoryId,
    name: input.name,
    description: input.description,
    priceMinor: Math.round(input.priceBeforeTax * 100),
    currency: restaurant[0]!.currency,
    isAvailable: input.isAvailable,
    position: Number(next),
  };
  const requestedImages = input.images.length
    ? input.images
    : input.imageUrl
      ? [input.imageUrl]
      : [];
  const imageAssets = requestedImages.length
    ? await db
        .select({ id: mediaAssets.id, url: mediaAssets.publicUrl })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.restaurantId, restaurantId),
            eq(mediaAssets.status, "ready"),
            inArray(mediaAssets.publicUrl, requestedImages),
          ),
        )
    : [];
  if (imageAssets.length !== new Set(requestedImages).size)
    throw new ApiError(
      422,
      "INVALID_MEDIA_REFERENCE",
      "Every product image must be a completed upload owned by this restaurant.",
    );
  await db.transaction(async (tx) => {
    await tx.insert(products).values(row);
    if (input.dietaryTags.length)
      await tx
        .insert(productDietaryTags)
        .values(input.dietaryTags.map((tag) => ({ productId: row.id, tag })));
    if (imageAssets.length)
      await tx.insert(productImages).values(
        requestedImages.map((url, position) => ({
          productId: row.id,
          mediaId: imageAssets.find((asset) => asset.url === url)!.id,
          position,
        })),
      );
  });
  return c.json(
    {
      data: mapProduct(
        {
          ...row,
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        input.dietaryTags,
        requestedImages,
      ),
    },
    201,
  );
});
menuRoutes.patch("/products/:productId", requireMembership("menu:write"), async (c) => {
  const input = productInput.partial().parse(await c.req.json());
  const restaurantId = c.req.param("restaurantId")!,
    productId = c.req.param("productId");
  const update = {
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.taxCategoryId ? { taxCategoryId: input.taxCategoryId } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.priceBeforeTax !== undefined
      ? { priceMinor: Math.round(input.priceBeforeTax * 100) }
      : {}),
    ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
    updatedAt: new Date(),
  };
  const requestedImages =
    input.images ??
    (input.imageUrl !== undefined ? (input.imageUrl ? [input.imageUrl] : []) : undefined);
  const imageAssets = requestedImages?.length
    ? await db
        .select({ id: mediaAssets.id, url: mediaAssets.publicUrl })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.restaurantId, restaurantId),
            eq(mediaAssets.status, "ready"),
            inArray(mediaAssets.publicUrl, requestedImages),
          ),
        )
    : [];
  if (requestedImages && imageAssets.length !== new Set(requestedImages).size)
    throw new ApiError(
      422,
      "INVALID_MEDIA_REFERENCE",
      "Every product image must be a completed upload owned by this restaurant.",
    );
  const [row] = await db.transaction(async (tx) => {
    const updated = await tx
      .update(products)
      .set(update)
      .where(
        and(
          eq(products.id, productId),
          eq(products.restaurantId, restaurantId),
          isNull(products.archivedAt),
        ),
      )
      .returning();
    if (input.dietaryTags) {
      await tx.delete(productDietaryTags).where(eq(productDietaryTags.productId, productId));
      if (input.dietaryTags.length)
        await tx
          .insert(productDietaryTags)
          .values(input.dietaryTags.map((tag) => ({ productId, tag })));
    }
    if (requestedImages) {
      await tx.delete(productImages).where(eq(productImages.productId, productId));
      if (imageAssets.length)
        await tx.insert(productImages).values(
          requestedImages.map((url, position) => ({
            productId,
            mediaId: imageAssets.find((asset) => asset.url === url)!.id,
            position,
          })),
        );
    }
    return updated;
  });
  if (!row) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  return c.json({
    data: mapProduct(row, input.dietaryTags, requestedImages),
  });
});
menuRoutes.delete("/products/:productId", requireMembership("menu:write"), async (c) => {
  const [row] = await db
    .update(products)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(products.id, c.req.param("productId")),
        eq(products.restaurantId, c.req.param("restaurantId")!),
      ),
    )
    .returning({ id: products.id });
  if (!row) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  return c.body(null, 204);
});

menuRoutes.post("/tax-categories", requireMembership("menu:write"), async (c) => {
  const input = taxInput.parse(await c.req.json());
  const row = {
    id: createId("tax"),
    restaurantId: c.req.param("restaurantId")!,
    name: input.name,
    rateBasisPoints: Math.round(input.ratePercentage * 100),
  };
  await db.insert(taxCategories).values(row);
  return c.json(
    {
      data: mapTax({
        ...row,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
    201,
  );
});
menuRoutes.patch("/tax-categories/:taxCategoryId", requireMembership("menu:write"), async (c) => {
  const input = taxInput.partial().parse(await c.req.json());
  const [row] = await db
    .update(taxCategories)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.ratePercentage !== undefined
        ? { rateBasisPoints: Math.round(input.ratePercentage * 100) }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(taxCategories.id, c.req.param("taxCategoryId")),
        eq(taxCategories.restaurantId, c.req.param("restaurantId")!),
      ),
    )
    .returning();
  if (!row) throw new ApiError(404, "TAX_CATEGORY_NOT_FOUND", "Tax category not found.");
  return c.json({ data: mapTax(row) });
});
menuRoutes.delete("/tax-categories/:taxCategoryId", requireMembership("menu:write"), async (c) => {
  const used = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(eq(products.taxCategoryId, c.req.param("taxCategoryId")), isNull(products.archivedAt)),
    )
    .limit(1);
  if (used.length)
    throw new ApiError(
      409,
      "TAX_CATEGORY_IN_USE",
      "Archive or reassign products before deleting this tax category.",
    );
  await db
    .update(taxCategories)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(taxCategories.id, c.req.param("taxCategoryId")),
        eq(taxCategories.restaurantId, c.req.param("restaurantId")!),
      ),
    );
  return c.body(null, 204);
});

menuRoutes.get("/theme/draft", async (c) => {
  const [row] = await db
    .select()
    .from(menuThemeDrafts)
    .where(eq(menuThemeDrafts.restaurantId, c.req.param("restaurantId")!))
    .limit(1);
  if (!row) throw new ApiError(404, "MENU_THEME_NOT_FOUND", "Menu theme draft not found.");
  return c.json(
    {
      data: themeDocument(row.document, row.restaurantId, row.revision, row.updatedAt, false),
      revision: row.revision,
    },
    200,
    { "Cache-Control": "private, no-store" },
  );
});
menuRoutes.patch("/theme/draft", requireMembership("menu:write"), async (c) => {
  const input = z
    .object({
      patch: z.record(z.string(), z.unknown()),
      expectedRevision: z.number().int().positive().optional(),
    })
    .parse(await c.req.json());
  const membership = c.get("membership");
  validateCustomCss(input.patch, can(membership.role, "theme:custom-css"));
  const [current] = await db
    .select()
    .from(menuThemeDrafts)
    .where(eq(menuThemeDrafts.restaurantId, c.req.param("restaurantId")!))
    .limit(1);
  if (!current) throw new ApiError(404, "MENU_THEME_NOT_FOUND", "Menu theme draft not found.");
  if (input.expectedRevision && input.expectedRevision !== current.revision)
    throw new ApiError(
      409,
      "REVISION_CONFLICT",
      "The menu theme changed in another session. Reload and retry.",
    );
  const [row] = await db
    .update(menuThemeDrafts)
    .set({
      document: { ...(current.document as object), ...input.patch },
      revision: current.revision + 1,
      updatedBy: c.get("user").id,
      updatedAt: new Date(),
    })
    .where(eq(menuThemeDrafts.restaurantId, current.restaurantId))
    .returning();
  return c.json({
    data: themeDocument(row!.document, row!.restaurantId, row!.revision, row!.updatedAt, false),
    revision: row!.revision,
  });
});
menuRoutes.post("/theme/publish", requireMembership("menu:publish"), async (c) => {
  const restaurantId = c.req.param("restaurantId")!,
    userId = c.get("user").id;
  const published = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select restaurant_id from menu_theme_drafts where restaurant_id = ${restaurantId} for update`,
    );
    const [draft] = await tx
      .select()
      .from(menuThemeDrafts)
      .where(eq(menuThemeDrafts.restaurantId, restaurantId));
    if (!draft) throw new ApiError(404, "MENU_THEME_NOT_FOUND", "Menu theme draft not found.");
    const [{ value } = { value: null }] = await tx
      .select({ value: max(menuThemeVersions.version) })
      .from(menuThemeVersions)
      .where(eq(menuThemeVersions.restaurantId, restaurantId));
    const version = (value ?? 0) + 1,
      id = createId("menuver"),
      now = new Date();
    await tx.insert(menuThemeVersions).values({
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
      action: "menu.theme_published",
      entityType: "menu_theme_version",
      entityId: id,
      metadata: { version },
    });
    return { id, version, document: draft.document, publishedAt: now };
  });
  return c.json({
    data: themeDocument(
      published.document,
      restaurantId,
      published.version,
      published.publishedAt,
      true,
    ),
  });
});
menuRoutes.get("/theme/versions", async (c) => {
  const rows = await db
    .select()
    .from(menuThemeVersions)
    .where(eq(menuThemeVersions.restaurantId, c.req.param("restaurantId")!))
    .orderBy(sql`${menuThemeVersions.version} desc`);
  return c.json({
    data: rows.map((v) => ({
      id: v.id,
      restaurantId: v.restaurantId,
      version: v.version,
      label: `Published version ${v.version}`,
      createdAt: v.publishedAt.toISOString(),
    })),
  });
});

export const publicMenuRoutes = new Hono();
publicMenuRoutes.get("/", async (c) => {
  const restaurantId = c.req.param("restaurantId")!;
  const [restaurant, versions, categories, productRows, taxes] = await Promise.all([
    db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        logoUrl: restaurants.logoUrl,
        cuisineType: restaurants.cuisineType,
        currency: restaurants.currency,
        language: restaurants.language,
        timezone: restaurants.timezone,
      })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1),
    db
      .select()
      .from(menuThemeVersions)
      .where(eq(menuThemeVersions.restaurantId, restaurantId))
      .orderBy(sql`${menuThemeVersions.version} desc`)
      .limit(1),
    db
      .select()
      .from(menuCategories)
      .where(and(eq(menuCategories.restaurantId, restaurantId), isNull(menuCategories.archivedAt)))
      .orderBy(asc(menuCategories.position)),
    db
      .select()
      .from(products)
      .where(
        and(
          eq(products.restaurantId, restaurantId),
          eq(products.isAvailable, true),
          isNull(products.archivedAt),
        ),
      )
      .orderBy(asc(products.position)),
    db
      .select()
      .from(taxCategories)
      .where(and(eq(taxCategories.restaurantId, restaurantId), isNull(taxCategories.archivedAt))),
  ]);
  if (!restaurant.length || !versions.length)
    throw new ApiError(404, "PUBLISHED_MENU_NOT_FOUND", "This menu is not published yet.");
  const publicImageRows = productRows.length
    ? await db
        .select({
          productId: productImages.productId,
          position: productImages.position,
          url: mediaAssets.publicUrl,
        })
        .from(productImages)
        .innerJoin(mediaAssets, eq(mediaAssets.id, productImages.mediaId))
        .where(
          and(
            inArray(
              productImages.productId,
              productRows.map((product) => product.id),
            ),
            eq(mediaAssets.status, "ready"),
          ),
        )
        .orderBy(asc(productImages.position))
    : [];
  const publicImageMap = new Map<string, string[]>();
  for (const image of publicImageRows)
    if (image.url)
      publicImageMap.set(image.productId, [
        ...(publicImageMap.get(image.productId) ?? []),
        image.url,
      ]);
  const version = versions[0]!;
  return c.json(
    {
      data: {
        restaurant: restaurant[0],
        theme: themeDocument(
          version.document,
          restaurantId,
          version.version,
          version.publishedAt,
          true,
        ),
        categories: categories.map(mapCategory),
        products: productRows.map((p) => mapProduct(p, [], publicImageMap.get(p.id))),
        taxCategories: taxes.map(mapTax),
      },
    },
    200,
    {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      ETag: `\"menu-${restaurantId}-${version.version}\"`,
    },
  );
});
