export type NoraHelpTopic = {
  id: string;
  title: string;
  keywords: string[];
  route: string;
  summary: string;
  steps: string[];
};

export const noraHelpTopics: NoraHelpTopic[] = [
  {
    id: "menu-categories",
    title: "Create and organize menu categories",
    keywords: ["menu", "category", "categories", "pizza", "course", "section"],
    route: "/dashboard/menu",
    summary:
      "Categories group dishes on the digital menu. Nora can create, rename, or archive them with approval.",
    steps: [
      "Open Digital menu.",
      "Choose Add category.",
      "Enter a name and optional description, then save.",
      "Use the category controls to rename, reorder, or archive it.",
    ],
  },
  {
    id: "menu-items",
    title: "Create and edit menu items",
    keywords: ["menu", "item", "dish", "product", "price", "food", "drink"],
    route: "/dashboard/menu",
    summary:
      "Each menu item needs a category, tax category, name, price, and availability state. Nora accepts either pre-tax or tax-included prices.",
    steps: [
      "Open Digital menu and choose Add item.",
      "Select its menu category and tax category.",
      "Enter the price before or after tax and review the calculated counterpart.",
      "Add a description, availability, dietary tags, and images as needed, then save.",
    ],
  },
  {
    id: "tax-categories",
    title: "Configure tax categories",
    keywords: ["tax", "vat", "rate", "included", "inclusive", "percentage"],
    route: "/dashboard/menu",
    summary:
      "Tax categories determine the guest-facing tax-included price. Nora can create and edit tax categories with approval.",
    steps: [
      "Open Digital menu.",
      "Find Tax categories and choose Add tax category.",
      "Enter a label such as Standard VAT and its percentage rate.",
      "Assign the tax category to menu items.",
    ],
  },
  {
    id: "floor-plan",
    title: "Build the floor plan and tables",
    keywords: ["table", "floor", "layout", "capacity", "seat", "qr"],
    route: "/dashboard/layout-editor",
    summary:
      "The floor-plan editor manages tables, capacity, position, shape, guest links, walls, and zones.",
    steps: [
      "Open Floor plan.",
      "Add or select a table and set its name, capacity, shape, and position.",
      "Draw walls or zones when needed.",
      "Save the layout, then publish the public floor-plan design when ready.",
    ],
  },
  {
    id: "reservations",
    title: "Manage reservations",
    keywords: ["reservation", "booking", "guest", "reschedule", "cancel", "hours"],
    route: "/dashboard/reservations",
    summary:
      "The reservations workspace manages bookings, opening hours, slot length, stay duration, and the public booking page.",
    steps: [
      "Open Reservations.",
      "Use the board to create, edit, reschedule, seat, complete, or cancel a booking.",
      "Configure weekly opening hours and booking duration in reservation settings.",
      "Publish the reservation experience after reviewing its preview.",
    ],
  },
  {
    id: "orders-service-kitchen",
    title: "Run orders, service requests, and kitchen work",
    keywords: ["order", "service", "waiter", "check", "kitchen", "chef", "ticket"],
    route: "/dashboard/orders",
    summary:
      "Operational screens cover active orders, waiter calls and check requests, and preparation progress.",
    steps: [
      "Open Orders for active table orders and history.",
      "Use Service requests to acknowledge and complete guest calls.",
      "Use Kitchen to claim preparation items and mark them done.",
      "Complete an order after every preparation item is finished.",
    ],
  },
  {
    id: "restaurant-settings",
    title: "Update restaurant settings",
    keywords: [
      "restaurant",
      "settings",
      "name",
      "currency",
      "timezone",
      "language",
      "logo",
      "feature",
    ],
    route: "/dashboard/settings",
    summary:
      "Restaurant settings control identity, regional details, branding, guest features, and team access.",
    steps: [
      "Open Restaurant settings.",
      "Update identity and regional settings such as currency and timezone.",
      "Configure guest reservation, call-waiter, and request-check features.",
      "Save changes and review the public experiences.",
    ],
  },
  {
    id: "team",
    title: "Invite and manage team members",
    keywords: ["team", "member", "invite", "role", "permission", "staff"],
    route: "/dashboard/settings",
    summary: "Owners and managers can invite staff and assign roles with scoped permissions.",
    steps: [
      "Open Restaurant settings and find Team.",
      "Invite a staff email address.",
      "Assign the smallest role that fits their work.",
      "Revoke invitations or remove access when it is no longer needed.",
    ],
  },
  {
    id: "ai-mcp",
    title: "Connect an MCP client",
    keywords: ["nora", "ai", "mcp", "integration", "key", "credential", "client"],
    route: "/dashboard/settings/mcp",
    summary:
      "MCP clients use restaurant-scoped credentials. Reads are permission checked and writes become approval cards in Nora.",
    steps: [
      "Open AI & MCP.",
      "Generate a named credential and copy it immediately.",
      "Add the endpoint and bearer credential to the trusted MCP client.",
      "Review every proposed write in Nora and revoke unused credentials.",
    ],
  },
  {
    id: "billing",
    title: "Manage billing",
    keywords: ["billing", "subscription", "payment", "plan", "lemon", "invoice"],
    route: "/account/billing",
    summary: "Billing uses Lemon Squeezy for secure subscription checkout and payment processing.",
    steps: [
      "Open Account billing.",
      "Choose a plan and complete secure checkout.",
      "Return to Astron and confirm the subscription status has synchronized.",
      "Payment receipts are sent to the billing email.",
    ],
  },
];

export function searchNoraHelp(query: string, limit = 5): NoraHelpTopic[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const ranked = noraHelpTopics
    .map((topic) => {
      const title = topic.title.toLowerCase(),
        haystack = `${title} ${topic.keywords.join(" ")} ${topic.summary.toLowerCase()}`;
      const score = terms.reduce(
        (total, term) =>
          total +
          (title.includes(term) ? 4 : 0) +
          (topic.keywords.some((keyword) => keyword.includes(term) || term.includes(keyword))
            ? 3
            : 0) +
          (haystack.includes(term) ? 1 : 0),
        0,
      );
      return { topic, score };
    })
    .filter(({ score }) => !terms.length || score > 0)
    .sort((a, b) => b.score - a.score || a.topic.title.localeCompare(b.topic.title));
  return ranked.slice(0, limit).map(({ topic }) => topic);
}
