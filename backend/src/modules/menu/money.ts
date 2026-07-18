export function taxMinor(subtotalMinor: number, rateBasisPoints: number): number {
  return Math.round((subtotalMinor * rateBasisPoints) / 10_000);
}

export function totalMinor(subtotalMinor: number, rateBasisPoints: number): number {
  return subtotalMinor + taxMinor(subtotalMinor, rateBasisPoints);
}
