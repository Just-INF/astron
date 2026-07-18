export function currencyLocale(language = "en"): string {
  return { en: "en-GB", ro: "ro-RO", fr: "fr-FR", de: "de-DE", es: "es-ES" }[language] ?? "en-GB";
}

export function formatCurrency(
  value: number,
  currency = "EUR",
  language = "en",
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(currencyLocale(language), {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
}
