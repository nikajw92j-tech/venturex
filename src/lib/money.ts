// Shared (client + server) money helpers.
// All amounts are integers in minor units (1/100 of the currency unit).

export const CURRENCIES = ["USD", "GEL", "EUR", "RUB"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  USD: "$",
  GEL: "₾",
  EUR: "€",
  RUB: "₽",
};

/** Units of each currency per 1 USD. */
export type Rates = Record<CurrencyCode, number>;

/** Used only before the first successful rate fetch; flagged in the UI as approximate. */
export const FALLBACK_RATES: Rates = { USD: 1, GEL: 2.7, EUR: 0.92, RUB: 92 };

export function toMinor(major: number) {
  return Math.round(major * 100);
}

export function fromMinor(minor: number) {
  return minor / 100;
}

export function convert(amountMinor: number, from: CurrencyCode, to: CurrencyCode, rates: Rates) {
  if (from === to) return amountMinor;
  const usd = amountMinor / rates[from];
  return Math.round(usd * rates[to]);
}

export function toUsd(amountMinor: number, from: CurrencyCode, rates: Rates) {
  return convert(amountMinor, from, "USD", rates);
}

const localeMap: Record<string, string> = { en: "en-US", ka: "ka-GE", ru: "ru-RU" };

export function formatMoney(
  amountMinor: number,
  currency: CurrencyCode,
  opts: { locale?: string; compact?: boolean; cents?: boolean } = {},
) {
  const value = amountMinor / 100;
  const compact = Boolean(opts.compact && Math.abs(value) >= 10000);
  const fmt = new Intl.NumberFormat(localeMap[opts.locale ?? "en"] ?? "en-US", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: opts.cents ? 2 : compact ? 1 : 0,
    minimumFractionDigits: opts.cents ? 2 : 0,
  });
  return fmt.format(value);
}

/**
 * Formats an amount for display in the viewer's preferred currency.
 * The original (contractual) amount is always returned too so the UI can show it
 * — switching display currency must never hide what the buyer actually pays.
 */
export function displayMoney(
  amountMinor: number,
  currency: CurrencyCode,
  display: CurrencyCode,
  rates: Rates,
  opts: { locale?: string; compact?: boolean } = {},
) {
  const original = formatMoney(amountMinor, currency, opts);
  if (display === currency) return { primary: original, original, converted: false };
  const converted = formatMoney(convert(amountMinor, currency, display, rates), display, opts);
  return { primary: `≈ ${converted}`, original, converted: true };
}
