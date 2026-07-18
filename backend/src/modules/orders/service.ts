export type KitchenItemStatus = "not_taken" | "preparing" | "done";
export type OperationalOrderStatus = "new" | "in_progress" | "ready";

export function deriveOrderStatus(statuses: readonly KitchenItemStatus[]): OperationalOrderStatus {
  if (statuses.length === 0 || statuses.every((status) => status === "done")) return "ready";
  if (statuses.every((status) => status === "not_taken")) return "new";
  return "in_progress";
}

export function canAdvanceKitchenItem(
  current: KitchenItemStatus,
  next: KitchenItemStatus,
): boolean {
  return (
    (current === "not_taken" && next === "preparing") ||
    (current === "preparing" && next === "done")
  );
}

export function isActiveServiceRequestStatus(status: string): boolean {
  return status === "new" || status === "acknowledged";
}
