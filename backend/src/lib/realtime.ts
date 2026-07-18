import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { restaurantMemberships } from "../db/schema";
import { authenticatedUserForToken } from "./auth";
import { config } from "./config";
import { requireRestaurantSubscription } from "./entitlements";
import { can } from "./permissions";

export type RealtimeDomain =
  | "analytics"
  | "kitchen"
  | "layout"
  | "menu"
  | "orders"
  | "reservations"
  | "restaurant"
  | "service_requests";

export type RestaurantRealtimeEvent = {
  type: "invalidate";
  id: string;
  restaurantId: string;
  domains: RealtimeDomain[];
  occurredAt: string;
};

export type RealtimeSocketData = {
  restaurantId: string;
  userId: string;
};

type RealtimePublisher = Pick<Bun.Server<RealtimeSocketData>, "publish">;
let publisher: RealtimePublisher | null = null;
const sockets = new Set<Bun.ServerWebSocket<RealtimeSocketData>>();

function topic(restaurantId: string) {
  return `restaurant:${restaurantId}`;
}

export function attachRealtimePublisher(server: RealtimePublisher | null) {
  publisher = server;
}

export function publishRestaurantEvent(restaurantId: string, domains: RealtimeDomain[]) {
  if (!publisher || domains.length === 0) return 0;
  const event: RestaurantRealtimeEvent = {
    type: "invalidate",
    id: crypto.randomUUID(),
    restaurantId,
    domains: [...new Set(domains)],
    occurredAt: new Date().toISOString(),
  };
  return publisher.publish(topic(restaurantId), JSON.stringify(event));
}

export function realtimeDomainsForMutation(path: string, method: string): RealtimeDomain[] {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) return [];
  if (path.includes("/nora/proposals/"))
    return [
      "menu",
      "layout",
      "reservations",
      "orders",
      "kitchen",
      "service_requests",
      "restaurant",
      "analytics",
    ];
  if (path.includes("/table-requests") || path.includes("/service-requests"))
    return ["service_requests"];
  if (path.includes("/orders") || path.includes("/kitchen"))
    return ["orders", "kitchen", "layout", "analytics"];
  if (path.includes("/reservations") || path.includes("/reservation-"))
    return ["reservations", "analytics"];
  if (path.includes("/layout") || path.includes("/floor-plan")) return ["layout"];
  if (path.includes("/menu")) return ["menu"];
  if (path.includes("/members") || path.includes("/transfer-ownership")) return ["restaurant"];
  if (/\/api\/restaurants\/[^/]+\/?$/.test(path))
    return ["restaurant", "menu", "layout", "reservations", "service_requests"];
  return [];
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const pair of cookie.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    const raw = pair.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

function realtimeRestaurantId(pathname: string) {
  const match = pathname.match(/^\/api\/restaurants\/([^/]+)\/realtime\/?$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { status, code, message } }, { status });
}

export async function handleRealtimeUpgrade(
  request: Request,
  server: Bun.Server<RealtimeSocketData>,
): Promise<Response | undefined | null> {
  const restaurantId = realtimeRestaurantId(new URL(request.url).pathname);
  if (!restaurantId) return null;
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
    return errorResponse(
      426,
      "WEBSOCKET_UPGRADE_REQUIRED",
      "Open this endpoint as a WebSocket connection.",
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== config.FRONTEND_ORIGIN)
    return errorResponse(403, "ORIGIN_REJECTED", "WebSocket origin is not allowed.");
  const user = await authenticatedUserForToken(cookieValue(request, config.SESSION_COOKIE_NAME));
  if (!user) return errorResponse(401, "AUTH_REQUIRED", "Please sign in to open live updates.");
  try {
    await requireRestaurantSubscription(restaurantId);
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error ? Number(error.status) : 402;
    return errorResponse(
      status,
      "SUBSCRIPTION_REQUIRED",
      "An active subscription is required for live updates.",
    );
  }
  const [membership] = await db
    .select({ role: restaurantMemberships.role })
    .from(restaurantMemberships)
    .where(
      and(
        eq(restaurantMemberships.restaurantId, restaurantId),
        eq(restaurantMemberships.userId, user.id),
      ),
    )
    .limit(1);
  if (!membership || !can(membership.role, "restaurant:read"))
    return errorResponse(
      403,
      "RESTAURANT_ACCESS_DENIED",
      "You do not have access to this restaurant.",
    );
  const upgraded = server.upgrade(request, { data: { restaurantId, userId: user.id } });
  return upgraded
    ? undefined
    : errorResponse(400, "WEBSOCKET_UPGRADE_FAILED", "The live connection could not be opened.");
}

export const realtimeWebsocketHandler: Bun.WebSocketHandler<RealtimeSocketData> = {
  data: {} as RealtimeSocketData,
  idleTimeout: 70,
  maxPayloadLength: 1024,
  open(ws) {
    sockets.add(ws);
    ws.subscribe(topic(ws.data.restaurantId));
    ws.send(
      JSON.stringify({
        type: "connected",
        restaurantId: ws.data.restaurantId,
        occurredAt: new Date().toISOString(),
      }),
    );
  },
  message(ws, message) {
    if (message === "ping") ws.send("pong");
  },
  close(ws) {
    sockets.delete(ws);
    ws.unsubscribe(topic(ws.data.restaurantId));
  },
};

export function closeRealtimeSockets() {
  for (const socket of sockets) socket.close(1012, "Server restarting");
  sockets.clear();
}
