import { describe, expect, test } from "bun:test";
import { emailRetryDelay } from "./email";

describe("email retry policy", () => {
  test("backs off exponentially and caps retries", () => {
    expect(emailRetryDelay(1)).toBe(30_000);
    expect(emailRetryDelay(2)).toBe(60_000);
    expect(emailRetryDelay(20)).toBe(6 * 3_600_000);
  });
});
