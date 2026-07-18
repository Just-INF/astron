import { describe, expect, test } from "bun:test";
import { orphanMediaKeys } from "./orphanMedia";

describe("orphan media reconciliation", () => {
  test("keeps referenced and recent files while selecting old unreferenced files", () => {
    const files = [
      { key: "restaurant/used.jpg", modifiedAt: new Date("2026-01-01") },
      { key: "restaurant/orphan.jpg", modifiedAt: new Date("2026-01-01") },
      { key: "restaurant/uploading.jpg", modifiedAt: new Date("2026-01-03") },
    ];
    expect(orphanMediaKeys(files, ["restaurant/used.jpg"], new Date("2026-01-02"))).toEqual([
      "restaurant/orphan.jpg",
    ]);
  });
});
