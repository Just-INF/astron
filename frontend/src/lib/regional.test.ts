import { describe, expect, test } from "vitest";
import { addDaysToDateKey, currencyOptions, restaurantDateKey, timeZoneOptions } from "./regional";

describe("restaurant regional settings", () => {
  test("uses the restaurant timezone for its service date", () => {
    const instant = new Date("2026-01-01T22:30:00.000Z");
    expect(restaurantDateKey("Europe/Bucharest", instant)).toBe("2026-01-02");
    expect(restaurantDateKey("America/New_York", instant)).toBe("2026-01-01");
  });

  test("moves calendar dates without depending on the device timezone", () => {
    expect(addDaysToDateKey("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  test("exposes runtime-supported ISO currencies and IANA timezones", () => {
    expect(currencyOptions().some((option) => option.value === "EUR")).toBe(true);
    expect(currencyOptions().some((option) => option.value === "USD")).toBe(true);
    expect(timeZoneOptions().some((option) => option.value === "UTC")).toBe(true);
    expect(timeZoneOptions().some((option) => option.value === "Europe/Bucharest")).toBe(true);
  });
});
