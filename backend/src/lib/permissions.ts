export type MembershipRole =
  | "owner"
  | "manager"
  | "host"
  | "waiter"
  | "chef"
  | "menu-editor"
  | "viewer";
export type Permission =
  | "restaurant:read"
  | "restaurant:update"
  | "members:read"
  | "members:write"
  | "menu:read"
  | "menu:write"
  | "menu:publish"
  | "theme:custom-css"
  | "layout:read"
  | "layout:write"
  | "layout:publish"
  | "reservations:read"
  | "reservations:write"
  | "reservations:delete"
  | "reservations:publish"
  | "orders:read"
  | "orders:write"
  | "orders:complete"
  | "service-requests:read"
  | "service-requests:write"
  | "kitchen:read"
  | "kitchen:write"
  | "analytics:read"
  | "media:write"
  | "assistant:use";

const permissions: Record<MembershipRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    "restaurant:read",
    "restaurant:update",
    "members:read",
    "members:write",
    "menu:read",
    "menu:write",
    "menu:publish",
    "theme:custom-css",
    "layout:read",
    "layout:write",
    "layout:publish",
    "reservations:read",
    "reservations:write",
    "reservations:delete",
    "reservations:publish",
    "orders:read",
    "orders:write",
    "orders:complete",
    "service-requests:read",
    "service-requests:write",
    "kitchen:read",
    "kitchen:write",
    "analytics:read",
    "media:write",
    "assistant:use",
  ]),
  manager: new Set<Permission>([
    "restaurant:read",
    "restaurant:update",
    "members:read",
    "members:write",
    "menu:read",
    "menu:write",
    "menu:publish",
    "theme:custom-css",
    "layout:read",
    "layout:write",
    "layout:publish",
    "reservations:read",
    "reservations:write",
    "reservations:delete",
    "reservations:publish",
    "orders:read",
    "orders:write",
    "orders:complete",
    "service-requests:read",
    "service-requests:write",
    "kitchen:read",
    "kitchen:write",
    "analytics:read",
    "media:write",
    "assistant:use",
  ]),
  host: new Set<Permission>([
    "restaurant:read",
    "members:read",
    "menu:read",
    "layout:read",
    "reservations:read",
    "reservations:write",
    "orders:read",
    "orders:write",
    "orders:complete",
    "service-requests:read",
    "service-requests:write",
    "analytics:read",
  ]),
  waiter: new Set<Permission>([
    "restaurant:read",
    "menu:read",
    "layout:read",
    "reservations:read",
    "reservations:write",
    "orders:read",
    "orders:write",
    "orders:complete",
    "service-requests:read",
    "service-requests:write",
  ]),
  chef: new Set<Permission>([
    "restaurant:read",
    "menu:read",
    "layout:read",
    "orders:read",
    "kitchen:read",
    "kitchen:write",
  ]),
  "menu-editor": new Set<Permission>([
    "restaurant:read",
    "menu:read",
    "menu:write",
    "menu:publish",
    "layout:read",
    "media:write",
  ]),
  viewer: new Set<Permission>([
    "restaurant:read",
    "menu:read",
    "layout:read",
    "reservations:read",
    "analytics:read",
  ]),
};

export function can(role: MembershipRole, permission: Permission): boolean {
  return permissions[role].has(permission);
}
