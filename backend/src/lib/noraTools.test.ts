import { describe, expect, test } from "bun:test";
import {
  mcpToolDefinitions,
  menuPrice,
  noraToolDefinitions,
  priceMinorFromTaxIncluded,
} from "./noraTools";
import { searchNoraHelp } from "./noraHelp";
import { contradictsToolCatalog } from "../modules/nora/routes";

describe("Nora and MCP tool catalog", () => {
  test("shares complete menu setup and approval-controlled mutation tools", () => {
    const noraNames = noraToolDefinitions.map((tool) => tool.function.name);
    const mcpNames = mcpToolDefinitions.map((tool) => tool.name);
    const categoryTools = [
      "get_menu_setup",
      "get_capabilities",
      "get_menu_categories",
      "get_tax_categories",
      "get_reservation_settings",
      "get_operations_snapshot",
      "get_team_members",
      "search_help",
      "propose_create_category",
      "propose_update_category",
      "propose_delete_category",
      "propose_create_tax_category",
      "propose_update_tax_category",
      "propose_delete_tax_category",
      "propose_create_menu_item",
      "propose_update_menu_item",
      "propose_delete_menu_item",
      "propose_create_table",
      "propose_update_table",
      "propose_delete_table",
      "propose_create_reservation",
      "propose_update_reservation",
      "propose_reschedule_reservation",
      "propose_cancel_reservation",
      "propose_update_reservation_settings",
    ];

    for (const name of categoryTools) {
      expect(noraNames).toContain(name);
      expect(mcpNames).toContain(name);
    }
    expect(new Set(noraNames).size).toBe(noraNames.length);
  });

  test("warns clients that category deletion also removes its products from the live menu", () => {
    const tool = mcpToolDefinitions.find(
      (definition) => definition.name === "propose_delete_category",
    );
    expect(tool?.description).toContain("archives the category");
    expect(tool?.description).toContain("every active menu item");
  });

  test("keeps database identifiers out of the Nora and MCP contract", () => {
    const catalog = JSON.stringify(mcpToolDefinitions);
    for (const internalField of [
      "categoryId",
      "taxCategoryId",
      "productId",
      "tableId",
      "reservationId",
      "userId",
    ]) {
      expect(catalog).not.toContain(internalField);
    }
    const createItem = mcpToolDefinitions.find(
      (definition) => definition.name === "propose_create_menu_item",
    );
    expect(JSON.stringify(createItem?.inputSchema)).toContain("categoryName");
    expect(JSON.stringify(createItem?.inputSchema)).toContain("taxCategoryName");
  });

  test("converts a tax-included guest price into stable minor-unit pricing", () => {
    const beforeTaxMinor = priceMinorFromTaxIncluded(25, 2_000);
    expect(beforeTaxMinor).toBe(2_083);
    expect(menuPrice(beforeTaxMinor, 2_000).priceIncludingTax).toBe(25);
  });

  test("finds operator guidance without exposing implementation documents", () => {
    const [topic] = searchNoraHelp("create a pizza category");
    expect(topic?.id).toBe("menu-categories");
    expect(topic?.route).toBe("/dashboard/menu");
  });

  test("detects stale model capability denials so the chat loop can retry", () => {
    expect(
      contradictsToolCatalog("I don't have a tool available to create a new menu category."),
    ).toBe(true);
    expect(contradictsToolCatalog("Your role does not permit this change.")).toBe(false);
  });
});
