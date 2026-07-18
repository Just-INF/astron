import { describe, expect, it } from "vitest";
import { tableSelectionError } from "./reservationValidation";

describe("tableSelectionError", () => {
  it("blocks progress when no table is selected", () => {
    expect(tableSelectionError(null, ["table-1"])).toBe("Please select a table to continue.");
  });

  it("allows progress when the selected table is still bookable", () => {
    expect(tableSelectionError("table-1", ["table-1", "table-2"])).toBeNull();
  });

  it("blocks a table that expires while guest details are being completed", () => {
    expect(tableSelectionError("table-1", ["table-2"])).toBe(
      "That table is no longer available. Please select another table.",
    );
  });
});
