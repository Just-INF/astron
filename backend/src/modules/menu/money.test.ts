import { describe, expect, test } from "bun:test";
import { taxMinor, totalMinor } from "./money";

describe("integer money and tax", () => {
  test("rounds once in minor units", () => {
    expect(taxMinor(1_850, 1_900)).toBe(352);
    expect(totalMinor(1_850, 1_900)).toBe(2_202);
  });
  test("does not use binary-float currency arithmetic", () => {
    expect(totalMinor(10, 2_000)).toBe(12);
  });
});
