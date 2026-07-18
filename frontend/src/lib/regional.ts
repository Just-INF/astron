export interface RegionalOption {
  value: string;
  label: string;
}

function supportedValues(kind: "currency" | "timeZone"): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "currency" | "timeZone") => string[];
  };
  return intl.supportedValuesOf?.(kind) ?? [];
}

export function currencyOptions(language = "en"): RegionalOption[] {
  const names = new Intl.DisplayNames([language, "en"], { type: "currency" });
  return supportedValues("currency").map((currency) => {
    const symbol = new Intl.NumberFormat(language, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value;
    const name = names.of(currency) ?? currency;
    return {
      value: currency,
      label: `${currency} — ${name}${symbol && symbol !== currency ? ` (${symbol})` : ""}`,
    };
  });
}

export function timeZoneOptions(at = new Date()): RegionalOption[] {
  const zones = Array.from(new Set(["UTC", ...supportedValues("timeZone")])).sort();
  return zones.map((zone) => {
    const offset = new Intl.DateTimeFormat("en", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value;
    return { value: zone, label: `${zone.replaceAll("_", " ")} · ${offset ?? "UTC"}` };
  });
}

export function restaurantDateKey(timeZone = "UTC", at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

export function dateKeyParts(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return {
    year,
    month,
    day,
    weekday: date.getUTCDay(),
    date,
  };
}

export function formatDateKey(
  dateKey: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
    dateKeyParts(dateKey).date,
  );
}
