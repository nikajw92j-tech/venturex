export const LOCALES = ["en", "ka", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "vx_locale";
export const CURRENCY_COOKIE = "vx_currency";

export const LOCALE_LABELS: Record<Locale, { short: string; name: string }> = {
  en: { short: "EN", name: "English" },
  ka: { short: "ქა", name: "ქართული" },
  ru: { short: "RU", name: "Русский" },
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}
