import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  max,
  ne,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import {
  assistantActionProposals,
  assistantConversations,
  auditLogs,
  diningTables,
  floorLayouts,
  menuCategories,
  orderItems,
  orders,
  products,
  reservations,
  reservationSettings,
  restaurantMemberships,
  restaurants,
  serviceRequests,
  taxCategories,
  users,
} from "../db/schema";
import { ApiError } from "./errors";
import {
  sendReservationCancellation,
  sendReservationConfirmation,
  sendReservationRescheduled,
} from "./email";
import { createId, randomToken, sha256 } from "./ids";
import { noraHelpTopics, searchNoraHelp } from "./noraHelp";
import { can, type MembershipRole, type Permission } from "./permissions";
import { assertWithinHours, type ReservationSettingsValue } from "../modules/reservations/service";

type JsonSchema = Record<string, unknown>;
export type NoraToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: JsonSchema };
};

const object = (properties: JsonSchema, required: string[] = []): JsonSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const string = (description: string): JsonSchema => ({ type: "string", description });
const number = (description: string): JsonSchema => ({ type: "number", description });

export const noraToolDefinitions: NoraToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_capabilities",
      description:
        "List Nora and MCP's current authoritative tools. Use this before saying a requested capability is unavailable.",
      parameters: object({}),
    },
  },
  {
    type: "function",
    function: {
      name: "get_restaurant_overview",
      description: "Read the current restaurant identity and operating settings.",
      parameters: object({}),
    },
  },
  {
    type: "function",
    function: {
      name: "get_menu_setup",
      description:
        "Read the authoritative menu setup in one call: restaurant currency, active categories, tax categories with percentage rates, and active products with pre-tax and tax-included prices. Use this before creating or editing menu data.",
      parameters: object({}),
    },
  },
  {
    type: "function",
    function: {
      name: "get_menu_categories",
      description: "Read active menu categories by name, with descriptions and display order.",
      parameters: object({}),
    },
  },
  {
    type: "function",
    function: {
      name: "get_tax_categories",
      description:
        "Read active tax categories by name and percentage rate. Use this before pricing a menu item.",
      parameters: object({}),
    },
  },
  {
    type: "function",
    function: {
      name: "search_menu",
      description:
        "Search active menu products. Use a blank query only when the user explicitly asks for the whole menu.",
      parameters: object({
        query: string("Name or description search; may be blank"),
        limit: { type: "integer", minimum: 1, maximum: 30 },
      }),
    },
  },
  {
    type: "function",
    function: {
      name: "get_floor_plan",
      description: "Read tables, capacities, positions and live statuses.",
      parameters: object({}),
    },
  },
  {
    type: "function",
    function: {
      name: "get_reservations",
      description: "Read a bounded reservation list for a date range.",
      parameters: object(
        {
          from: string("YYYY-MM-DD"),
          to: string("YYYY-MM-DD"),
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
        ["from", "to"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "get_reservation_settings",
      description: "Read booking duration, slot interval, 24/7 state, and weekly opening hours.",
      parameters: object({}),
    },
  },
  {
    type: "function",
    function: {
      name: "get_operations_snapshot",
      description:
        "Read bounded active orders, service requests, and kitchen preparation items for the current restaurant.",
      parameters: object({ limit: { type: "integer", minimum: 1, maximum: 100 } }),
    },
  },
  {
    type: "function",
    function: {
      name: "get_team_members",
      description:
        "Read current restaurant team members and roles when the caller has team access.",
      parameters: object({}),
    },
  },
  {
    type: "function",
    function: {
      name: "get_analytics_summary",
      description: "Read compact completed-order totals for a date range.",
      parameters: object({ from: string("YYYY-MM-DD"), to: string("YYYY-MM-DD") }, ["from", "to"]),
    },
  },
  {
    type: "function",
    function: {
      name: "search_help",
      description:
        "Search Astron's operator help catalog. Use this when the user asks how to do something themselves or when a workflow is not available as a write tool.",
      parameters: object(
        {
          query: string("What the user wants help with"),
          limit: { type: "integer", minimum: 1, maximum: 10 },
        },
        ["query"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_create_category",
      description:
        "Prepare a new menu category for human approval. This does not change data until approved.",
      parameters: object(
        {
          name: string("Category name"),
          description: string("Optional guest-facing category description"),
        },
        ["name"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_update_category",
      description:
        "Prepare name or description changes to an existing menu category for human approval.",
      parameters: object(
        {
          categoryName: string("Current category name"),
          newName: string("New category name"),
          description: string("New guest-facing category description"),
        },
        ["categoryName"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_delete_category",
      description:
        "Prepare deletion of an existing menu category for human approval. Approval archives the category and every active menu item in it, removing them from the live menu.",
      parameters: object({ categoryName: string("Category name") }, ["categoryName"]),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_create_tax_category",
      description: "Prepare a new tax category and percentage rate for human approval.",
      parameters: object(
        {
          name: string("Tax category name, for example Standard VAT"),
          ratePercentage: number("Tax percentage from 0 through 100"),
        },
        ["name", "ratePercentage"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_update_tax_category",
      description:
        "Prepare name or percentage changes to an existing tax category for human approval.",
      parameters: object(
        {
          taxCategoryName: string("Current tax category name"),
          newName: string("New tax category name"),
          ratePercentage: number("New tax percentage from 0 through 100"),
        },
        ["taxCategoryName"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_delete_tax_category",
      description:
        "Prepare archival of an unused tax category for human approval. Tax categories assigned to active products cannot be deleted.",
      parameters: object({ taxCategoryName: string("Tax category name") }, ["taxCategoryName"]),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_create_menu_item",
      description:
        "Prepare a new menu item for human approval. First call get_menu_setup. Use category and tax names. Provide exactly one of priceBeforeTax or priceIncludingTax; the server calculates the stored price using the selected tax rate.",
      parameters: object(
        {
          name: string("Menu item name"),
          description: string("Guest-facing description"),
          categoryName: string("Existing category name"),
          taxCategoryName: string("Existing tax category name"),
          priceBeforeTax: number("Price before tax; do not provide with priceIncludingTax"),
          priceIncludingTax: number(
            "Final guest price including tax; do not provide with priceBeforeTax",
          ),
          isAvailable: { type: "boolean" },
        },
        ["name", "categoryName", "taxCategoryName"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_update_menu_item",
      description:
        "Prepare changes to an existing menu item for human approval. Identify it by its current item and category names. For a price change provide exactly one of priceBeforeTax or priceIncludingTax.",
      parameters: object(
        {
          productName: string("Current menu item name"),
          categoryName: string("Current category name"),
          newName: string("New item name"),
          description: string("New description"),
          priceBeforeTax: number("New pre-tax price"),
          priceIncludingTax: number("New final guest price including tax"),
          isAvailable: { type: "boolean" },
          newCategoryName: string("Destination category name"),
          newTaxCategoryName: string("New tax category name"),
        },
        ["productName", "categoryName"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_delete_menu_item",
      description:
        "Prepare archival of an existing menu item for human approval, removing it from the live menu. Identify it by item and category name.",
      parameters: object(
        { productName: string("Menu item name"), categoryName: string("Category name") },
        ["productName", "categoryName"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_create_table",
      description: "Prepare a new floor-plan table for human approval.",
      parameters: object(
        {
          name: string("Table name"),
          capacity: { type: "integer", minimum: 1, maximum: 100 },
          shape: { type: "string", enum: ["circle", "square", "rectangle"] },
          status: { type: "string", enum: ["available", "occupied", "reserved"] },
          x: number("X position"),
          y: number("Y position"),
          z: number("Z position"),
          rotation: number("Rotation in degrees"),
          linked: {
            type: "boolean",
            description: "Whether guest links and reservations may use this table",
          },
          width: number("Optional width"),
          depth: number("Optional depth"),
        },
        ["name", "capacity", "shape", "x", "y"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_update_table",
      description:
        "Prepare table name, capacity, shape, state, guest-link, size, rotation, or position changes for human approval.",
      parameters: object(
        {
          tableName: string("Current table name"),
          newName: string("New table name"),
          capacity: { type: "integer", minimum: 1, maximum: 100 },
          shape: { type: "string", enum: ["circle", "square", "rectangle"] },
          status: { type: "string", enum: ["available", "occupied", "reserved"] },
          x: number("New X position"),
          y: number("New Y position"),
          z: number("New Z position"),
          rotation: number("New rotation in degrees"),
          linked: { type: "boolean" },
          width: number("New width"),
          depth: number("New depth"),
        },
        ["tableName"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_delete_table",
      description:
        "Prepare permanent removal of a floor-plan table for human approval. Tables with reservation or order history cannot be deleted; unlink them instead.",
      parameters: object({ tableName: string("Table name") }, ["tableName"]),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_create_reservation",
      description:
        "Prepare a staff reservation for human approval. Approval revalidates hours, capacity, table availability, and conflicts, then emails the guest when an email is supplied.",
      parameters: object(
        {
          tableName: string("Table name"),
          guestName: string("Guest name"),
          partySize: { type: "integer", minimum: 1, maximum: 100 },
          date: string("YYYY-MM-DD in the restaurant timezone"),
          startTime: string("HH:MM in the restaurant timezone"),
          email: string("Optional guest email"),
          phone: string("Optional guest phone"),
          notes: string("Optional internal notes"),
        },
        ["tableName", "guestName", "partySize", "date", "startTime"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_update_reservation",
      description:
        "Prepare guest-detail, party-size, notes, or status changes for approval. Identify the reservation by its current guest, date, and time. Use the reschedule or cancel tool for those workflows.",
      parameters: object(
        {
          reservationGuestName: string("Current guest name"),
          reservationDate: string("Current YYYY-MM-DD date"),
          reservationStartTime: string("Current HH:MM time"),
          newGuestName: string("New guest name"),
          partySize: { type: "integer", minimum: 1, maximum: 100 },
          email: string("New guest email"),
          phone: string("New guest phone"),
          notes: string("New notes"),
          status: { type: "string", enum: ["confirmed", "seated", "completed"] },
        },
        ["reservationGuestName", "reservationDate", "reservationStartTime"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_reschedule_reservation",
      description:
        "Prepare a reservation table/date/time change for approval. Identify the reservation by its current guest, date, and time. Approval revalidates hours, capacity, and conflicts and notifies the guest by email.",
      parameters: object(
        {
          reservationGuestName: string("Current guest name"),
          reservationDate: string("Current YYYY-MM-DD date"),
          reservationStartTime: string("Current HH:MM time"),
          newTableName: string("Destination table name"),
          newDate: string("New YYYY-MM-DD date"),
          newStartTime: string("New HH:MM time"),
        },
        [
          "reservationGuestName",
          "reservationDate",
          "reservationStartTime",
          "newTableName",
          "newDate",
          "newStartTime",
        ],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_cancel_reservation",
      description:
        "Prepare reservation cancellation for human approval and notify the guest by email when available. Identify it by current guest, date, and time.",
      parameters: object(
        {
          reservationGuestName: string("Current guest name"),
          reservationDate: string("Current YYYY-MM-DD date"),
          reservationStartTime: string("Current HH:MM time"),
        },
        ["reservationGuestName", "reservationDate", "reservationStartTime"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_update_reservation_settings",
      description:
        "Prepare booking duration, slot interval, or 24/7 availability changes for human approval. Weekly hours can be configured manually from the Reservations workspace.",
      parameters: object({
        maxStayMinutes: { type: "integer", minimum: 15, maximum: 1440 },
        slotMinutes: { type: "integer", minimum: 5, maximum: 240 },
        is24_7: { type: "boolean" },
      }),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_update_restaurant",
      description: "Prepare safe restaurant-setting changes for human approval.",
      parameters: object({
        name: string("Restaurant name"),
        cuisineType: string("Cuisine description"),
        notes: string("Internal restaurant notes"),
        reservationsEnabled: { type: "boolean" },
        callWaiterEnabled: { type: "boolean" },
        requestCheckEnabled: { type: "boolean" },
      }),
    },
  },
];

export const mcpToolDefinitions = noraToolDefinitions.map((tool) => ({
  name: tool.function.name,
  description: tool.function.description,
  inputSchema: tool.function.parameters,
}));

const dateRange = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((v) => v.from <= v.to);
const proposalSchemas = {
  propose_create_category: z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1_000).nullable().optional(),
  }),
  propose_update_category: z
    .object({
      categoryName: z.string().trim().min(1).max(120),
      newName: z.string().trim().min(1).max(120).optional(),
      description: z.string().trim().max(1_000).nullable().optional(),
    })
    .refine((v) => Object.keys(v).length > 1, "Include at least one change."),
  propose_delete_category: z.object({ categoryName: z.string().trim().min(1).max(120) }),
  propose_create_tax_category: z.object({
    name: z.string().trim().min(1).max(120),
    ratePercentage: z.number().min(0).max(100),
  }),
  propose_update_tax_category: z
    .object({
      taxCategoryName: z.string().trim().min(1).max(120),
      newName: z.string().trim().min(1).max(120).optional(),
      ratePercentage: z.number().min(0).max(100).optional(),
    })
    .refine((v) => Object.keys(v).length > 1, "Include at least one change."),
  propose_delete_tax_category: z.object({ taxCategoryName: z.string().trim().min(1).max(120) }),
  propose_create_menu_item: z
    .object({
      name: z.string().trim().min(1).max(180),
      description: z.string().max(4_000).default(""),
      categoryName: z.string().trim().min(1).max(120),
      taxCategoryName: z.string().trim().min(1).max(120),
      priceBeforeTax: z.number().min(0).max(1_000_000).optional(),
      priceIncludingTax: z.number().min(0).max(1_000_000).optional(),
      isAvailable: z.boolean().default(true),
    })
    .refine(
      (v) => (v.priceBeforeTax === undefined) !== (v.priceIncludingTax === undefined),
      "Provide exactly one of priceBeforeTax or priceIncludingTax.",
    ),
  propose_update_menu_item: z
    .object({
      productName: z.string().trim().min(1).max(180),
      categoryName: z.string().trim().min(1).max(120),
      newName: z.string().trim().min(1).max(180).optional(),
      description: z.string().max(4_000).optional(),
      priceBeforeTax: z.number().min(0).max(1_000_000).optional(),
      priceIncludingTax: z.number().min(0).max(1_000_000).optional(),
      isAvailable: z.boolean().optional(),
      newCategoryName: z.string().trim().min(1).max(120).optional(),
      newTaxCategoryName: z.string().trim().min(1).max(120).optional(),
    })
    .refine((v) => Object.keys(v).length > 2, "Include at least one change.")
    .refine(
      (v) => v.priceBeforeTax === undefined || v.priceIncludingTax === undefined,
      "Provide only one price type.",
    ),
  propose_delete_menu_item: z.object({
    productName: z.string().trim().min(1).max(180),
    categoryName: z.string().trim().min(1).max(120),
  }),
  propose_create_table: z.object({
    name: z.string().trim().min(1).max(100),
    capacity: z.number().int().min(1).max(100),
    shape: z.enum(["circle", "square", "rectangle"]),
    status: z.enum(["available", "occupied", "reserved"]).default("available"),
    x: z.number().min(-100_000).max(100_000),
    y: z.number().min(-100_000).max(100_000),
    z: z.number().min(-100_000).max(100_000).default(0),
    rotation: z.number().finite().default(0),
    linked: z.boolean().default(true),
    width: z.number().positive().max(1_000).optional(),
    depth: z.number().positive().max(1_000).optional(),
  }),
  propose_update_table: z
    .object({
      tableName: z.string().trim().min(1).max(100),
      newName: z.string().trim().min(1).max(100).optional(),
      capacity: z.number().int().min(1).max(100).optional(),
      shape: z.enum(["circle", "square", "rectangle"]).optional(),
      status: z.enum(["available", "occupied", "reserved"]).optional(),
      x: z.number().min(-100_000).max(100_000).optional(),
      y: z.number().min(-100_000).max(100_000).optional(),
      z: z.number().min(-100_000).max(100_000).optional(),
      rotation: z.number().finite().optional(),
      linked: z.boolean().optional(),
      width: z.number().positive().max(1_000).nullable().optional(),
      depth: z.number().positive().max(1_000).nullable().optional(),
    })
    .refine((v) => Object.keys(v).length > 1, "Include at least one change."),
  propose_delete_table: z.object({ tableName: z.string().trim().min(1).max(100) }),
  propose_create_reservation: z.object({
    tableName: z.string().trim().min(1).max(100),
    guestName: z.string().trim().min(1).max(160),
    partySize: z.number().int().min(1).max(100),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    email: z.email().max(320).optional(),
    phone: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(2_000).optional(),
  }),
  propose_update_reservation: z
    .object({
      reservationGuestName: z.string().trim().min(1).max(160),
      reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reservationStartTime: z.string().regex(/^\d{2}:\d{2}$/),
      newGuestName: z.string().trim().min(1).max(160).optional(),
      partySize: z.number().int().min(1).max(100).optional(),
      email: z.email().max(320).nullable().optional(),
      phone: z.string().trim().max(40).nullable().optional(),
      notes: z.string().trim().max(2_000).nullable().optional(),
      status: z.enum(["confirmed", "seated", "completed"]).optional(),
    })
    .refine((v) => Object.keys(v).length > 3, "Include at least one change."),
  propose_reschedule_reservation: z.object({
    reservationGuestName: z.string().trim().min(1).max(160),
    reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reservationStartTime: z.string().regex(/^\d{2}:\d{2}$/),
    newTableName: z.string().trim().min(1).max(100),
    newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    newStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  propose_cancel_reservation: z.object({
    reservationGuestName: z.string().trim().min(1).max(160),
    reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reservationStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  propose_update_reservation_settings: z
    .object({
      maxStayMinutes: z.number().int().min(15).max(1_440).optional(),
      slotMinutes: z.number().int().min(5).max(240).optional(),
      is24_7: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, "Include at least one change."),
  propose_update_restaurant: z
    .object({
      name: z.string().trim().min(2).max(160).optional(),
      cuisineType: z.string().trim().max(120).optional(),
      notes: z.string().max(4_000).optional(),
      reservationsEnabled: z.boolean().optional(),
      callWaiterEnabled: z.boolean().optional(),
      requestCheckEnabled: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, "Include at least one change."),
} as const;

const requiredPermission: Record<keyof typeof proposalSchemas, Permission> = {
  propose_create_category: "menu:write",
  propose_update_category: "menu:write",
  propose_delete_category: "menu:write",
  propose_create_tax_category: "menu:write",
  propose_update_tax_category: "menu:write",
  propose_delete_tax_category: "menu:write",
  propose_create_menu_item: "menu:write",
  propose_update_menu_item: "menu:write",
  propose_delete_menu_item: "menu:write",
  propose_create_table: "layout:write",
  propose_update_table: "layout:write",
  propose_delete_table: "layout:write",
  propose_create_reservation: "reservations:write",
  propose_update_reservation: "reservations:write",
  propose_reschedule_reservation: "reservations:write",
  propose_cancel_reservation: "reservations:write",
  propose_update_reservation_settings: "reservations:write",
  propose_update_restaurant: "restaurant:update",
};

export function isProposalTool(name: string): name is keyof typeof proposalSchemas {
  return name in proposalSchemas;
}

type ResolvedReferences = {
  categoryId?: string;
  taxCategoryId?: string;
  productId?: string;
  tableId?: string;
  reservationId?: string;
};

function uniqueReference<T>(rows: T[], label: string): T {
  if (!rows.length)
    throw new ApiError(
      422,
      "NORA_NAME_NOT_FOUND",
      `No ${label} with that name was found in this restaurant.`,
    );
  if (rows.length > 1)
    throw new ApiError(
      409,
      "NORA_NAME_AMBIGUOUS",
      `More than one ${label} has that name. Rename the duplicates so Nora can identify it safely.`,
    );
  return rows[0]!;
}

async function resolveReferences(
  restaurantId: string,
  name: keyof typeof proposalSchemas,
  payload: Record<string, unknown>,
): Promise<ResolvedReferences> {
  const refs: ResolvedReferences = {};
  const categoryName = String(payload.newCategoryName ?? payload.categoryName ?? "");
  const taxName = String(payload.newTaxCategoryName ?? payload.taxCategoryName ?? "");
  const tableName = String(payload.newTableName ?? payload.tableName ?? "");
  if (categoryName) {
    const rows = await db
      .select({ id: menuCategories.id })
      .from(menuCategories)
      .where(
        and(
          eq(menuCategories.restaurantId, restaurantId),
          isNull(menuCategories.archivedAt),
          sql`lower(${menuCategories.name}) = lower(${categoryName})`,
        ),
      )
      .limit(2);
    refs.categoryId = uniqueReference(rows, `menu category named “${categoryName}”`).id;
  }
  if (taxName) {
    const rows = await db
      .select({ id: taxCategories.id })
      .from(taxCategories)
      .where(
        and(
          eq(taxCategories.restaurantId, restaurantId),
          isNull(taxCategories.archivedAt),
          sql`lower(${taxCategories.name}) = lower(${taxName})`,
        ),
      )
      .limit(2);
    refs.taxCategoryId = uniqueReference(rows, `tax category named “${taxName}”`).id;
  }
  if (tableName) {
    const rows = await db
      .select({ id: diningTables.id })
      .from(diningTables)
      .where(
        and(
          eq(diningTables.restaurantId, restaurantId),
          sql`lower(${diningTables.name}) = lower(${tableName})`,
        ),
      )
      .limit(2);
    refs.tableId = uniqueReference(rows, `table named “${tableName}”`).id;
  }
  if (name === "propose_update_menu_item" || name === "propose_delete_menu_item") {
    const productName = String(payload.productName),
      currentCategoryName = String(payload.categoryName);
    const rows = await db
      .select({ id: products.id })
      .from(products)
      .innerJoin(menuCategories, eq(menuCategories.id, products.categoryId))
      .where(
        and(
          eq(products.restaurantId, restaurantId),
          isNull(products.archivedAt),
          sql`lower(${products.name}) = lower(${productName})`,
          sql`lower(${menuCategories.name}) = lower(${currentCategoryName})`,
        ),
      )
      .limit(2);
    refs.productId = uniqueReference(
      rows,
      `menu item named “${productName}” in “${currentCategoryName}”`,
    ).id;
  }
  if (
    name === "propose_update_reservation" ||
    name === "propose_reschedule_reservation" ||
    name === "propose_cancel_reservation"
  ) {
    const guestName = String(payload.reservationGuestName),
      date = String(payload.reservationDate),
      startTime = String(payload.reservationStartTime);
    const rows = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, restaurantId),
          sql`lower(${reservations.guestName}) = lower(${guestName})`,
          eq(reservations.serviceDate, date),
          eq(reservations.localStartTime, startTime),
        ),
      )
      .limit(2);
    refs.reservationId = uniqueReference(
      rows,
      `reservation for “${guestName}” on ${date} at ${startTime}`,
    ).id;
  }
  return refs;
}

export function menuPrice(priceMinor: number, rateBasisPoints: number) {
  return {
    priceBeforeTax: priceMinor / 100,
    priceIncludingTax: Math.round(priceMinor * (1 + rateBasisPoints / 10_000)) / 100,
  };
}

export function priceMinorFromTaxIncluded(priceIncludingTax: number, rateBasisPoints: number) {
  return Math.round((priceIncludingTax * 100 * 10_000) / (10_000 + rateBasisPoints));
}

export async function createProposal(args: {
  restaurantId: string;
  userId: string;
  role: MembershipRole;
  conversationId?: string;
  toolName: keyof typeof proposalSchemas;
  input: unknown;
}) {
  if (!can(args.role, requiredPermission[args.toolName]))
    throw new ApiError(
      403,
      "NORA_ACTION_FORBIDDEN",
      "Your restaurant role cannot approve this kind of change.",
    );
  const payload = proposalSchemas[args.toolName].parse(args.input) as Record<string, unknown>;
  await resolveReferences(args.restaurantId, args.toolName, payload);
  let conversationId = args.conversationId;
  if (!conversationId) {
    conversationId = createId("conv");
    await db
      .insert(assistantConversations)
      .values({ id: conversationId, restaurantId: args.restaurantId, userId: args.userId });
  }
  const id = createId("proposal"),
    action = args.toolName.replace(/^propose_/, "").replaceAll("_", ".");
  await db
    .insert(assistantActionProposals)
    .values({ id, conversationId, restaurantId: args.restaurantId, action, payload });
  return { id, action, payload, status: "pending" as const, requiresApproval: true };
}

export async function runNoraTool(args: {
  restaurantId: string;
  userId: string;
  role: MembershipRole;
  conversationId?: string;
  name: string;
  input: unknown;
}) {
  const input = (args.input && typeof args.input === "object" ? args.input : {}) as Record<
    string,
    unknown
  >;
  if (isProposalTool(args.name)) return createProposal({ ...args, toolName: args.name, input });
  if (args.name === "get_capabilities") {
    return noraToolDefinitions
      .filter((tool) => tool.function.name !== "get_capabilities")
      .map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        kind: tool.function.name.startsWith("propose_") ? "approval_required_write" : "read",
      }));
  }
  if (args.name === "get_restaurant_overview") {
    if (!can(args.role, "restaurant:read"))
      throw new ApiError(403, "NORA_TOOL_FORBIDDEN", "Restaurant access is not allowed.");
    const [row] = await db
      .select({
        name: restaurants.name,
        cuisineType: restaurants.cuisineType,
        currency: restaurants.currency,
        language: restaurants.language,
        timezone: restaurants.timezone,
        reservationsEnabled: restaurants.reservationsEnabled,
        callWaiterEnabled: restaurants.callWaiterEnabled,
        requestCheckEnabled: restaurants.requestCheckEnabled,
      })
      .from(restaurants)
      .where(eq(restaurants.id, args.restaurantId))
      .limit(1);
    return row;
  }
  if (args.name === "get_menu_setup") {
    if (!can(args.role, "menu:read"))
      throw new ApiError(403, "NORA_TOOL_FORBIDDEN", "Menu access is not allowed.");
    const [restaurantRows, categories, taxes, productRows] = await Promise.all([
      db
        .select({ currency: restaurants.currency })
        .from(restaurants)
        .where(eq(restaurants.id, args.restaurantId))
        .limit(1),
      db
        .select({
          name: menuCategories.name,
          description: menuCategories.description,
          position: menuCategories.position,
        })
        .from(menuCategories)
        .where(
          and(
            eq(menuCategories.restaurantId, args.restaurantId),
            isNull(menuCategories.archivedAt),
          ),
        )
        .orderBy(asc(menuCategories.position))
        .limit(500),
      db
        .select({ name: taxCategories.name, rateBasisPoints: taxCategories.rateBasisPoints })
        .from(taxCategories)
        .where(
          and(eq(taxCategories.restaurantId, args.restaurantId), isNull(taxCategories.archivedAt)),
        )
        .orderBy(asc(taxCategories.name))
        .limit(100),
      db
        .select({
          name: products.name,
          description: products.description,
          categoryName: menuCategories.name,
          taxCategoryName: taxCategories.name,
          taxRateBasisPoints: taxCategories.rateBasisPoints,
          priceMinor: products.priceMinor,
          isAvailable: products.isAvailable,
        })
        .from(products)
        .innerJoin(menuCategories, eq(menuCategories.id, products.categoryId))
        .innerJoin(taxCategories, eq(taxCategories.id, products.taxCategoryId))
        .where(and(eq(products.restaurantId, args.restaurantId), isNull(products.archivedAt)))
        .orderBy(asc(products.position))
        .limit(1_000),
    ]);
    return {
      currency: restaurantRows[0]?.currency ?? "EUR",
      categories,
      taxCategories: taxes.map((tax) => ({
        name: tax.name,
        ratePercentage: tax.rateBasisPoints / 100,
      })),
      products: productRows.map(({ priceMinor, taxRateBasisPoints, ...product }) => ({
        ...product,
        ...menuPrice(priceMinor, taxRateBasisPoints),
      })),
    };
  }
  if (args.name === "get_menu_categories") {
    if (!can(args.role, "menu:read"))
      throw new ApiError(403, "NORA_TOOL_FORBIDDEN", "Menu access is not allowed.");
    return db
      .select({
        name: menuCategories.name,
        description: menuCategories.description,
        position: menuCategories.position,
      })
      .from(menuCategories)
      .where(
        and(eq(menuCategories.restaurantId, args.restaurantId), isNull(menuCategories.archivedAt)),
      )
      .orderBy(asc(menuCategories.position))
      .limit(500);
  }
  if (args.name === "get_tax_categories") {
    if (!can(args.role, "menu:read"))
      throw new ApiError(403, "NORA_TOOL_FORBIDDEN", "Menu access is not allowed.");
    const rows = await db
      .select({ name: taxCategories.name, rateBasisPoints: taxCategories.rateBasisPoints })
      .from(taxCategories)
      .where(
        and(eq(taxCategories.restaurantId, args.restaurantId), isNull(taxCategories.archivedAt)),
      )
      .orderBy(asc(taxCategories.name))
      .limit(100);
    return rows.map((row) => ({ name: row.name, ratePercentage: row.rateBasisPoints / 100 }));
  }
  if (args.name === "search_menu") {
    if (!can(args.role, "menu:read"))
      throw new ApiError(403, "NORA_TOOL_FORBIDDEN", "Menu access is not allowed.");
    const parsed = z
      .object({
        query: z.string().max(180).default(""),
        limit: z.number().int().min(1).max(30).default(12),
      })
      .parse(input);
    const condition = and(
      eq(products.restaurantId, args.restaurantId),
      isNull(products.archivedAt),
      parsed.query
        ? ilike(sql`${products.name} || ' ' || ${products.description}`, `%${parsed.query}%`)
        : undefined,
    );
    return db
      .select({
        name: products.name,
        description: products.description,
        categoryName: menuCategories.name,
        taxCategoryName: taxCategories.name,
        priceMinor: products.priceMinor,
        currency: products.currency,
        isAvailable: products.isAvailable,
      })
      .from(products)
      .innerJoin(menuCategories, eq(menuCategories.id, products.categoryId))
      .innerJoin(taxCategories, eq(taxCategories.id, products.taxCategoryId))
      .where(condition)
      .orderBy(asc(products.position))
      .limit(parsed.limit);
  }
  if (args.name === "get_floor_plan") {
    if (!can(args.role, "layout:read"))
      throw new ApiError(403, "NORA_TOOL_FORBIDDEN", "Floor-plan access is not allowed.");
    return db
      .select({
        name: diningTables.name,
        capacity: diningTables.capacity,
        shape: diningTables.shape,
        position: diningTables.position,
        status: diningTables.status,
        linked: diningTables.linked,
      })
      .from(diningTables)
      .where(eq(diningTables.restaurantId, args.restaurantId))
      .limit(200);
  }
  if (args.name === "get_reservations") {
    if (!can(args.role, "reservations:read"))
      throw new ApiError(403, "NORA_TOOL_FORBIDDEN", "Reservation access is not allowed.");
    const parsed = dateRange
      .extend({ limit: z.number().int().min(1).max(50).default(25) })
      .parse(input);
    return db
      .select({
        tableName: diningTables.name,
        guestName: reservations.guestName,
        partySize: reservations.partySize,
        serviceDate: reservations.serviceDate,
        localStartTime: reservations.localStartTime,
        status: reservations.status,
      })
      .from(reservations)
      .leftJoin(diningTables, eq(diningTables.id, reservations.tableId))
      .where(
        and(
          eq(reservations.restaurantId, args.restaurantId),
          gte(reservations.serviceDate, parsed.from),
          lte(reservations.serviceDate, parsed.to),
        ),
      )
      .orderBy(desc(reservations.startAt))
      .limit(parsed.limit);
  }
  if (args.name === "get_reservation_settings") {
    if (!can(args.role, "reservations:read"))
      throw new ApiError(403, "NORA_TOOL_FORBIDDEN", "Reservation access is not allowed.");
    const [row] = await db
      .select({
        maxStayMinutes: reservationSettings.maxStayMinutes,
        slotMinutes: reservationSettings.slotMinutes,
        is24_7: reservationSettings.is24_7,
        weeklyHours: reservationSettings.weeklyHours,
      })
      .from(reservationSettings)
      .where(eq(reservationSettings.restaurantId, args.restaurantId))
      .limit(1);
    return row;
  }
  if (args.name === "get_operations_snapshot") {
    const { limit } = z
      .object({ limit: z.number().int().min(1).max(100).default(30) })
      .parse(input);
    const [activeOrders, activeRequests, kitchenItems] = await Promise.all([
      can(args.role, "orders:read")
        ? db
            .select({
              tableName: diningTables.name,
              status: orders.status,
              totalMinor: orders.totalMinor,
              currency: orders.currency,
              notes: orders.notes,
              createdAt: orders.createdAt,
            })
            .from(orders)
            .leftJoin(diningTables, eq(diningTables.id, orders.tableId))
            .where(
              and(
                eq(orders.restaurantId, args.restaurantId),
                inArray(orders.status, ["new", "in_progress", "ready"]),
              ),
            )
            .orderBy(desc(orders.createdAt))
            .limit(limit)
        : Promise.resolve([]),
      can(args.role, "service-requests:read")
        ? db
            .select({
              tableName: diningTables.name,
              type: serviceRequests.type,
              status: serviceRequests.status,
              paymentMethod: serviceRequests.paymentMethod,
              notes: serviceRequests.notes,
              createdAt: serviceRequests.createdAt,
            })
            .from(serviceRequests)
            .innerJoin(diningTables, eq(diningTables.id, serviceRequests.tableId))
            .where(
              and(
                eq(serviceRequests.restaurantId, args.restaurantId),
                inArray(serviceRequests.status, ["new", "acknowledged"]),
              ),
            )
            .orderBy(asc(serviceRequests.createdAt))
            .limit(limit)
        : Promise.resolve([]),
      can(args.role, "kitchen:read")
        ? db
            .select({
              tableName: diningTables.name,
              productName: orderItems.productName,
              quantity: orderItems.quantity,
              status: orderItems.status,
              notes: orderItems.notes,
              createdAt: orderItems.createdAt,
            })
            .from(orderItems)
            .innerJoin(orders, eq(orders.id, orderItems.orderId))
            .leftJoin(diningTables, eq(diningTables.id, orders.tableId))
            .where(
              and(
                eq(orders.restaurantId, args.restaurantId),
                inArray(orderItems.status, ["not_taken", "preparing"]),
              ),
            )
            .orderBy(asc(orderItems.createdAt))
            .limit(limit)
        : Promise.resolve([]),
    ]);
    return {
      activeOrders,
      activeServiceRequests: activeRequests,
      activeKitchenItems: kitchenItems,
    };
  }
  if (args.name === "get_team_members") {
    if (!can(args.role, "members:read"))
      throw new ApiError(403, "NORA_TOOL_FORBIDDEN", "Team access is not allowed.");
    return db
      .select({ name: users.name, email: users.email, role: restaurantMemberships.role })
      .from(restaurantMemberships)
      .innerJoin(users, eq(users.id, restaurantMemberships.userId))
      .where(eq(restaurantMemberships.restaurantId, args.restaurantId))
      .orderBy(asc(users.name))
      .limit(500);
  }
  if (args.name === "get_analytics_summary") {
    if (!can(args.role, "analytics:read"))
      throw new ApiError(403, "NORA_TOOL_FORBIDDEN", "Analytics access is not allowed.");
    const parsed = dateRange.parse(input);
    const [row] = await db
      .select({
        orders: sql<number>`count(*)::int`,
        revenueMinor: sql<number>`coalesce(sum(${orders.totalMinor}), 0)::int`,
        averageCheckMinor: sql<number>`coalesce(avg(${orders.totalMinor}), 0)::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, args.restaurantId),
          gte(orders.closedAt, new Date(`${parsed.from}T00:00:00Z`)),
          lte(orders.closedAt, new Date(`${parsed.to}T23:59:59.999Z`)),
        ),
      );
    return row;
  }
  if (args.name === "search_help") {
    const parsed = z
      .object({
        query: z.string().trim().max(200),
        limit: z.number().int().min(1).max(10).default(5),
      })
      .parse(input);
    return {
      topics: searchNoraHelp(parsed.query, parsed.limit),
      availableTopics: noraHelpTopics.length,
    };
  }
  throw new ApiError(400, "UNKNOWN_NORA_TOOL", `Unknown Nora tool: ${args.name}`);
}

export async function executeProposal(
  proposal: typeof assistantActionProposals.$inferSelect,
  userId: string,
) {
  const payload = proposal.payload as Record<string, unknown>;
  const now = new Date();
  let afterCommit: (() => void) | undefined;
  try {
    const toolName =
      `propose_${proposal.action.replaceAll(".", "_")}` as keyof typeof proposalSchemas;
    const refs = await resolveReferences(proposal.restaurantId, toolName, payload);
    await db.transaction(async (tx) => {
      if (proposal.action === "create.category") {
        const parsed = proposalSchemas.propose_create_category.parse(payload);
        const [position] = await tx
          .select({ value: max(menuCategories.position) })
          .from(menuCategories)
          .where(
            and(
              eq(menuCategories.restaurantId, proposal.restaurantId),
              isNull(menuCategories.archivedAt),
            ),
          );
        await tx.insert(menuCategories).values({
          id: createId("cat"),
          restaurantId: proposal.restaurantId,
          name: parsed.name,
          description: parsed.description ?? null,
          position: (position?.value ?? -1) + 1,
        });
      } else if (proposal.action === "update.category") {
        const parsed = proposalSchemas.propose_update_category.parse(payload),
          { categoryName: _categoryName, newName, ...rest } = parsed,
          categoryId = refs.categoryId!;
        const patch = { ...rest, ...(newName !== undefined ? { name: newName } : {}) };
        const [updated] = await tx
          .update(menuCategories)
          .set({ ...patch, updatedAt: now })
          .where(
            and(
              eq(menuCategories.id, categoryId),
              eq(menuCategories.restaurantId, proposal.restaurantId),
              isNull(menuCategories.archivedAt),
            ),
          )
          .returning({ id: menuCategories.id });
        if (!updated)
          throw new ApiError(
            409,
            "NORA_TARGET_CHANGED",
            "The menu category no longer exists. Ask Nora to refresh the categories.",
          );
      } else if (proposal.action === "delete.category") {
        proposalSchemas.propose_delete_category.parse(payload);
        const categoryId = refs.categoryId!;
        const [archived] = await tx
          .update(menuCategories)
          .set({ archivedAt: now, updatedAt: now })
          .where(
            and(
              eq(menuCategories.id, categoryId),
              eq(menuCategories.restaurantId, proposal.restaurantId),
              isNull(menuCategories.archivedAt),
            ),
          )
          .returning({ id: menuCategories.id });
        if (!archived)
          throw new ApiError(
            409,
            "NORA_TARGET_CHANGED",
            "The menu category no longer exists. Ask Nora to refresh the categories.",
          );
        await tx
          .update(products)
          .set({ archivedAt: now, updatedAt: now })
          .where(
            and(
              eq(products.restaurantId, proposal.restaurantId),
              eq(products.categoryId, categoryId),
              isNull(products.archivedAt),
            ),
          );
      } else if (proposal.action === "create.tax.category") {
        const parsed = proposalSchemas.propose_create_tax_category.parse(payload);
        await tx.insert(taxCategories).values({
          id: createId("tax"),
          restaurantId: proposal.restaurantId,
          name: parsed.name,
          rateBasisPoints: Math.round(parsed.ratePercentage * 100),
        });
      } else if (proposal.action === "update.tax.category") {
        const parsed = proposalSchemas.propose_update_tax_category.parse(payload),
          { taxCategoryName: _taxCategoryName, newName, ratePercentage } = parsed,
          taxCategoryId = refs.taxCategoryId!;
        const [updated] = await tx
          .update(taxCategories)
          .set({
            ...(newName !== undefined ? { name: newName } : {}),
            ...(ratePercentage !== undefined
              ? { rateBasisPoints: Math.round(ratePercentage * 100) }
              : {}),
            updatedAt: now,
          })
          .where(
            and(
              eq(taxCategories.id, taxCategoryId),
              eq(taxCategories.restaurantId, proposal.restaurantId),
              isNull(taxCategories.archivedAt),
            ),
          )
          .returning({ id: taxCategories.id });
        if (!updated)
          throw new ApiError(
            409,
            "NORA_TARGET_CHANGED",
            "The tax category no longer exists. Ask Nora to refresh the menu setup.",
          );
      } else if (proposal.action === "delete.tax.category") {
        proposalSchemas.propose_delete_tax_category.parse(payload);
        const taxCategoryId = refs.taxCategoryId!;
        const [used] = await tx
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.restaurantId, proposal.restaurantId),
              eq(products.taxCategoryId, taxCategoryId),
              isNull(products.archivedAt),
            ),
          )
          .limit(1);
        if (used)
          throw new ApiError(
            409,
            "NORA_TAX_IN_USE",
            "This tax category is assigned to an active menu item. Reassign or archive those items first.",
          );
        const [archived] = await tx
          .update(taxCategories)
          .set({ archivedAt: now, updatedAt: now })
          .where(
            and(
              eq(taxCategories.id, taxCategoryId),
              eq(taxCategories.restaurantId, proposal.restaurantId),
              isNull(taxCategories.archivedAt),
            ),
          )
          .returning({ id: taxCategories.id });
        if (!archived)
          throw new ApiError(
            409,
            "NORA_TARGET_CHANGED",
            "The tax category no longer exists. Ask Nora to refresh the menu setup.",
          );
      } else if (proposal.action === "create.menu.item") {
        const parsed = proposalSchemas.propose_create_menu_item.parse(payload);
        const categoryId = refs.categoryId!,
          taxCategoryId = refs.taxCategoryId!;
        const [restaurant, position, tax] = await Promise.all([
          tx
            .select({ currency: restaurants.currency })
            .from(restaurants)
            .where(eq(restaurants.id, proposal.restaurantId))
            .limit(1),
          tx
            .select({ value: max(products.position) })
            .from(products)
            .where(
              and(
                eq(products.restaurantId, proposal.restaurantId),
                eq(products.categoryId, categoryId),
              ),
            ),
          tx
            .select({ rate: taxCategories.rateBasisPoints })
            .from(taxCategories)
            .where(
              and(
                eq(taxCategories.id, taxCategoryId),
                eq(taxCategories.restaurantId, proposal.restaurantId),
                isNull(taxCategories.archivedAt),
              ),
            )
            .limit(1),
        ]);
        if (!tax[0])
          throw new ApiError(
            409,
            "NORA_TARGET_CHANGED",
            "The selected tax category no longer exists. Ask Nora to refresh the menu setup.",
          );
        const priceMinor =
          parsed.priceBeforeTax !== undefined
            ? Math.round(parsed.priceBeforeTax * 100)
            : priceMinorFromTaxIncluded(parsed.priceIncludingTax!, tax[0].rate);
        await tx.insert(products).values({
          id: createId("prod"),
          restaurantId: proposal.restaurantId,
          categoryId,
          taxCategoryId,
          name: parsed.name,
          description: parsed.description,
          priceMinor,
          currency: restaurant[0]?.currency ?? "EUR",
          isAvailable: parsed.isAvailable,
          position: (position[0]?.value ?? -1) + 1,
        });
      } else if (proposal.action === "update.menu.item") {
        const parsed = proposalSchemas.propose_update_menu_item.parse(payload),
          {
            productName: _productName,
            categoryName: _categoryName,
            newName,
            newCategoryName,
            newTaxCategoryName,
            priceBeforeTax,
            priceIncludingTax,
            ...rest
          } = parsed,
          productId = refs.productId!;
        const [current] = await tx
          .select({ taxCategoryId: products.taxCategoryId })
          .from(products)
          .where(
            and(
              eq(products.id, productId),
              eq(products.restaurantId, proposal.restaurantId),
              isNull(products.archivedAt),
            ),
          )
          .limit(1);
        if (!current)
          throw new ApiError(
            409,
            "NORA_TARGET_CHANGED",
            "The menu item no longer exists. Ask Nora to refresh the menu.",
          );
        let priceMinor: number | undefined;
        if (priceBeforeTax !== undefined) priceMinor = Math.round(priceBeforeTax * 100);
        else if (priceIncludingTax !== undefined) {
          const taxCategoryId = newTaxCategoryName ? refs.taxCategoryId! : current.taxCategoryId;
          const [tax] = await tx
            .select({ rate: taxCategories.rateBasisPoints })
            .from(taxCategories)
            .where(
              and(
                eq(taxCategories.id, taxCategoryId),
                eq(taxCategories.restaurantId, proposal.restaurantId),
                isNull(taxCategories.archivedAt),
              ),
            )
            .limit(1);
          if (!tax)
            throw new ApiError(
              409,
              "NORA_TARGET_CHANGED",
              "The selected tax category no longer exists. Ask Nora to refresh the menu setup.",
            );
          priceMinor = priceMinorFromTaxIncluded(priceIncludingTax, tax.rate);
        }
        const [updated] = await tx
          .update(products)
          .set({
            ...rest,
            ...(newName !== undefined ? { name: newName } : {}),
            ...(newCategoryName ? { categoryId: refs.categoryId! } : {}),
            ...(newTaxCategoryName ? { taxCategoryId: refs.taxCategoryId! } : {}),
            ...(priceMinor !== undefined ? { priceMinor } : {}),
            updatedAt: now,
          })
          .where(
            and(
              eq(products.id, productId),
              eq(products.restaurantId, proposal.restaurantId),
              isNull(products.archivedAt),
            ),
          )
          .returning({ id: products.id });
        if (!updated)
          throw new ApiError(
            409,
            "NORA_TARGET_CHANGED",
            "The menu item no longer exists. Ask Nora to refresh the menu.",
          );
      } else if (proposal.action === "delete.menu.item") {
        proposalSchemas.propose_delete_menu_item.parse(payload);
        const productId = refs.productId!;
        const [archived] = await tx
          .update(products)
          .set({ archivedAt: now, updatedAt: now })
          .where(
            and(
              eq(products.id, productId),
              eq(products.restaurantId, proposal.restaurantId),
              isNull(products.archivedAt),
            ),
          )
          .returning({ id: products.id });
        if (!archived)
          throw new ApiError(
            409,
            "NORA_TARGET_CHANGED",
            "The menu item no longer exists. Ask Nora to refresh the menu.",
          );
      } else if (proposal.action === "create.table") {
        const parsed = proposalSchemas.propose_create_table.parse(payload),
          rawCode = randomToken(18);
        await tx.insert(diningTables).values({
          id: createId("table"),
          restaurantId: proposal.restaurantId,
          name: parsed.name,
          capacity: parsed.capacity,
          shape: parsed.shape,
          position: { x: parsed.x, y: parsed.y, z: parsed.z },
          rotation: Math.round(parsed.rotation),
          status: parsed.status,
          codeHash: await sha256(rawCode),
          codeDisplay: rawCode,
          linked: parsed.linked,
          width: parsed.width ? Math.round(parsed.width * 100) : null,
          depth: parsed.depth ? Math.round(parsed.depth * 100) : null,
        });
        await tx
          .update(floorLayouts)
          .set({ revision: sql`${floorLayouts.revision} + 1`, updatedBy: userId, updatedAt: now })
          .where(eq(floorLayouts.restaurantId, proposal.restaurantId));
      } else if (proposal.action === "update.table") {
        const parsed = proposalSchemas.propose_update_table.parse(payload),
          { tableName: _tableName, newName, x, y, z, rotation, width, depth, ...rest } = parsed,
          tableId = refs.tableId!;
        const patch = { ...rest, ...(newName !== undefined ? { name: newName } : {}) };
        const [table] = await tx
          .select({ position: diningTables.position })
          .from(diningTables)
          .where(
            and(eq(diningTables.id, tableId), eq(diningTables.restaurantId, proposal.restaurantId)),
          )
          .limit(1);
        const old = (table?.position ?? { x: 0, y: 0, z: 0 }) as {
          x: number;
          y: number;
          z: number;
        };
        const [updated] = await tx
          .update(diningTables)
          .set({
            ...patch,
            ...(rotation !== undefined ? { rotation: Math.round(rotation) } : {}),
            ...(width !== undefined
              ? { width: width === null ? null : Math.round(width * 100) }
              : {}),
            ...(depth !== undefined
              ? { depth: depth === null ? null : Math.round(depth * 100) }
              : {}),
            ...(x !== undefined || y !== undefined || z !== undefined
              ? { position: { x: x ?? old.x, y: y ?? old.y, z: z ?? old.z } }
              : {}),
            updatedAt: now,
          })
          .where(
            and(eq(diningTables.id, tableId), eq(diningTables.restaurantId, proposal.restaurantId)),
          )
          .returning({ id: diningTables.id });
        if (!updated)
          throw new ApiError(
            409,
            "NORA_TARGET_CHANGED",
            "The table no longer exists. Ask Nora to refresh the floor plan.",
          );
        await tx
          .update(floorLayouts)
          .set({ revision: sql`${floorLayouts.revision} + 1`, updatedBy: userId, updatedAt: now })
          .where(eq(floorLayouts.restaurantId, proposal.restaurantId));
      } else if (proposal.action === "delete.table") {
        proposalSchemas.propose_delete_table.parse(payload);
        const tableId = refs.tableId!;
        try {
          const [deleted] = await tx
            .delete(diningTables)
            .where(
              and(
                eq(diningTables.id, tableId),
                eq(diningTables.restaurantId, proposal.restaurantId),
              ),
            )
            .returning({ id: diningTables.id });
          if (!deleted)
            throw new ApiError(
              409,
              "NORA_TARGET_CHANGED",
              "The table no longer exists. Ask Nora to refresh the floor plan.",
            );
        } catch (error) {
          if ((error as { code?: string }).code === "23503")
            throw new ApiError(
              409,
              "NORA_TABLE_HAS_HISTORY",
              "This table has reservation or order history and cannot be deleted. Ask Nora to unlink it instead.",
            );
          throw error;
        }
        await tx
          .update(floorLayouts)
          .set({ revision: sql`${floorLayouts.revision} + 1`, updatedBy: userId, updatedAt: now })
          .where(eq(floorLayouts.restaurantId, proposal.restaurantId));
      } else if (proposal.action === "create.reservation") {
        const parsed = proposalSchemas.propose_create_reservation.parse(payload);
        const tableId = refs.tableId!;
        await tx.execute(
          sql`select id from dining_tables where id = ${tableId} and restaurant_id = ${proposal.restaurantId} for update`,
        );
        const [[restaurant], [settings], [table]] = await Promise.all([
          tx
            .select({
              name: restaurants.name,
              timezone: restaurants.timezone,
              reservationsEnabled: restaurants.reservationsEnabled,
            })
            .from(restaurants)
            .where(eq(restaurants.id, proposal.restaurantId))
            .limit(1),
          tx
            .select()
            .from(reservationSettings)
            .where(eq(reservationSettings.restaurantId, proposal.restaurantId))
            .limit(1),
          tx
            .select()
            .from(diningTables)
            .where(
              and(
                eq(diningTables.id, tableId),
                eq(diningTables.restaurantId, proposal.restaurantId),
              ),
            )
            .limit(1),
        ]);
        if (!restaurant || !settings || !table)
          throw new ApiError(
            409,
            "NORA_TARGET_CHANGED",
            "The restaurant booking setup changed. Ask Nora to refresh it.",
          );
        if (!restaurant.reservationsEnabled)
          throw new ApiError(
            409,
            "RESERVATIONS_DISABLED",
            "Reservations are disabled for this restaurant.",
          );
        if (!table.linked || table.status !== "available")
          throw new ApiError(
            409,
            "TABLE_UNAVAILABLE",
            "The selected table is not available for reservations.",
          );
        if (table.capacity < parsed.partySize)
          throw new ApiError(
            422,
            "TABLE_CAPACITY_EXCEEDED",
            "The selected table is too small for this party.",
          );
        const interval = assertWithinHours(
          parsed.date,
          parsed.startTime,
          settings.maxStayMinutes,
          restaurant.timezone,
          {
            maxStayMinutes: settings.maxStayMinutes,
            slotMinutes: settings.slotMinutes,
            is24_7: settings.is24_7,
            weeklyHours: settings.weeklyHours as ReservationSettingsValue["weeklyHours"],
          },
        );
        const [conflict] = await tx
          .select({ id: reservations.id })
          .from(reservations)
          .where(
            and(
              eq(reservations.tableId, table.id),
              inArray(reservations.status, ["confirmed", "seated"]),
              lt(reservations.startAt, interval.endAt),
              gt(reservations.endAt, interval.startAt),
            ),
          )
          .limit(1);
        if (conflict)
          throw new ApiError(
            409,
            "RESERVATION_CONFLICT",
            "That table is already booked for the requested time.",
          );
        const [created] = await tx
          .insert(reservations)
          .values({
            id: createId("res"),
            restaurantId: proposal.restaurantId,
            tableId: table.id,
            guestName: parsed.guestName,
            guestEmail: parsed.email,
            guestPhone: parsed.phone,
            partySize: parsed.partySize,
            serviceDate: parsed.date,
            localStartTime: parsed.startTime,
            localEndTime: interval.localEndTime,
            startAt: interval.startAt,
            endAt: interval.endAt,
            status: "confirmed",
            source: "staff",
            notes: parsed.notes,
          })
          .returning();
        if (created?.guestEmail)
          afterCommit = () => {
            void sendReservationConfirmation(created.guestEmail!, {
              reservationId: created.id,
              restaurantName: restaurant.name,
              guestName: created.guestName,
              date: created.serviceDate,
              startTime: created.localStartTime,
              partySize: created.partySize,
              startAt: created.startAt,
            }).catch((error) => console.error("Nora reservation confirmation failed", error));
          };
      } else if (proposal.action === "update.reservation") {
        const parsed = proposalSchemas.propose_update_reservation.parse(payload),
          {
            reservationGuestName: _reservationGuestName,
            reservationDate: _reservationDate,
            reservationStartTime: _reservationStartTime,
            newGuestName,
            email,
            phone,
            ...patch
          } = parsed,
          reservationId = refs.reservationId!;
        const [updated] = await tx
          .update(reservations)
          .set({
            ...patch,
            ...(newGuestName !== undefined ? { guestName: newGuestName } : {}),
            ...(email !== undefined ? { guestEmail: email } : {}),
            ...(phone !== undefined ? { guestPhone: phone } : {}),
            updatedAt: now,
          })
          .where(
            and(
              eq(reservations.id, reservationId),
              eq(reservations.restaurantId, proposal.restaurantId),
            ),
          )
          .returning({ id: reservations.id });
        if (!updated)
          throw new ApiError(
            409,
            "NORA_TARGET_CHANGED",
            "The reservation no longer exists. Ask Nora to refresh reservations.",
          );
      } else if (proposal.action === "reschedule.reservation") {
        const parsed = proposalSchemas.propose_reschedule_reservation.parse(payload);
        const reservationId = refs.reservationId!,
          tableId = refs.tableId!;
        await tx.execute(
          sql`select id from reservations where id = ${reservationId} and restaurant_id = ${proposal.restaurantId} for update`,
        );
        await tx.execute(
          sql`select id from dining_tables where id = ${tableId} and restaurant_id = ${proposal.restaurantId} for update`,
        );
        const [[current], [restaurant], [settings], [table]] = await Promise.all([
          tx
            .select()
            .from(reservations)
            .where(
              and(
                eq(reservations.id, reservationId),
                eq(reservations.restaurantId, proposal.restaurantId),
              ),
            )
            .limit(1),
          tx
            .select({ name: restaurants.name, timezone: restaurants.timezone })
            .from(restaurants)
            .where(eq(restaurants.id, proposal.restaurantId))
            .limit(1),
          tx
            .select()
            .from(reservationSettings)
            .where(eq(reservationSettings.restaurantId, proposal.restaurantId))
            .limit(1),
          tx
            .select()
            .from(diningTables)
            .where(
              and(
                eq(diningTables.id, tableId),
                eq(diningTables.restaurantId, proposal.restaurantId),
              ),
            )
            .limit(1),
        ]);
        if (!current || !restaurant || !settings || !table)
          throw new ApiError(
            409,
            "NORA_TARGET_CHANGED",
            "The reservation booking setup changed. Ask Nora to refresh it.",
          );
        if (["cancelled", "completed"].includes(current.status))
          throw new ApiError(
            409,
            "RESERVATION_NOT_RESCHEDULABLE",
            "Cancelled or completed reservations cannot be rescheduled.",
          );
        if (!table.linked || table.status !== "available")
          throw new ApiError(
            409,
            "TABLE_UNAVAILABLE",
            "The selected table is not available for reservations.",
          );
        if (table.capacity < current.partySize)
          throw new ApiError(
            422,
            "TABLE_CAPACITY_EXCEEDED",
            "The selected table is too small for this party.",
          );
        const interval = assertWithinHours(
          parsed.newDate,
          parsed.newStartTime,
          settings.maxStayMinutes,
          restaurant.timezone,
          {
            maxStayMinutes: settings.maxStayMinutes,
            slotMinutes: settings.slotMinutes,
            is24_7: settings.is24_7,
            weeklyHours: settings.weeklyHours as ReservationSettingsValue["weeklyHours"],
          },
        );
        const [conflict] = await tx
          .select({ id: reservations.id })
          .from(reservations)
          .where(
            and(
              eq(reservations.tableId, table.id),
              ne(reservations.id, current.id),
              inArray(reservations.status, ["confirmed", "seated"]),
              lt(reservations.startAt, interval.endAt),
              gt(reservations.endAt, interval.startAt),
            ),
          )
          .limit(1);
        if (conflict)
          throw new ApiError(
            409,
            "RESERVATION_CONFLICT",
            "That table is already booked for the requested time.",
          );
        const [updated] = await tx
          .update(reservations)
          .set({
            tableId: table.id,
            serviceDate: parsed.newDate,
            localStartTime: parsed.newStartTime,
            localEndTime: interval.localEndTime,
            startAt: interval.startAt,
            endAt: interval.endAt,
            updatedAt: now,
          })
          .where(eq(reservations.id, current.id))
          .returning();
        if (updated?.guestEmail)
          afterCommit = () => {
            void sendReservationRescheduled(updated.guestEmail!, {
              reservationId: updated.id,
              restaurantName: restaurant.name,
              guestName: updated.guestName,
              date: updated.serviceDate,
              startTime: updated.localStartTime,
              partySize: updated.partySize,
              startAt: updated.startAt,
            }).catch((error) => console.error("Nora reservation reschedule email failed", error));
          };
      } else if (proposal.action === "cancel.reservation") {
        proposalSchemas.propose_cancel_reservation.parse(payload);
        const reservationId = refs.reservationId!;
        const [restaurant] = await tx
          .select({ name: restaurants.name })
          .from(restaurants)
          .where(eq(restaurants.id, proposal.restaurantId))
          .limit(1);
        const [cancelled] = await tx
          .update(reservations)
          .set({ status: "cancelled", cancelledAt: now, cancelledBy: userId, updatedAt: now })
          .where(
            and(
              eq(reservations.id, reservationId),
              eq(reservations.restaurantId, proposal.restaurantId),
              ne(reservations.status, "cancelled"),
            ),
          )
          .returning();
        if (!cancelled)
          throw new ApiError(
            409,
            "NORA_TARGET_CHANGED",
            "The reservation no longer exists or is already cancelled. Ask Nora to refresh reservations.",
          );
        if (cancelled.guestEmail)
          afterCommit = () => {
            void sendReservationCancellation(cancelled.guestEmail!, {
              reservationId: cancelled.id,
              restaurantName: restaurant?.name ?? "Astron restaurant",
              guestName: cancelled.guestName,
              date: cancelled.serviceDate,
              startTime: cancelled.localStartTime,
              partySize: cancelled.partySize,
            }).catch((error) => console.error("Nora reservation cancellation email failed", error));
          };
      } else if (proposal.action === "update.reservation.settings") {
        const parsed = proposalSchemas.propose_update_reservation_settings.parse(payload);
        const [updated] = await tx
          .update(reservationSettings)
          .set({ ...parsed, updatedAt: now })
          .where(eq(reservationSettings.restaurantId, proposal.restaurantId))
          .returning({ restaurantId: reservationSettings.restaurantId });
        if (!updated)
          throw new ApiError(409, "NORA_TARGET_CHANGED", "Reservation settings no longer exist.");
      } else if (proposal.action === "update.restaurant") {
        const parsed = proposalSchemas.propose_update_restaurant.parse(payload);
        await tx
          .update(restaurants)
          .set({ ...parsed, updatedAt: now })
          .where(eq(restaurants.id, proposal.restaurantId));
      } else
        throw new ApiError(
          400,
          "UNSUPPORTED_NORA_ACTION",
          "This proposed action is not supported.",
        );
      await tx
        .update(assistantActionProposals)
        .set({ status: "executed", updatedAt: now })
        .where(eq(assistantActionProposals.id, proposal.id));
      await tx.insert(auditLogs).values({
        restaurantId: proposal.restaurantId,
        actorUserId: userId,
        action: `assistant.${proposal.action}`,
        entityType: "assistant_action_proposal",
        entityId: proposal.id,
        metadata: { payload },
      });
    });
    afterCommit?.();
    return { ...proposal, status: "executed" as const };
  } catch (error) {
    await db
      .update(assistantActionProposals)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(assistantActionProposals.id, proposal.id));
    if ((error as { code?: string }).code === "23P01")
      throw new ApiError(
        409,
        "RESERVATION_CONFLICT",
        "That table was booked at the same time. Ask Nora to refresh reservations and choose another slot.",
      );
    throw error;
  }
}
