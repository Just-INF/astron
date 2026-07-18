import { describe, expect, test } from "bun:test";
import { can } from "../../lib/permissions";
import { canAdvanceKitchenItem, deriveOrderStatus, isActiveServiceRequestStatus } from "./service";

describe("order lifecycle", () => {
  test("derives the overall order state from individual items", () => {
    expect(deriveOrderStatus(["not_taken", "not_taken"])).toBe("new");
    expect(deriveOrderStatus(["preparing", "not_taken"])).toBe("in_progress");
    expect(deriveOrderStatus(["done", "preparing"])).toBe("in_progress");
    expect(deriveOrderStatus(["done", "done"])).toBe("ready");
  });

  test("accepts only forward kitchen transitions", () => {
    expect(canAdvanceKitchenItem("not_taken", "preparing")).toBe(true);
    expect(canAdvanceKitchenItem("preparing", "done")).toBe(true);
    expect(canAdvanceKitchenItem("not_taken", "done")).toBe(false);
    expect(canAdvanceKitchenItem("done", "preparing")).toBe(false);
  });

  test("recognizes duplicate-blocking active request states", () => {
    expect(isActiveServiceRequestStatus("new")).toBe(true);
    expect(isActiveServiceRequestStatus("acknowledged")).toBe(true);
    expect(isActiveServiceRequestStatus("completed")).toBe(false);
  });

  test("enforces waiter, chef, and viewer permissions", () => {
    expect(can("waiter", "orders:write")).toBe(true);
    expect(can("waiter", "kitchen:write")).toBe(false);
    expect(can("chef", "kitchen:write")).toBe(true);
    expect(can("chef", "orders:write")).toBe(false);
    expect(can("viewer", "orders:read")).toBe(false);
  });
});
