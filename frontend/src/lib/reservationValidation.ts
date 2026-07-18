/**
 * Shared guard for both steps of the guest reservation flow. Keeping this
 * independent of React makes expiry/release behaviour straightforward to test.
 */
export function tableSelectionError(
  selectedTableId: string | null,
  bookableTableIds: Iterable<string>,
): string | null {
  const ids = new Set(bookableTableIds);
  if (!selectedTableId) return "Please select a table to continue.";
  if (!ids.has(selectedTableId))
    return "That table is no longer available. Please select another table.";
  return null;
}
