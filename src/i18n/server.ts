import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { CURRENCY_COOKIE, DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { dictionaries, translate, type Dict, type TKey } from "./dictionaries";
import { CURRENCIES, type CurrencyCode } from "@/lib/money";

export const getLocale = cache(async (): Promise<Locale> => {
  const jar = await cookies();
  const c = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
});

export const getDisplayCurrency = cache(async (): Promise<CurrencyCode> => {
  const jar = await cookies();
  const c = jar.get(CURRENCY_COOKIE)?.value;
  if (c && (CURRENCIES as readonly string[]).includes(c)) return c as CurrencyCode;
  const locale = await getLocale();
  return locale === "ka" ? "GEL" : locale === "ru" ? "RUB" : "USD";
});

export const getI18n = cache(async () => {
  const locale = await getLocale();
  const dict: Dict = dictionaries[locale];
  const t = (key: TKey, params?: Record<string, string | number>) => translate(dict, key, params);
  return { locale, t, dict };
});
