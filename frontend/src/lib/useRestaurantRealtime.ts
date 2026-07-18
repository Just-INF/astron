import { useEffect } from "react";
import { API_BASE_URL } from "@/lib/api/client";
import { queryClient } from "@/lib/queryClient";

type RealtimeDomain =
  | "analytics"
  | "kitchen"
  | "layout"
  | "menu"
  | "orders"
  | "reservations"
  | "restaurant"
  | "service_requests";

type RealtimeEvent = {
  type: "invalidate";
  restaurantId: string;
  domains: RealtimeDomain[];
};

function realtimeUrl(restaurantId: string) {
  const url = new URL(API_BASE_URL, window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `/api/restaurants/${encodeURIComponent(restaurantId)}/realtime`;
  url.search = "";
  return url.toString();
}

function invalidateRestaurant(restaurantId: string, domains?: RealtimeDomain[]) {
  const requested = new Set(
    domains ?? [
      "analytics",
      "kitchen",
      "layout",
      "menu",
      "orders",
      "reservations",
      "restaurant",
      "service_requests",
    ],
  );
  if (requested.has("orders"))
    void queryClient.invalidateQueries({ queryKey: ["operations", restaurantId, "orders"] });
  if (requested.has("service_requests"))
    void queryClient.invalidateQueries({ queryKey: ["operations", restaurantId, "requests"] });
  if (requested.has("kitchen"))
    void queryClient.invalidateQueries({ queryKey: ["operations", restaurantId, "kitchen"] });
  if (requested.has("layout"))
    void queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "layout"] });
  if (requested.has("menu"))
    void queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "menu"] });
  if (requested.has("reservations"))
    void queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "reservations"] });
  if (requested.has("analytics"))
    void queryClient.invalidateQueries({ queryKey: ["analytics", restaurantId] });
  if (requested.has("restaurant")) void queryClient.invalidateQueries({ queryKey: ["session"] });
}

function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RealtimeEvent>;
  return (
    candidate.type === "invalidate" &&
    typeof candidate.restaurantId === "string" &&
    Array.isArray(candidate.domains)
  );
}

export function useRestaurantRealtime(restaurantId: string | null) {
  useEffect(() => {
    if (!restaurantId) return;
    const activeRestaurantId = restaurantId;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let stopped = false;
    let retry = 0;

    function clearHeartbeat() {
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    function connect() {
      if (
        stopped ||
        socket?.readyState === WebSocket.OPEN ||
        socket?.readyState === WebSocket.CONNECTING
      )
        return;
      socket = new WebSocket(realtimeUrl(activeRestaurantId));
      let didOpen = false;
      socket.addEventListener("open", () => {
        didOpen = true;
        retry = 0;
        invalidateRestaurant(activeRestaurantId);
        clearHeartbeat();
        heartbeatTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
        }, 25_000);
      });
      socket.addEventListener("message", (message) => {
        if (message.data === "pong") return;
        try {
          const event: unknown = JSON.parse(String(message.data));
          if (isRealtimeEvent(event) && event.restaurantId === activeRestaurantId)
            invalidateRestaurant(activeRestaurantId, event.domains);
        } catch {
          /* Ignore non-JSON control frames. */
        }
      });
      socket.addEventListener("close", () => {
        socket = null;
        clearHeartbeat();
        // Stop reconnecting if the handshake was rejected (402, 401, etc.)
        // or we've exhausted retries — the server won't accept us.
        if (stopped || !navigator.onLine || (!didOpen && retry >= 3)) return;
        const delay = Math.min(30_000, 750 * 2 ** Math.min(retry, 5));
        retry += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      });
    }

    function reconnectWhenOnline() {
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      connect();
    }

    window.addEventListener("online", reconnectWhenOnline);
    connect();
    return () => {
      stopped = true;
      window.removeEventListener("online", reconnectWhenOnline);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      clearHeartbeat();
      socket?.close(1000, "Restaurant changed");
    };
  }, [restaurantId]);
}
