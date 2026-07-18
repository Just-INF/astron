export interface RevenuePoint {
  date: string;
  label: string;
  revenue: number;
  orders: number;
}
export interface BarPoint {
  name: string;
  value: number;
  secondary?: number;
}
export const peakDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const peakTimes = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, "0")}:00`,
);

export function replaceAnalyticsData<T>(data: T): T {
  return data;
}
