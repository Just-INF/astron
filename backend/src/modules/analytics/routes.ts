import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/client";
import { restaurants } from "../../db/schema";
import { requireAuth, requireMembership, type AppVariables } from "../../lib/auth";
import { ApiError } from "../../lib/errors";
import { requireRestaurantFeature } from "../../lib/entitlements";

const querySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((v) => v.from <= v.to, { message: "from must be on or before to" });
async function restaurantTimezone(restaurantId: string): Promise<string> {
  const [restaurant] = await db
    .select({ timezone: restaurants.timezone })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!restaurant) throw new ApiError(404, "RESTAURANT_NOT_FOUND", "Restaurant not found.");
  return restaurant.timezone;
}

const localRange = (
  column: "closed_at" | "o.closed_at",
  timezone: string,
  from: string,
  to: string,
) => {
  const field = sql.raw(column);
  return sql`(${field} at time zone ${timezone})::date >= ${from}::date and (${field} at time zone ${timezone})::date <= ${to}::date`;
};

export const analyticsRoutes = new Hono<{ Variables: AppVariables }>();
analyticsRoutes.use("/*", requireAuth);
analyticsRoutes.use("/*", requireMembership("analytics:read"));
analyticsRoutes.use("/*", async (c, next) => {
  await requireRestaurantFeature(c.req.param("restaurantId")!, "analytics");
  await next();
});

analyticsRoutes.get("/overview", async (c) => {
  const q = querySchema.parse(c.req.query()),
    restaurantId = c.req.param("restaurantId")!;
  const timezone = await restaurantTimezone(restaurantId);
  const result = await db.execute(
    sql`select count(*)::int as orders, coalesce(sum(total_minor),0)::int as revenue_minor, coalesce(avg(total_minor),0)::int as average_check_minor from orders where restaurant_id = ${restaurantId} and ${localRange("closed_at", timezone, q.from, q.to)}`,
  );
  return c.json({ data: result[0] });
});
analyticsRoutes.get("/revenue", async (c) => {
  const q = querySchema
      .extend({ interval: z.enum(["day", "week", "month"]).default("day") })
      .parse(c.req.query()),
    restaurantId = c.req.param("restaurantId")!;
  const timezone = await restaurantTimezone(restaurantId);
  const result = await db.execute(
    sql`select to_char(date_trunc(${q.interval}, closed_at at time zone ${timezone}), 'YYYY-MM-DD') as bucket, count(*)::int as orders, sum(total_minor)::int as revenue_minor from orders where restaurant_id = ${restaurantId} and ${localRange("closed_at", timezone, q.from, q.to)} group by 1 order by 1`,
  );
  return c.json({ data: result });
});
analyticsRoutes.get("/products", async (c) => {
  const q = querySchema.parse(c.req.query()),
    restaurantId = c.req.param("restaurantId")!;
  const timezone = await restaurantTimezone(restaurantId);
  const result = await db.execute(
    sql`select oi.product_id, oi.product_name as name, sum(oi.quantity)::int as quantity, sum(oi.total_minor)::int as revenue_minor from order_items oi join orders o on o.id=oi.order_id where o.restaurant_id = ${restaurantId} and ${localRange("o.closed_at", timezone, q.from, q.to)} group by oi.product_id, oi.product_name order by revenue_minor desc`,
  );
  return c.json({ data: result });
});
analyticsRoutes.get("/categories", async (c) => {
  const q = querySchema.parse(c.req.query()),
    restaurantId = c.req.param("restaurantId")!;
  const timezone = await restaurantTimezone(restaurantId);
  const result = await db.execute(
    sql`select oi.category_name as name, sum(oi.quantity)::int as quantity, sum(oi.total_minor)::int as revenue_minor from order_items oi join orders o on o.id=oi.order_id where o.restaurant_id=${restaurantId} and ${localRange("o.closed_at", timezone, q.from, q.to)} group by oi.category_name order by revenue_minor desc`,
  );
  return c.json({ data: result });
});
analyticsRoutes.get("/tables", async (c) => {
  const q = querySchema.parse(c.req.query()),
    restaurantId = c.req.param("restaurantId")!;
  const timezone = await restaurantTimezone(restaurantId);
  const result = await db.execute(
    sql`select o.table_id, coalesce(t.name,'Unassigned') as name, count(*)::int as orders, sum(o.total_minor)::int as revenue_minor from orders o left join dining_tables t on t.id=o.table_id where o.restaurant_id=${restaurantId} and ${localRange("o.closed_at", timezone, q.from, q.to)} group by o.table_id,t.name order by revenue_minor desc`,
  );
  return c.json({ data: result });
});
analyticsRoutes.get("/peak-hours", async (c) => {
  const q = querySchema.parse(c.req.query()),
    restaurantId = c.req.param("restaurantId")!;
  const timezone = await restaurantTimezone(restaurantId);
  const result = await db.execute(
    sql`select extract(isodow from closed_at at time zone ${timezone})::int as weekday, extract(hour from closed_at at time zone ${timezone})::int as hour, count(*)::int as orders from orders where restaurant_id=${restaurantId} and ${localRange("closed_at", timezone, q.from, q.to)} group by 1,2 order by 1,2`,
  );
  return c.json({ data: result });
});
analyticsRoutes.get("/taxes", async (c) => {
  const q = querySchema.parse(c.req.query()),
    restaurantId = c.req.param("restaurantId")!;
  const timezone = await restaurantTimezone(restaurantId);
  const result = await db.execute(
    sql`select oi.tax_rate_basis_points, sum(oi.tax_minor)::int as tax_minor, sum(oi.total_minor)::int as gross_minor from order_items oi join orders o on o.id=oi.order_id where o.restaurant_id=${restaurantId} and ${localRange("o.closed_at", timezone, q.from, q.to)} group by oi.tax_rate_basis_points order by oi.tax_rate_basis_points`,
  );
  return c.json({ data: result });
});
