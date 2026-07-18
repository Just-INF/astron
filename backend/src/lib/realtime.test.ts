import { afterEach, describe, expect, test } from "bun:test";
import {
  attachRealtimePublisher,
  publishRestaurantEvent,
  realtimeDomainsForMutation,
} from "./realtime";

afterEach(() => attachRealtimePublisher(null));

describe("restaurant realtime events", () => {
  test("classifies successful mutation paths into focused domains", () => {
    expect(
      realtimeDomainsForMutation("/api/public/restaurants/rest_1/table-requests", "POST"),
    ).toEqual(["service_requests"]);
    expect(
      realtimeDomainsForMutation("/api/restaurants/rest_1/reservations/res_1", "PATCH"),
    ).toEqual(["reservations", "analytics"]);
    expect(
      realtimeDomainsForMutation("/api/restaurants/rest_1/kitchen/items/item_1/status", "PATCH"),
    ).toEqual(["orders", "kitchen", "layout", "analytics"]);
    expect(realtimeDomainsForMutation("/api/restaurants/rest_1/reservations", "GET")).toEqual([]);
  });

  test("publishes one deduplicated event to the restaurant topic", () => {
    const messages: Array<{ topic: string; payload: string }> = [];
    attachRealtimePublisher({
      publish(topic, payload) {
        messages.push({ topic, payload: String(payload) });
        return 1;
      },
    });
    expect(publishRestaurantEvent("rest_1", ["orders", "orders", "kitchen"])).toBe(1);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.topic).toBe("restaurant:rest_1");
    expect(JSON.parse(messages[0]!.payload)).toMatchObject({
      type: "invalidate",
      restaurantId: "rest_1",
      domains: ["orders", "kitchen"],
    });
  });
});
