import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { db } from "./db/client";
import type { AppVariables } from "./lib/auth";
import { config } from "./lib/config";
import { ApiError, errorResponse } from "./lib/errors";
import { analyticsRoutes } from "./modules/analytics/routes";
import { authRoutes, meRoutes } from "./modules/auth/routes";
import { layoutRoutes } from "./modules/layout/routes";
import { mediaRoutes, publicMediaRoutes } from "./modules/media/routes";
import { menuRoutes, publicMenuRoutes } from "./modules/menu/routes";
import { noraRoutes } from "./modules/nora/routes";
import { orderRoutes, publicOrderRoutes } from "./modules/orders/routes";
import { publicReservationRoutes, reservationRoutes } from "./modules/reservations/routes";
import { restaurantRoutes } from "./modules/restaurants/routes";
import { billingRoutes } from "./modules/billing/routes";
import { pingRateLimitStore, rateLimit } from "./lib/rateLimit";
import { requireRestaurantSubscription } from "./lib/entitlements";
import { mcpManagementRoutes, mcpRoutes } from "./modules/mcp/routes";
import { publishRestaurantEvent, realtimeDomainsForMutation } from "./lib/realtime";

export const app = new Hono<{ Variables: AppVariables }>();
app.use("/*", async (c, next) => {
  const requestId = c.req.header("X-Request-Id")?.slice(0, 128) || crypto.randomUUID();
  c.header("X-Request-Id", requestId);
  const startedAt = performance.now();
  await next();
  const durationMs = performance.now() - startedAt,
    route = c.req.path.replace(/[a-z]+_[a-zA-Z0-9_-]+/g, ":id");
  c.header("Server-Timing", `app;dur=${durationMs.toFixed(1)}`);
  console.info(
    JSON.stringify({
      level: "info",
      event: "http_request",
      requestId,
      method: c.req.method,
      path: route,
      status: c.res.status,
      durationMs: Number(durationMs.toFixed(1)),
    }),
  );
});
app.use("/*", secureHeaders({ crossOriginResourcePolicy: "cross-origin" }));
app.use(
  "/api/*",
  cors({
    origin: config.FRONTEND_ORIGIN,
    credentials: true,
    allowHeaders: ["Content-Type", "Idempotency-Key"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);
app.use("/api/*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (origin && origin !== config.FRONTEND_ORIGIN)
      throw new ApiError(403, "CSRF_ORIGIN_REJECTED", "Request origin is not allowed.");
  }
  await next();
});
app.onError(errorResponse);
app.notFound((c) =>
  c.json(
    {
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "API route not found.",
      },
    },
    404,
  ),
);
app.get("/health/live", (c) => c.json({ status: "ok", service: "astron-api" }));
app.get("/health/ready", async (c) => {
  await db.execute("select 1");
  await pingRateLimitStore();
  return c.json({ status: "ok", database: "reachable", rateLimitStore: "reachable" });
});
app.get("/health", (c) => c.redirect("/health/ready", 307));
app.use("/api/auth/*", rateLimit("auth", 12, 15 * 60_000));
app.use("/api/public/*", rateLimit("public-write", 40, 60_000));
app.use("/api/restaurants/:restaurantId/nora/*", rateLimit("nora", 20, 60_000));
app.use("/mcp", rateLimit("mcp", 120, 60_000));
app.use("/api/restaurants/:restaurantId/*", async (c, next) => {
  const restaurantId = c.req.param("restaurantId")!;
  await requireRestaurantSubscription(restaurantId);
  await next();
  if (c.res.status < 400)
    publishRestaurantEvent(restaurantId, realtimeDomainsForMutation(c.req.path, c.req.method));
});
app.use("/api/public/restaurants/:restaurantId/*", async (c, next) => {
  const restaurantId = c.req.param("restaurantId")!;
  await requireRestaurantSubscription(restaurantId);
  await next();
  if (c.res.status < 400)
    publishRestaurantEvent(restaurantId, realtimeDomainsForMutation(c.req.path, c.req.method));
});
app.route("/api/auth", authRoutes);
app.route("/api/billing", billingRoutes);
app.route("/api/me", meRoutes);
app.route("/api/restaurants", restaurantRoutes);
app.route("/api/restaurants/:restaurantId/menu", menuRoutes);
app.route("/api/restaurants/:restaurantId", layoutRoutes);
app.route("/api/restaurants/:restaurantId", orderRoutes);
app.route("/api/restaurants/:restaurantId", reservationRoutes);
app.route("/api/restaurants/:restaurantId/analytics", analyticsRoutes);
app.route("/api/restaurants/:restaurantId", mediaRoutes);
app.route("/api/restaurants/:restaurantId/nora", noraRoutes);
app.route("/api/restaurants/:restaurantId/mcp", mcpManagementRoutes);
app.route("/mcp", mcpRoutes);
app.route("/api/public/restaurants/:restaurantId/menu", publicMenuRoutes);
app.route("/api/public/restaurants/:restaurantId", publicReservationRoutes);
app.route("/api/public/restaurants/:restaurantId", publicOrderRoutes);
app.route("/api/public/media", publicMediaRoutes);
