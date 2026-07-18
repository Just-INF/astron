import { describe, expect, test } from "bun:test";
import { hasPaidAccess, planForVariant, plans } from "./entitlements";

const subscription = (status: string, endsAt: Date | null = null) =>
  ({ status, endsAt }) as Parameters<typeof hasPaidAccess>[0];
describe("billing access lifecycle", () => {
  test("allows trial, active, dunning, and unexpired cancellation grace", () => {
    expect(hasPaidAccess(subscription("on_trial"))).toBe(true);
    expect(hasPaidAccess(subscription("active"))).toBe(true);
    expect(hasPaidAccess(subscription("past_due"))).toBe(true);
    expect(hasPaidAccess(subscription("cancelled", new Date(Date.now() + 60_000)))).toBe(true);
  });
  test("removes paid access after expiry, unpaid, or cancellation end", () => {
    expect(hasPaidAccess(subscription("expired"))).toBe(false);
    expect(hasPaidAccess(subscription("unpaid"))).toBe(false);
    expect(hasPaidAccess(subscription("cancelled", new Date(Date.now() - 60_000)))).toBe(false);
  });
});

describe("billing plan entitlements", () => {
  test("maps every configured Lemon Squeezy variant to its advertised tier", () => {
    const variants = { table: "101", house: "202", group: "303" };
    expect(planForVariant("101", variants)).toBe("table");
    expect(planForVariant("202", variants)).toBe("house");
    expect(planForVariant("303", variants)).toBe("group");
    expect(planForVariant("legacy", variants)).toBe("house");
  });

  test("keeps capacity and feature boundaries distinct", () => {
    expect(plans.table).toMatchObject({
      restaurants: 1,
      membersPerRestaurant: 3,
      tablesPerRestaurant: 20,
    });
    expect(plans.table.features).not.toContain("orders");
    expect(plans.house).toMatchObject({
      restaurants: 1,
      membersPerRestaurant: 50,
      tablesPerRestaurant: null,
    });
    expect(plans.house.features).toContain("nora");
    expect(plans.group).toMatchObject({
      restaurants: 5,
      membersPerRestaurant: 250,
      tablesPerRestaurant: null,
    });
    expect(plans.group.features).toContain("multiRestaurant");
  });
});
