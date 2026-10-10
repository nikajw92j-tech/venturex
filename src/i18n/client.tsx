"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { translate, type Dict, type TKey } from "./dictionaries";
import { displayMoney, type CurrencyCode, type Rates } from "@/lib/money";

type Ctx = {
  locale: Locale;
  dict: Dict;
  currency: CurrencyCode;
  rates: Rates;
  ratesApproximate: boolean;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children, ...value }: Ctx & { children: React.ReactNode }) {
  const memo = useMemo(() => value, [value.locale, value.currency, value.rates, value.dict, value.ratesApproximate]); // eslint-disable-line react-hooks/exhaustive-deps
  return <I18nContext.Provider value={memo}>{children}</I18nContext.Provider>;
}

function useCtx() {
  const c = useContext(I18nContext);
  if (!c) throw new Error("I18nProvider missing");
  return c;
}

export function useT() {
  const { dict } = useCtx();
  return (key: TKey, params?: Record<string, string | number>) => translate(dict, key, params);
}

export function useLocale() {
  return useCtx().locale;
}

/** Formats contract amounts in the viewer's display currency, keeping the original visible. */
export function useMoney() {
  const { currency, rates, locale } = useCtx();
  return (amountMinor: number, original: CurrencyCode, opts: { compact?: boolean } = {}) =>
    displayMoney(amountMinor, original, currency, rates, { locale, ...opts });
}

export function useDisplayCurrency() {
  const { currency, rates, ratesApproximate } = useCtx();
  return { currency, rates, ratesApproximate };
}
