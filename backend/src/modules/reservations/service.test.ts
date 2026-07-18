import { describe, expect, test } from "bun:test";
import { assertWithinHours, localInterval, rangesOverlap } from "./service";

const settings = {
  maxStayMinutes: 120,
  slotMinutes: 30,
  is24_7: false,
  weeklyHours: Object.fromEntries(
    Array.from({ length: 7 }, (_, day) => [day, { open: "11:00", close: "23:00", closed: false }]),
  ),
};

describe("authoritative reservation validation", () => {
  test("accepts a slot inside restaurant-local hours and converts to UTC", () => {
    const interval = assertWithinHours("2026-07-15", "19:00", 120, "Europe/Bucharest", settings);
    expect(interval.startAt.toISOString()).toBe("2026-07-15T16:00:00.000Z");
  });
  test("rejects a Europe/Bucharest DST gap", () => {
    expect(() => localInterval("2026-03-29", "03:30", 60, "Europe/Bucharest")).toThrow();
  });
  test("uses half-open overlap ranges", () => {
    expect(
      rangesOverlap(
        new Date("2026-01-01T10:00Z"),
        new Date("2026-01-01T12:00Z"),
        new Date("2026-01-01T12:00Z"),
        new Date("2026-01-01T13:00Z"),
      ),
    ).toBe(false);
    expect(
      rangesOverlap(
        new Date("2026-01-01T10:00Z"),
        new Date("2026-01-01T12:00Z"),
        new Date("2026-01-01T11:59Z"),
        new Date("2026-01-01T13:00Z"),
      ),
    ).toBe(true);
  });
});
